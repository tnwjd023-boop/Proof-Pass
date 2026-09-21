import assert from 'node:assert/strict';
export function validateWalletSnapshot(snapshot, expected) {
  for (const key of ['network', 'genesis', 'address']) assert.equal(snapshot[key], expected[key], 'Wallet snapshot ' + key + ' mismatch');
  for (const key of ['shielded', 'unshielded', 'dust']) {
    assert.equal(typeof snapshot[key], 'string', 'Incomplete wallet snapshot');
    const state = JSON.parse(snapshot[key]);
    assert.equal(state.networkId, expected.network, 'SDK snapshot network mismatch');
  }
  return snapshot;
}
