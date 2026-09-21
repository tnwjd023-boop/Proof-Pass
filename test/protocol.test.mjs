import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { encodePayment, paymentHash, encodeBinding, bindingNonce } from '../src/protocol.mjs';
const request = JSON.parse(await readFile(new URL('fixtures/payment-v1.json', import.meta.url)));
const binding = { version: 1, sessionId: '01'.repeat(32), challenge: '02'.repeat(32), audienceHash: '03'.repeat(32),
  issuerPolicyId: '04'.repeat(32), xrplNetwork: 1, xrplAccount: '05'.repeat(20), solanaCluster: '06'.repeat(32),
  solanaOwner: '07'.repeat(32), issuedAt: '1800000000', expiresAt: '1800000300' };
test('payment bytes have a stable cross-language wire vector', () => {
  const golden = Buffer.from('PROOFPASS:AGENT_PAYMENT_AUTH:V1').toString('hex') + '0100' + '11'.repeat(32) + '01000000'
    + ['22','33','44','55','66','77','00'].map(b => b.repeat(32)).join('')
    + '80f0fa0200000000' + '88'.repeat(32) + '0700000000000000' + '00d2496b00000000';
  assert.equal(encodePayment(request).toString('hex'), golden);
  assert.equal(paymentHash(request), createHash('sha256').update(Buffer.from(golden, 'hex')).digest('hex'));
});
test('each destination, policy and value field changes the request hash', () => {
  const original = paymentHash(request);
  for (const [key, value] of Object.entries(request)) {
    if (key === 'version') continue;
    const changed = key === 'policyVersion' ? 2 : value.length === 64 ? '99'.repeat(32) : (BigInt(value) + 1n).toString();
    assert.notEqual(paymentHash({ ...request, [key]: changed }), original, key);
  }
});
test('ambiguous numbers and schema substitutions are rejected', () => {
  for (const value of [50000000, '050000000', '-1', '1.5', '1e6', '18446744073709551616', '0', null])
    assert.throws(() => encodePayment({ ...request, amountBaseUnits: value }));
  assert.doesNotThrow(() => encodePayment({ ...request, amountBaseUnits: '18446744073709551615' }));
  assert.throws(() => encodePayment({ ...request, extra: true }));
  assert.throws(() => encodePayment({ ...request, version: 2 }));
  assert.throws(() => encodePayment({ ...request, owner: 'AA'.repeat(32) }));
  assert.throws(() => encodePayment({ ...request, recipient: '11'.repeat(31) }));
});
test('OpenDID nonce binds all session fields and differs from payment domain', () => {
  const digest = createHash('sha256').update(encodeBinding(binding)).digest('hex').slice(0, 32);
  assert.equal(bindingNonce(binding), BigInt('0x' + digest).toString());
  for (const field of ['audienceHash','challenge','sessionId','solanaOwner','issuerPolicyId','solanaCluster'])
    assert.notEqual(bindingNonce({ ...binding, [field]: 'ff'.repeat(32) }), bindingNonce(binding));
  assert.notEqual(bindingNonce({ ...binding, xrplAccount: 'ff'.repeat(20) }), bindingNonce(binding));
  assert.notEqual(bindingNonce({ ...binding, expiresAt: '1800000301' }), bindingNonce(binding));
  assert.throws(() => encodeBinding({ ...binding, expiresAt: binding.issuedAt }));
});
