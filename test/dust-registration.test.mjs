import test from 'node:test';
import assert from 'node:assert/strict';
import { registerDust } from '../src/midnight/dust-registration.mjs';

test('DUST registration persists exact finalized transaction before broadcast and refuses an uncertain retry', async () => {
  let journal, submissions = 0;
  const tx = { serialize: () => Uint8Array.of(1, 2), identifiers: () => ['tx-id'] };
  const context = { wallet: {
    registerNightUtxosForDustGeneration: async () => ({}), finalizeRecipe: async () => tx,
    submitTransaction: async () => { assert.equal(journal.status, 'submitting'); assert.deepEqual(journal.transaction, Uint8Array.of(1, 2)); submissions++; throw Error('Connection lost'); } },
    unshieldedKeystore: { getPublicKey: () => 'public-key', signData: () => 'signature' } };
  const options = { context, availableCoins: [{ meta: { registeredForDustGeneration: false } }], dustBalance: 0n,
    load: async () => journal, save: async (_, value) => { journal = structuredClone(value); }, waitForDust: async () => {}, log() {} };
  await assert.rejects(registerDust(options), /Connection lost/);
  await assert.rejects(registerDust(options), /reconciliation/);
  assert.equal(submissions, 1);
});

test('confirmed DUST state does not generate another registration', async () => {
  await registerDust({ availableCoins: [{ meta: { registeredForDustGeneration: true } }], dustBalance: 1n });
});
