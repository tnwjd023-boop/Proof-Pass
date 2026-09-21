import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, createPublicKey, sign, verify } from 'node:crypto';
import { Wallet } from 'xrpl';
import keypairs from 'ripple-keypairs';
import addressCodec from 'ripple-address-codec';
import { SessionStore } from '../src/binding/sessions.mjs';
import { encodeBinding, bindingNonce, sha256 } from '../src/protocol.mjs';
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'proofpass-binding-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const xrpl = Wallet.generate();
  const solana = generateKeyPairSync('ed25519');
  const adapter = generateKeyPairSync('ed25519');
  let now = 1800000000;
  const owner = solana.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  const policy = { audience: 'proofpass.test', issuerPolicyId: '11'.repeat(32), solanaCluster: '22'.repeat(32), xrplNetwork: 1, ttlSeconds: 300 };
  let flags = 0, age = 0, rejectProof = false;
  const dependencies = { clock: () => now, adapterPrivateKey: adapter.privateKey,
    accountState: async account => ({ account, flags, networkId: 1, ledgerIndex: 123,
      ledgerHash: 'ab'.repeat(32), closeTime: now - age, observedAt: now }),
    // Unit fixture only. Actual Java verification is separately exercised by the integration CLI.
    verifyPresentation: async session => ({ verified: !rejectProof, nonce: bindingNonce(session), issuerPolicyId: policy.issuerPolicyId }),
  };
  const store = new SessionStore(directory, policy, dependencies);
  const issue = () => store.issue({ xrplAccount: Buffer.from(addressCodec.decodeAccountID(xrpl.classicAddress)).toString('hex'), solanaOwner: owner });
  const proof = session => ({ xrplPublicKey: xrpl.publicKey,
    xrplSignature: keypairs.sign(encodeBinding(session).toString('hex'), xrpl.privateKey),
    solanaSignature: sign(null, encodeBinding(session), solana.privateKey).toString('hex'), presentationPath: 'fixture-only' });
  return { store, issue, proof, directory, policy, dependencies,
    tick: value => { now += value; }, flags: value => { flags = value; }, age: value => { age = value; },
    rejectProof: () => { rejectProof = true; } };
}
test('real wallet signatures complete one session and survive process restart', async t => {
  const f = await setup(t), session = await f.issue();
  const result = await f.store.complete(session.sessionId, f.proof(session));
  assert.equal(result.verificationMode, 'opendid-zkp');
  assert.equal(result.holderSessionDigest, sha256(encodeBinding(session)));
  const attested = Buffer.concat([Buffer.from('PROOFPASS:BINDING_ATTESTATION:ED25519:V1'), encodeBinding(session),
    Buffer.from(result.providerKeyId + result.privateSubjectCommitment + result.holderSessionDigest, 'hex')]);
  assert.equal(verify(null, attested, createPublicKey(f.dependencies.adapterPrivateKey), Buffer.from(result.signature, 'hex')), true);
  const restarted = new SessionStore(f.directory, f.policy, f.dependencies);
  await assert.rejects(restarted.complete(session.sessionId, f.proof(session)), /consumed/);
});
test('wallet substitution and signature tampering leave session unconsumed', async t => {
  const f = await setup(t), session = await f.issue();
  const signatures = f.proof(session);
  await assert.rejects(f.store.complete(session.sessionId, { ...signatures, solanaSignature: '00'.repeat(64) }), /Solana/);
  await assert.rejects(f.store.complete(session.sessionId, { ...signatures, xrplPublicKey: Wallet.generate().publicKey }), /XRPL/);
  const swapped = { ...session, solanaOwner: 'ab'.repeat(32) };
  await assert.rejects(f.store.complete(session.sessionId, f.proof(swapped)), /signature/);
  assert.ok(await f.store.complete(session.sessionId, signatures));
});
test('disabled master, stale state, verifier rejection and client booleans fail closed', async t => {
  const f = await setup(t), s = await f.issue(), proof = f.proof(s);
  f.flags(1048576);
  await assert.rejects(f.store.complete(s.sessionId, proof), /master/);
  f.flags(0); f.age(31);
  await assert.rejects(f.store.complete(s.sessionId, proof), /stale/);
  f.age(0);
  await assert.rejects(f.store.complete(s.sessionId, { ...proof, verified: true }), /fields/);
  f.rejectProof();
  await assert.rejects(f.store.complete(s.sessionId, proof), /OpenDID/);
});
test('expiry and audience policy change invalidate a session', async t => {
  const f = await setup(t), s = await f.issue();
  const otherService = new SessionStore(f.directory, { ...f.policy, audience: 'other-service' }, f.dependencies);
  await assert.rejects(otherService.complete(s.sessionId, f.proof(s)), /policy/);
  f.tick(300);
  await assert.rejects(f.store.complete(s.sessionId, f.proof(s)), /expired/);
});
test('concurrent completion allows at most one success', async t => {
  const f = await setup(t), s = await f.issue();
  const outcomes = await Promise.allSettled([f.store.complete(s.sessionId, f.proof(s)), f.store.complete(s.sessionId, f.proof(s))]);
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
});
test('RPC failure and wrong network do not issue attestations', async t => {
  const f = await setup(t), s = await f.issue();
  const failed = new SessionStore(f.directory, f.policy, { ...f.dependencies,
    accountState: async () => { throw new Error('RPC unavailable'); } });
  await assert.rejects(failed.complete(s.sessionId, f.proof(s)), /RPC unavailable/);
  const wrong = new SessionStore(f.directory, f.policy, { ...f.dependencies,
    accountState: async account => ({ ...await f.dependencies.accountState(account), networkId: 0 }) });
  await assert.rejects(wrong.complete(s.sessionId, f.proof(s)), /state binding/);
  assert.ok(await f.store.complete(s.sessionId, f.proof(s)));
});
test('expiry during slow verification cannot consume a session', async t => {
  const f = await setup(t), s = await f.issue();
  const slow = new SessionStore(f.directory, f.policy, { ...f.dependencies,
    verifyPresentation: async session => { f.tick(300); return f.dependencies.verifyPresentation(session); } });
  await assert.rejects(slow.complete(s.sessionId, f.proof(s)), /expired/);
});
