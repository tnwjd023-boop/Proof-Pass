import assert from 'node:assert/strict';
import { encodePayment, paymentHash } from '../protocol.mjs';

const byteFields = ['policyId', 'destinationCluster', 'programId', 'owner', 'agentKey', 'vault', 'recipient', 'assetId', 'requestId'];
const intFields = ['version', 'policyVersion', 'mandateEpoch', 'expiresAt'];
const fields = [...byteFields, ...intFields, 'amount'].sort();
const hex = value => {
  assert(value instanceof Uint8Array && value.length === 32, 'Expected 32-byte commitment');
  return Buffer.from(value).toString('hex');
};
export function toCompactPayment(request) {
  encodePayment(request);
  return Object.fromEntries([...byteFields.map(key => [key, Uint8Array.from(Buffer.from(request[key], 'hex'))]),
    ...intFields.map(key => [key, BigInt(request[key])]), ['amount', BigInt(request.amountBaseUnits)]]);
}
export function fromCompactPayment(value) {
  assert(value && Object.getPrototypeOf(value) === Object.prototype);
  assert.deepEqual(Object.keys(value).sort(), fields, 'Unexpected Compact payment fields');
  for (const key of [...intFields, 'amount']) assert.equal(typeof value[key], 'bigint');
  const request = Object.fromEntries([...byteFields.map(key => [key, hex(value[key])]),
    ...intFields.map(key => [key, ['version', 'policyVersion'].includes(key) ? Number(value[key]) : value[key].toString()]),
    ['amountBaseUnits', value.amount.toString()]]);
  encodePayment(request);
  return request;
}
// This maps an already authenticated chain record. The caller must independently
// authenticate network, deployed contract, finality and current source/mandate.
// No client boolean or this mapping function alone establishes confirmation.
export function mapConfirmedAuthorization(request, confirmedCommitment, record, computeCommitment) {
  const compact = toCompactPayment(request);
  assert.equal(hex(computeCommitment(compact)), hex(confirmedCommitment), 'Compact request commitment mismatch');
  assert.equal(hex(record.destinationCluster), request.destinationCluster, 'Destination cluster mismatch');
  assert.equal(hex(record.programId), request.programId, 'Program mismatch');
  assert.equal(record.mandateEpoch, BigInt(request.mandateEpoch), 'Mandate epoch mismatch');
  assert.equal(record.expiresAt, BigInt(request.expiresAt), 'Expiry mismatch');
  assert(typeof record.sourceEpoch === 'bigint' && record.sourceEpoch > 0n && record.sourceEpoch <= 0xffffffffffffffffn);
  return { requestHash: paymentHash(request), compactCommitment: hex(confirmedCommitment),
    destinationCluster: request.destinationCluster, programId: request.programId,
    mandateCommitment: hex(record.mandateCommitment), mandateEpoch: record.mandateEpoch.toString(),
    sourceHandle: hex(record.sourceHandle), sourceEpoch: record.sourceEpoch.toString(), expiresAt: record.expiresAt.toString() };
}
