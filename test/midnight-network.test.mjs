import test from 'node:test';
import assert from 'node:assert/strict';
import * as networks from '../src/midnight/network.mjs';
test('Preprod isolates wallet/state/evidence and pins the observed public genesis', () => {
  assert.equal(typeof networks.networkProfile, 'function');
  const local = networks.networkProfile('undeployed');
  const publicNetwork = networks.networkProfile('preprod');
  assert.notEqual(local.privateDirectory, publicNetwork.privateDirectory);
  assert.notEqual(local.evidenceDirectory, publicNetwork.evidenceDirectory);
  assert.notEqual(local.intentDirectory, publicNetwork.intentDirectory);
  assert.equal(publicNetwork.node, 'https://rpc.preprod.midnight.network');
  assert.equal(publicNetwork.genesisHash, '0xdf831b09a8baa92badf47762ce5ac439b7e47e3ed3d39600cfdd44fad552361b');
  assert.equal(publicNetwork.allowDevelopmentSeed, false);
  assert.equal(local.allowDevelopmentSeed, true);
  assert.throws(() => networks.networkProfile('mainnet'));
  assert.throws(() => networks.networkProfile('../../private/live'));
});
