import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { toCompactPayment, fromCompactPayment, mapConfirmedAuthorization } from '../src/midnight/request.mjs';
import { paymentHash } from '../src/protocol.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/payment-v1.json', import.meta.url), 'utf8'));
test('strict canonical request maps to Compact fields without losing large integer precision', () => {
  const value = { ...fixture, amountBaseUnits: '18446744073709551615' };
  const compact = toCompactPayment(value);
  assert.equal(compact.amount, 18446744073709551615n);
  assert.deepEqual(fromCompactPayment(compact), value);
  assert.throws(() => toCompactPayment({ ...fixture, amountBaseUnits: 1 }));
  assert.throws(() => fromCompactPayment({ ...compact, unexpected: true }));
});

test('relay mapping requires the exact confirmed Compact commitment and output fields', () => {
  const hash = new Uint8Array(32).fill(77);
  // This is a boundary fixture, not a Compact hash implementation.
  const commitment = value => { assert.deepEqual(fromCompactPayment(value), fixture); return hash; };
  const output = { destinationCluster: Buffer.from(fixture.destinationCluster, 'hex'), programId: Buffer.from(fixture.programId, 'hex'),
    mandateCommitment: new Uint8Array(32).fill(5), mandateEpoch: BigInt(fixture.mandateEpoch),
    sourceHandle: new Uint8Array(32).fill(6), sourceEpoch: 2n, expiresAt: BigInt(fixture.expiresAt) };
  const mapped = mapConfirmedAuthorization(fixture, hash, output, commitment);
  assert.equal(mapped.requestHash, paymentHash(fixture));
  assert.equal(mapped.sourceEpoch, '2');
  assert.throws(() => mapConfirmedAuthorization(fixture, new Uint8Array(32), output, commitment));
  for (const field of ['destinationCluster', 'programId', 'expiresAt', 'mandateEpoch']) {
    const bad = { ...output, [field]: typeof output[field] === 'bigint' ? output[field] + 1n : new Uint8Array(32) };
    assert.throws(() => mapConfirmedAuthorization(fixture, hash, bad, commitment), field);
  }
});
