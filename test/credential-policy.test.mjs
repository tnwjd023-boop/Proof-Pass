import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { encodeBinding, sha256 } from '../src/protocol.mjs';
import { verifyBinding } from '../src/binding/attestation.mjs';
import { assessCredential, nextObservation } from '../src/xrpl/observer.mjs';
import { recordObservation, republishCompletedReport, cleanupExpired, saveJson } from '../src/xrpl/lifecycle.mjs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const now = 1800000000;
const policy = { audience: 'proofpass.test', issuerPolicyId: '11'.repeat(32), solanaCluster: '22'.repeat(32), xrplNetwork: 1 };
const session = { version: 1, sessionId: '01'.repeat(32), challenge: '02'.repeat(32), audienceHash: sha256(Buffer.from(policy.audience)),
  issuerPolicyId: policy.issuerPolicyId, solanaCluster: policy.solanaCluster, xrplNetwork: 1,
  xrplAccount: '03'.repeat(20), solanaOwner: '04'.repeat(32), issuedAt: String(now), expiresAt: String(now + 300) };
function signedBinding() {
  const keys = generateKeyPairSync('ed25519');
  const a = { version: 1, session, providerKeyId: sha256(keys.publicKey.export({ format: 'der', type: 'spki' })),
    privateSubjectCommitment: '05'.repeat(32), holderSessionDigest: sha256(encodeBinding(session)), verificationMode: 'opendid-zkp' };
  const bytes = Buffer.concat([Buffer.from('PROOFPASS:BINDING_ATTESTATION:ED25519:V1'), encodeBinding(session),
    Buffer.from(a.providerKeyId + a.privateSubjectCommitment + a.holderSessionDigest, 'hex')]);
  a.signature = sign(null, bytes, keys.privateKey).toString('hex');
  return { a, keys };
}
test('issuer requires trusted adapter signature and exact current policy', () => {
  const { a, keys } = signedBinding();
  assert.equal(verifyBinding(a, keys.publicKey, policy, now).xrplAccount, session.xrplAccount);
  assert.throws(() => verifyBinding(a, generateKeyPairSync('ed25519').publicKey, policy, now));
  assert.throws(() => verifyBinding({ ...a, privateSubjectCommitment: 'ab'.repeat(32) }, keys.publicKey, policy, now));
  assert.throws(() => verifyBinding(a, keys.publicKey, { ...policy, audience: 'other' }, now));
  assert.throws(() => verifyBinding(a, keys.publicKey, policy, now + 300));
  assert.throws(() => verifyBinding({ ...a, verificationMode: 'opendid-vp' }, keys.publicKey, policy, now));
});
const expected = { issuer: 'issuer', subject: 'subject', type: '4142' };
const ledger = { index: 100, hash: 'aa'.repeat(32), closeTime: now - 1 };
const node = { LedgerEntryType: 'Credential', Issuer: 'issuer', Subject: 'subject', CredentialType: '4142',
  Flags: 65536, index: 'bb'.repeat(32), PreviousTxnID: 'cc'.repeat(32), Expiration: now + 90 - 946684800 };
test('only current accepted credentials receive a bounded lease', () => {
  assert.equal(assessCredential(node, expected, ledger, now).validUntil, now + 60);
  assert.equal(assessCredential({ ...node, Expiration: now + 5 - 946684800 }, expected, ledger, now).validUntil, now + 5);
  for (const [changed, status] of [[null, 'absent'], [{ ...node, Flags: 0 }, 'unaccepted'],
    [{ ...node, Expiration: now - 946684800 }, 'expired']]) {
    const result = assessCredential(changed, expected, ledger, now);
    assert.equal(result.status, status); assert.equal(result.active, false); assert.equal(result.validUntil, now);
  }
  assert.throws(() => assessCredential({ ...node, Issuer: 'other' }, expected, ledger, now));
  assert.throws(() => assessCredential(node, expected, { ...ledger, closeTime: now - 31 }, now));
});
test('epochs survive deletion and recreation and reject stale/conflicting ledger updates', () => {
  const first = nextObservation(null, assessCredential(node, expected, ledger, now));
  assert.equal(first.sourceEpoch, 1);
  const refresh = nextObservation(first, assessCredential(node, expected, { ...ledger, index: 101 }, now));
  assert.equal(refresh.sourceEpoch, 1);
  const deleted = nextObservation(refresh, assessCredential(null, expected, { ...ledger, index: 102 }, now));
  assert.equal(deleted.sourceEpoch, 2);
  const recreated = nextObservation(deleted, assessCredential({ ...node, PreviousTxnID: 'dd'.repeat(32) }, expected, { ...ledger, index: 103 }, now));
  assert.equal(recreated.sourceEpoch, 3);
  assert.throws(() => nextObservation(recreated, first));
  assert.throws(() => nextObservation(first, { ...first, ledger: { ...ledger, hash: 'ee'.repeat(32) } }));
  assert.throws(() => nextObservation(first, { ...first, status: 'absent', active: false, fingerprint: 'ff' }));
});
test('resume retains original stage observations after later chain changes', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'proofpass-observe-')), 'journal.json');
  const journal = { steps: {} };
  const original = { status: 'unaccepted', active: false, sourceEpoch: 2 };
  await recordObservation(journal, 'unaccepted', 'unaccepted', async () => original, path);
  const restarted = JSON.parse(await readFile(path, 'utf8'));
  const preserved = await recordObservation(restarted, 'unaccepted', 'unaccepted', async () => ({ status: 'absent' }), path);
  assert.deepEqual(preserved, original);
  await assert.rejects(recordObservation(restarted, 'accepted', 'accepted', async () => ({ status: 'absent' }), path));
});
test('completed journal can restore a missing public report', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'proofpass-republish-'));
  const report = { status: 'passed', receipts: { create: { hash: 'one' } } };
  await saveJson(join(dir, 'private.json'), report);
  await republishCompletedReport({ completed: true }, join(dir, 'private.json'), join(dir, 'public.json'));
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'public.json'), 'utf8')), report);
});
test('expired credentials can be cleaned up without claiming successful lifecycle', async () => {
  for (const flags of [0, 65536]) {
    let credential = { ...node, Flags: flags, Expiration: now - 946684800 };
    const result = await cleanupExpired(async () => assessCredential(credential, expected, ledger, now), async () => { credential = null; });
    assert.equal(credential, null); assert.equal(result.lifecyclePassed, false);
  }
  let active = node;
  await assert.rejects(cleanupExpired(async () => assessCredential(active, expected, ledger, now), async () => { active = null; }));
  assert.equal(active, node);
});
