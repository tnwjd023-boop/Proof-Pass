import test from 'node:test';
import assert from 'node:assert/strict';
import * as recovery from '../src/flow-recovery.mjs';

test('payment reconciliation verifies original transaction deltas without another transfer', () => {
  assert.equal(typeof recovery.verifyPaymentReceipt, 'function');
  const tx = { transaction: { signatures: ['sig'], message: { accountKeys: ['agent', 'vault', 'recipient'] } },
    meta: { err: null, preBalances: [900, 200, 100], postBalances: [895, 150, 150] } };
  const expected = { signature: 'sig', vault: 'vault', recipient: 'recipient', amount: 50, error: null };
  assert.deepEqual(recovery.verifyPaymentReceipt(tx, expected), { vaultDelta: -50, recipientDelta: 50 });
  for (const mutation of [t => { t.meta.postBalances[1] = 100; }, t => { t.transaction.signatures = ['other']; },
    t => { t.meta.err = { InstructionError: [0, 'Custom'] }; }, t => { t.transaction.message.accountKeys[1] = 'other'; }]) {
    const changed = structuredClone(tx); mutation(changed);
    assert.throws(() => recovery.verifyPaymentReceipt(changed, expected));
  }
});

test('durable phases recover after payment, revocation, deletion and report interruption', async () => {
  assert.equal(typeof recovery.checkpoint, 'function');
  for (const interruption of ['payment', 'revoke', 'delete', 'report']) {
    let disk = {}, payments = 0, interrupted = false;
    const receipts = new Map();
    const execute = async () => {
      const state = structuredClone(disk);
      for (const name of ['payment', 'revoke', 'delete', 'report']) {
        await recovery.checkpoint(state, name, async () => {
          if (!receipts.has(name)) { receipts.set(name, { id: name }); if (name === 'payment') payments++; }
          if (name === interruption && !interrupted) { interrupted = true; throw Error('interrupted after confirmation'); }
          return receipts.get(name);
        }, async () => { disk = structuredClone(state); });
      }
      return state;
    };
    await assert.rejects(execute(), /interrupted/);
    const completed = await execute();
    assert.equal(payments, 1);
    assert.deepEqual(Object.keys(completed.phases), ['payment', 'revoke', 'delete', 'report']);
    await execute(); assert.equal(payments, 1);
  }
});
