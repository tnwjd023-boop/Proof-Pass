import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRegisteredMandate } from '../src/midnight/mandate-adapter.mjs';
const bytes = n => new Uint8Array(32).fill(n);
const hex = n => Buffer.from(bytes(n)).toString('hex');
function fixture() {
  const mandate = { version: 1n, subject: bytes(1), owner: bytes(2), agentKey: bytes(3), destinationCluster: bytes(4),
    programId: bytes(5), vault: bytes(6), recipient: bytes(7), assetId: bytes(0), maxPerTx: 50000000n,
    mandateEpoch: 3n, notBefore: 100n, expiresAt: 500n, salt: bytes(8) };
  const registered = { owner: hex(2), agent: hex(3), commitment: hex(9), sourceHandle: hex(10), epoch: 3n,
    notBefore: 100n, expiresAt: 500n, active: true };
  return { mandate, registered, commitment: () => bytes(9) };
}
test('mandate adapter requires exact registered owner approval, epoch, commitment and source binding', () => {
  const f = fixture();
  assert.equal(validateRegisteredMandate(f.mandate, f.registered, hex(10), 200n, f.commitment), f.mandate);
  for (const [field, value] of [['owner', hex(99)], ['agent', hex(99)], ['commitment', hex(99)], ['sourceHandle', hex(99)],
    ['epoch', 2n], ['notBefore', 99n], ['expiresAt', 501n], ['active', false]]) {
    assert.throws(() => validateRegisteredMandate(f.mandate, { ...f.registered, [field]: value }, hex(10), 200n, f.commitment), field);
  }
  assert.throws(() => validateRegisteredMandate(f.mandate, f.registered, hex(10), 500n, f.commitment));
  assert.throws(() => validateRegisteredMandate(f.mandate, f.registered, hex(10), 99n, f.commitment));
});
