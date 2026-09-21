import assert from 'node:assert/strict';
import { mkdir, readFile, open, unlink } from 'node:fs/promises';
import { createPublicKey, generateKeyPairSync, createPrivateKey, randomBytes, sign } from 'node:crypto';
import { join, resolve, sep } from 'node:path';
import { Client, Wallet, convertStringToHex } from 'xrpl';
import codec from 'ripple-address-codec';
import { verifyBinding } from '../../src/binding/attestation.mjs';
import { assessCredential, nextObservation } from '../../src/xrpl/observer.mjs';
import { loadJson, saveJson, snapshot, lookupCredential, submitStage, recordObservation, republishCompletedReport, cleanupExpired } from '../../src/xrpl/lifecycle.mjs';
import { sha256 } from '../../src/protocol.mjs';
const root = resolve('.local/gate1');
await mkdir(root, { recursive: true });
const lockPath = join(root, 'credential-demo.lock');
const lock = await open(lockPath, 'wx');
const client = new Client('wss://s.altnet.rippletest.net:51233', { timeout: 15000, connectionTimeout: 15000, maxFeeXRP: '0.01' });
try {
  await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
  // Local operator bootstrap from our completed binding run, never an HTTP/caller key.
  const manifest = await loadJson(join(root, 'latest-binding.json'));
  const directory = resolve(manifest.directory);
  assert.ok(directory.startsWith(root + sep));
  const attestation = await loadJson(join(directory, 'attestation.json'));
  const policy = await loadJson(join(directory, 'policy.json'));
  assert.equal(policy.audience, 'proofpass.local/gate1');
  assert.equal(policy.issuerPolicyId, sha256(Buffer.from('proofpass:test-issuer:age19:v1')));
  const trusted = createPublicKey(await readFile(join(directory, 'adapter-public.pem')));
  const wallets = await loadJson('.local/xrpl-gate0/keys.json');
  const issuer = Wallet.fromSeed(wallets.issuer), subject = Wallet.fromSeed(wallets.subject);
  const binding = { issuer: issuer.classicAddress, subject: subject.classicAddress, type: convertStringToHex('PROOFPASS_ELIGIBLE_V1') };
  assert.equal(attestation.session.xrplAccount, Buffer.from(codec.decodeAccountID(binding.subject)).toString('hex'));
  const journalPath = join(directory, 'credential-journal.json');
  let journal = await loadJson(journalPath);
  if (!journal) {
    const session = verifyBinding(attestation, trusted, policy, Math.floor(Date.now() / 1000));
    journal = { binding, expiration: Math.min(Number(session.expiresAt), Math.floor(Date.now() / 1000) + 3600) - 946684800, steps: {} };
    await saveJson(journalPath, journal);
  }
  assert.deepEqual(journal.binding, binding);
  const observerDir = join(root, 'observer');
  await mkdir(observerDir, { recursive: true });
  const observationPath = join(observerDir, sha256(Buffer.from(JSON.stringify(binding))) + '.json');
  const observerKeyPath = join(observerDir, 'key.json');
  let observerKeys = await loadJson(observerKeyPath);
  if (!observerKeys) {
    const keys = generateKeyPairSync('ed25519');
    observerKeys = { private: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), public: keys.publicKey.export({ type: 'spki', format: 'pem' }) };
    await saveJson(observerKeyPath, observerKeys);
  }
  const signer = createPrivateKey(observerKeys.private);
  async function observe() {
    const ledger = await snapshot(client);
    const node = await lookupCredential(client, binding, ledger);
    const previous = await loadJson(observationPath);
    const state = nextObservation(previous, assessCredential(node, binding, ledger, Math.floor(Date.now() / 1000)));
    state.sourceStatusHandle = previous?.sourceStatusHandle ?? randomBytes(32).toString('hex');
    // Local evidence envelope, not the future Compact attestation encoding.
    const signedPayload = JSON.stringify({ version: 1, ...state });
    state.signedPayload = signedPayload;
    state.signature = sign(null, Buffer.from('PROOFPASS:XRPL_OBSERVATION:ED25519:V1\0' + signedPayload), signer).toString('hex');
    await saveJson(observationPath, state);
    return state;
  }
  await client.connect();
  const reportPath = join(directory, 'credential-report.json');
  if (process.argv.includes('--cleanup-expired')) {
    const result = await cleanupExpired(observe, async () => {
      await submitStage(client, issuer, { TransactionType: 'CredentialDelete', Account: binding.issuer, Subject: binding.subject, CredentialType: binding.type },
        'cleanup', journal, journalPath, async () => { assert.equal((await observe()).status, 'expired'); });
    });
    await saveJson(join(directory, 'cleanup-report.json'), result);
    console.log('Expired credential cleanup checked. This does not mark the lifecycle passed.');
  } else if (journal.completed) {
    const state = await observe();
    assert.equal(state.status, 'absent');
    for (const [name, intent] of Object.entries(journal.steps))
      await submitStage(client, name === 'accept' ? subject : issuer, intent.transaction, name, journal, journalPath,
        async () => { throw new Error('Completed run must not submit a new transaction'); });
    await republishCompletedReport(journal, reportPath, 'evidence/gate1/credential-observer.json');
    console.log('Completed lifecycle reconciled; no new transactions signed.');
  } else {
    const receipts = {};
    const create = { TransactionType: 'CredentialCreate', Account: binding.issuer, Subject: binding.subject, CredentialType: binding.type, Expiration: journal.expiration };
    receipts.create = await submitStage(client, issuer, create, 'create', journal, journalPath, async () => {
      verifyBinding(attestation, trusted, policy, Math.floor(Date.now() / 1000));
      assert.equal((await observe()).status, 'absent', 'Unexpected existing credential');
    });
    const unaccepted = await recordObservation(journal, 'unaccepted', 'unaccepted', observe, journalPath);
    receipts.accept = await submitStage(client, subject, { TransactionType: 'CredentialAccept', Account: binding.subject, Issuer: binding.issuer, CredentialType: binding.type },
      'accept', journal, journalPath, async () => { assert.equal((await observe()).status, 'unaccepted'); });
    const accepted = await recordObservation(journal, 'accepted', 'accepted', observe, journalPath);
    receipts.delete = await submitStage(client, issuer, { TransactionType: 'CredentialDelete', Account: binding.issuer, Subject: binding.subject, CredentialType: binding.type },
      'delete', journal, journalPath, async () => { assert.ok(['accepted', 'expired'].includes((await observe()).status)); });
    const deleted = await recordObservation(journal, 'deleted', 'absent', observe, journalPath);
    assert.equal(deleted.status, 'absent'); assert.equal(deleted.active, false);
    // Final public report contains only XRPL references, never Solana linkage or the binding proof.
    const report = { status: 'passed', mode: 'binding-authorized-Testnet-credential-and-live-observer',
      receipts, unaccepted: { status: unaccepted.status, sourceEpoch: unaccepted.sourceEpoch },
      accepted: { status: accepted.status, sourceEpoch: accepted.sourceEpoch, observedAt: accepted.observedAt, validUntil: accepted.validUntil },
      deleted: { status: deleted.status, sourceEpoch: deleted.sourceEpoch, ledger: deleted.ledger },
      expirationUnix: journal.expiration + 946684800, compactAttestation: false, solanaRevocationApplied: false, completedAt: new Date().toISOString() };
    await saveJson(reportPath, report);
    journal.completed = true; await saveJson(journalPath, journal);
    await saveJson('evidence/gate1/credential-observer.json', report);
    console.log(JSON.stringify(report, null, 2));
  }
} finally { await client.disconnect(); await lock.close(); await unlink(lockPath); }
