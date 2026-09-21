import assert from 'node:assert/strict';

export function verifyPaymentReceipt(tx, { signature, vault, recipient, amount, error }) {
  assert(tx?.meta, 'Confirmed transaction metadata unavailable');
  assert.equal(tx.transaction.signatures[0], signature, 'Wrong transaction receipt');
  assert.deepEqual(tx.meta.err, error);
  const keys = tx.transaction.message.accountKeys.map(k => k.toBase58?.() ?? k);
  const delta = address => {
    const i = keys.indexOf(address);
    assert(i >= 0, 'Payment account absent from receipt');
    assert(Number.isSafeInteger(tx.meta.preBalances[i]) && Number.isSafeInteger(tx.meta.postBalances[i]));
    return tx.meta.postBalances[i] - tx.meta.preBalances[i];
  };
  const result = { vaultDelta: delta(vault), recipientDelta: delta(recipient) };
  assert.deepEqual(result, { vaultDelta: error ? 0 : -amount, recipientDelta: error ? 0 : amount });
  return result;
}

// Each operation must reconcile its durable transaction intent if interrupted
// between chain confirmation and this local checkpoint.
export async function checkpoint(state, name, operation, persist) {
  state.phases ??= {};
  if (Object.hasOwn(state.phases, name)) return state.phases[name];
  const result = await operation();
  state.phases[name] = result;
  await persist();
  return result;
}
