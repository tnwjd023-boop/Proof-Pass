import assert from 'node:assert/strict';
import { verify } from 'node:crypto';
import { encodeBinding, hexBytes, sha256 } from '../protocol.mjs';
export function verifyBinding(a, trustedKey, policy, now) {
  assert.deepEqual(Object.keys(a).sort(), ['version','providerKeyId','session','privateSubjectCommitment','holderSessionDigest','verificationMode','signature'].sort());
  assert.equal(a.version, 1); assert.equal(a.verificationMode, 'opendid-zkp');
  assert.equal(trustedKey.asymmetricKeyType, 'ed25519');
  const bytes = encodeBinding(a.session);
  const expectedKeyId = sha256(trustedKey.export({ type: 'spki', format: 'der' }));
  assert.equal(a.providerKeyId, expectedKeyId);
  assert.equal(a.holderSessionDigest, sha256(bytes));
  hexBytes(a.privateSubjectCommitment, 32);
  const message = Buffer.concat([Buffer.from('PROOFPASS:BINDING_ATTESTATION:ED25519:V1'), bytes,
    Buffer.from(a.providerKeyId + a.privateSubjectCommitment + a.holderSessionDigest, 'hex')]);
  assert.ok(verify(null, message, trustedKey, hexBytes(a.signature, 64)), 'Invalid adapter signature');
  assert.equal(a.session.audienceHash, sha256(Buffer.from(policy.audience)));
  for (const field of ['issuerPolicyId', 'xrplNetwork', 'solanaCluster']) assert.equal(a.session[field], policy[field]);
  assert.ok(Number.isSafeInteger(now) && BigInt(now) >= BigInt(a.session.issuedAt)
    && BigInt(now) < BigInt(a.session.expiresAt), 'Binding expired');
  return a.session;
}
