import assert from 'node:assert/strict';
import { randomBytes, createPublicKey, sign } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { encodeBinding, bindingNonce, hexBytes, sha256 } from '../protocol.mjs';
import { verifyWallets, validateMasterState } from './wallets.mjs';
export class SessionStore {
  constructor(directory, policy, dependencies) {
    assert.equal(policy.xrplNetwork, 1, 'Only XRPL Testnet is enabled');
    assert.ok(typeof policy.audience === 'string' && policy.audience.length > 0);
    assert.ok(Number.isInteger(policy.ttlSeconds) && policy.ttlSeconds > 0 && policy.ttlSeconds <= 300);
    hexBytes(policy.issuerPolicyId, 32); hexBytes(policy.solanaCluster, 32);
    this.directory = resolve(directory);
    this.policy = Object.freeze({ ...policy });
    this.dependencies = { clock: () => Math.floor(Date.now() / 1000), ...dependencies };
    assert.equal(this.dependencies.adapterPrivateKey.asymmetricKeyType, 'ed25519');
  }
  async issue(addresses) {
    assert.deepEqual(Object.keys(addresses).sort(), ['solanaOwner', 'xrplAccount']);
    const now = this.dependencies.clock();
    assert.ok(Number.isSafeInteger(now) && now > 0);
    const session = { version: 1, sessionId: randomBytes(32).toString('hex'), challenge: randomBytes(32).toString('hex'),
      audienceHash: sha256(Buffer.from(this.policy.audience, 'utf8')), issuerPolicyId: this.policy.issuerPolicyId,
      xrplNetwork: this.policy.xrplNetwork, ...addresses, solanaCluster: this.policy.solanaCluster,
      issuedAt: String(now), expiresAt: String(now + this.policy.ttlSeconds) };
    encodeBinding(session);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(join(this.directory, session.sessionId + '.json'), JSON.stringify({ session, consumed: false }), { flag: 'wx', mode: 0o600 });
    return session;
  }
  async complete(id, proofs) {
    hexBytes(id, 32);
    assert.deepEqual(Object.keys(proofs).sort(), ['presentationPath', 'solanaSignature', 'xrplPublicKey', 'xrplSignature'], 'Unexpected proof fields');
    const path = join(this.directory, id + '.json');
    const lockPath = path + '.lock';
    const lock = await open(lockPath, 'wx', 0o600);
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      const record = JSON.parse(await readFile(path, 'utf8'));
      const session = record.session;
      assert.equal(session.sessionId, id);
      encodeBinding(session);
      assert.equal(record.consumed, false, 'Session consumed');
      assert.ok(session.audienceHash === sha256(Buffer.from(this.policy.audience, 'utf8'))
        && session.issuerPolicyId === this.policy.issuerPolicyId && session.solanaCluster === this.policy.solanaCluster
        && session.xrplNetwork === this.policy.xrplNetwork, 'Session policy mismatch');
      const validTime = () => {
        const now = this.dependencies.clock();
        assert.ok(Number.isSafeInteger(now) && BigInt(now) >= BigInt(session.issuedAt)
          && BigInt(now) < BigInt(session.expiresAt), 'Session expired or clock invalid');
        return now;
      };
      validTime();
      verifyWallets(session, proofs);
      const state = await this.dependencies.accountState(session.xrplAccount);
      validateMasterState(session, state, validTime());
      const identity = await this.dependencies.verifyPresentation(session, proofs.presentationPath);
      assert.ok(identity?.verified === true && identity.nonce === bindingNonce(session)
        && identity.issuerPolicyId === session.issuerPolicyId, 'OpenDID verification rejected');
      validateMasterState(session, state, validTime());
      const holderSessionDigest = sha256(encodeBinding(session));
      const privateSubjectCommitment = sha256(Buffer.concat([Buffer.from('PROOFPASS:PRIVATE_SUBJECT:V1'),
        randomBytes(32), Buffer.from(holderSessionDigest, 'hex')]));
      const providerKeyId = sha256(createPublicKey(this.dependencies.adapterPrivateKey).export({ format: 'der', type: 'spki' }));
      const message = Buffer.concat([Buffer.from('PROOFPASS:BINDING_ATTESTATION:ED25519:V1'), encodeBinding(session),
        Buffer.from(providerKeyId + privateSubjectCommitment + holderSessionDigest, 'hex')]);
      const attestation = { version: 1, providerKeyId, session, privateSubjectCommitment, holderSessionDigest,
        verificationMode: 'opendid-zkp', signature: sign(null, message, this.dependencies.adapterPrivateKey).toString('hex') };
      const temporary = path + '.' + randomBytes(8).toString('hex') + '.tmp';
      await writeFile(temporary, JSON.stringify({ session, consumed: true, attestation, consumedAt: this.dependencies.clock() }), { mode: 0o600, flag: 'wx' });
      await rename(temporary, path);
      return attestation;
    } finally { await lock.close(); await unlink(lockPath); }
  }
}
