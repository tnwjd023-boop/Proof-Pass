import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const paymentFields = { version: 'u16', policyId: 32, policyVersion: 'u32', destinationCluster: 32,
  programId: 32, owner: 32, agentKey: 32, vault: 32, recipient: 32, assetId: 32,
  amountBaseUnits: 'u64', requestId: 32, mandateEpoch: 'u64', expiresAt: 'u64' };
const bindingFields = { version: 'u16', sessionId: 32, challenge: 32, audienceHash: 32, issuerPolicyId: 32,
  xrplNetwork: 'u32', xrplAccount: 20, solanaCluster: 32, solanaOwner: 32, issuedAt: 'u64', expiresAt: 'u64' };
export function hexBytes(value, length) {
  assert.ok(typeof value === 'string' && new RegExp(`^[0-9a-f]{${length * 2}}$`).test(value), `Expected ${length} bytes lowercase hex`);
  return Buffer.from(value, 'hex');
}
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function encode(domain, object, schema) {
  assert.ok(object && Object.getPrototypeOf(object) === Object.prototype, 'Expected plain object');
  assert.deepEqual(Object.keys(object).sort(), Object.keys(schema).sort(), 'Unexpected fields');
  assert.equal(object.version, 1, 'Unsupported schema version');
  const chunks = [Buffer.from(domain, 'ascii')];
  for (const [name, type] of Object.entries(schema)) {
    const value = object[name];
    if (typeof type === 'number') { chunks.push(hexBytes(value, type)); continue; }
    const size = Number(type.slice(1)) / 8;
    const bytes = Buffer.alloc(size);
    if (type === 'u64') {
      assert.ok(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value), `Invalid decimal ${name}`);
      const n = BigInt(value);
      assert.ok(n <= 0xffffffffffffffffn, `${name} overflow`);
      bytes.writeBigUInt64LE(n);
    } else {
      assert.ok(Number.isInteger(value) && value >= 0 && value < 2 ** (size * 8), `Invalid ${name}`);
      bytes.writeUIntLE(value, 0, size);
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}
export function encodePayment(request) {
  const bytes = encode('PROOFPASS:AGENT_PAYMENT_AUTH:V1', request, paymentFields);
  assert.ok(BigInt(request.amountBaseUnits) > 0n && BigInt(request.expiresAt) > 0n);
  return bytes;
}
export function paymentHash(request) { return sha256(encodePayment(request)); }
export function encodeBinding(session) {
  const bytes = encode('PROOFPASS:BINDING:V1', session, bindingFields);
  assert.ok(BigInt(session.expiresAt) > BigInt(session.issuedAt), 'Invalid lifetime');
  return bytes;
}
export function bindingNonce(session) { return BigInt('0x' + sha256(encodeBinding(session)).slice(0, 32)).toString(); }
