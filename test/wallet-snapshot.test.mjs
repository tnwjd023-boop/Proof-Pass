import test from 'node:test';
import assert from 'node:assert/strict';
import * as snapshots from '../src/midnight/wallet-snapshot.mjs';
test('wallet restore rejects another network, genesis or account instead of resetting history', () => {
  assert.equal(typeof snapshots.validateWalletSnapshot, 'function');
  const expected = { network: 'preprod', genesis: 'abc', address: 'wallet-one' };
  const state = JSON.stringify({ networkId: 'preprod', state: 'sdk-serialized-state' });
  const snapshot = { ...expected, shielded: state, unshielded: state, dust: state };
  assert.equal(snapshots.validateWalletSnapshot(snapshot, expected), snapshot);
  for (const changed of [{ network: 'undeployed' }, { genesis: 'different' }, { address: 'wallet-two' },
    { dust: undefined }, { dust: JSON.stringify({ networkId: 'undeployed' }) }]) {
    assert.throws(() => snapshots.validateWalletSnapshot({ ...snapshot, ...changed }, expected));
  }
});
