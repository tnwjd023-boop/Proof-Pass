import assert from 'node:assert/strict';
import { mkdir, readFile, open, unlink } from 'node:fs/promises';
import { createPublicKey, createPrivateKey, sign, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { Client, Wallet, convertStringToHex } from 'xrpl';
import codec from 'ripple-address-codec';
import { Connection } from '@solana/web3.js';
import * as solana from './solana-client.mjs';
import { submitIntent } from '../../src/solana/intents.mjs';
import { verifyBinding } from '../../src/binding/attestation.mjs';
import { assessCredential, nextObservation } from '../../src/xrpl/observer.mjs';
import { loadJson, saveJson, snapshot, lookupCredential, submitStage, recordObservation } from '../../src/xrpl/lifecycle.mjs';
import { sha256 } from '../../src/protocol.mjs';

export { solana, submitIntent, loadJson, saveJson, sha256 };
export const now = () => Math.floor(Date.now() / 1000);
export const hex = bytes => Buffer.from(bytes).toString('hex');
export async function services() {
  const project = fileURLToPath(new URL('../../', import.meta.url));
  const root = join(project, '.local/gate1');
  const lockPath = join(root, 'credential-demo.lock');
  const lock = await open(lockPath, 'wx');
  await lock.writeFile(JSON.stringify({ pid: process.pid, platform: process.platform, kind: 'live-flow', createdAt: new Date().toISOString() }));
  const client = new Client('wss://s.altnet.rippletest.net:51233', { timeout: 15000, connectionTimeout: 15000, maxFeeXRP: '0.01' });
  try {
    const manifest = process.env.PROOFPASS_BINDING_NAME ? { directory: process.env.PROOFPASS_BINDING_NAME }
      : await loadJson(join(root, 'latest-binding.json'));
    const base = manifest.directory.replaceAll('\\', '/').split('/').at(-1);
    assert.match(base, /^binding-[0-9a-f]{16}$/, 'Invalid operator binding directory');
    const directory = join(root, base);
    const attestation = await loadJson(join(directory, 'attestation.json'));
    const policy = await loadJson(join(directory, 'policy.json'));
    assert.equal(policy.audience, 'proofpass.local/gate1');
    assert.equal(policy.issuerPolicyId, sha256(Buffer.from('proofpass:test-issuer:age19:v1')));
    const trusted = createPublicKey(await readFile(join(directory, 'adapter-public.pem')));
    const binding = () => verifyBinding(attestation, trusted, policy, now());
    // Historical signature verification permits receipt recovery only. Every
    // new identity-dependent operation still calls binding() at current time.
    const session = verifyBinding(attestation, trusted, policy, Number(attestation.session.issuedAt));
    const wallets = await loadJson(join(project, '.local/xrpl-gate0/keys.json'));
    const issuer = Wallet.fromSeed(wallets.issuer), subject = Wallet.fromSeed(wallets.subject);
    const expected = { issuer: issuer.classicAddress, subject: subject.classicAddress, type: convertStringToHex('PROOFPASS_ELIGIBLE_V1') };
    assert.equal(session.xrplAccount, hex(codec.decodeAccountID(subject.classicAddress)));
    const [owner, agent, relay, observer, recipient] = await Promise.all(['payer', 'agent', 'relay', 'observer', 'recipient'].map(solana.key));
    assert.equal(session.solanaOwner, solana.hex(owner.publicKey));
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const genesis = await connection.getGenesisHash();
    assert.equal(genesis, 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
    assert.equal(session.solanaCluster, solana.hex(genesis));
    const operatorConfig = await solana.account(connection, solana.configAddress(), 'Config');
    assert.equal(operatorConfig.relay, solana.hex(relay.publicKey));
    assert.equal(operatorConfig.observer, solana.hex(observer.publicKey));
    assert.equal(operatorConfig.cluster, session.solanaCluster);
    const runDirectory = join(directory, 'live');
    await mkdir(runDirectory, { recursive: true });
    const observationPath = join(root, 'observer', sha256(Buffer.from(JSON.stringify(expected))) + '.json');
    const observerKeys = await loadJson(join(root, 'observer/key.json'));
    assert(observerKeys, 'Initialize project observer key before live flow');
    const edObserver = createPrivateKey(observerKeys.private);
    const journalPath = join(directory, 'credential-journal.json');
    let journal = await loadJson(journalPath);
    if (!journal) {
      journal = { binding: expected, expiration: Number(session.expiresAt) - 946684800, steps: {} };
      await saveJson(journalPath, journal);
    }
    assert.deepEqual(journal.binding, expected);
    await client.connect();
    async function observe() {
      const ledger = await snapshot(client);
      const node = await lookupCredential(client, expected, ledger);
      // XRPL allows small positive close-time skew. Wait for the fixed ledger's
      // time instead of signing a future observation the Compact clock rejects.
      while (now() < ledger.closeTime) await new Promise(resolve => setTimeout(resolve, 250));
      const previous = await loadJson(observationPath);
      const state = nextObservation(previous, assessCredential(node, expected, ledger, now()));
      state.sourceStatusHandle = previous?.sourceStatusHandle ?? randomBytes(32).toString('hex');
      state.signedPayload = JSON.stringify({ version: 1, ...state });
      state.signature = sign(null, Buffer.from('PROOFPASS:XRPL_OBSERVATION:ED25519:V1\0' + state.signedPayload), edObserver).toString('hex');
      await saveJson(observationPath, state);
      return { state, node };
    }
    async function prepareCredential() {
      binding();
      const initial = await observe();
      if (initial.state.status === 'expired') {
        await submitStage(client, issuer, { TransactionType: 'CredentialDelete', Account: expected.issuer, Subject: expected.subject, CredentialType: expected.type },
          'cleanupPrevious', journal, journalPath, async () => { assert.equal((await observe()).state.status, 'expired'); });
      }
      const receipts = {};
      receipts.create = await submitStage(client, issuer, { TransactionType: 'CredentialCreate', Account: expected.issuer,
        Subject: expected.subject, CredentialType: expected.type, Expiration: journal.expiration }, 'create', journal, journalPath,
        async () => { binding(); assert.equal((await observe()).state.status, 'absent', 'Previous active credential requires reconciliation'); });
      await recordObservation(journal, 'unaccepted', 'unaccepted', async () => (await observe()).state, journalPath);
      receipts.accept = await submitStage(client, subject, { TransactionType: 'CredentialAccept', Account: expected.subject,
        Issuer: expected.issuer, CredentialType: expected.type }, 'accept', journal, journalPath,
        async () => { assert.equal((await observe()).state.status, 'unaccepted'); });
      await recordObservation(journal, 'accepted', 'accepted', async () => (await observe()).state, journalPath);
      return receipts;
    }
    async function deleteCredential() {
      return submitStage(client, issuer, { TransactionType: 'CredentialDelete', Account: expected.issuer, Subject: expected.subject, CredentialType: expected.type },
        'delete', journal, journalPath, async () => { assert(['accepted', 'expired'].includes((await observe()).state.status)); });
    }
    async function transaction(name, payer, instructions, allowFailure = false, beforeNew = async () => {}) {
      const result = await submitIntent(connection, payer, instructions, join(runDirectory, 'solana-' + name + '.json'), { beforeNew });
      if (allowFailure) assert.notEqual(result.error, null, 'Expected payment rejection');
      else assert.equal(result.error, null, `Solana ${name} failed`);
      return result;
    }
    async function finalized(signature) {
      for (let n = 0; n < 60; n++) {
        const status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
        if (status?.confirmationStatus === 'finalized') return status;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      throw new Error('Solana finality timeout');
    }
    async function finalizedAll(receipts) {
      for (let n = 0; n < 60; n++) {
        const statuses = (await connection.getSignatureStatuses(receipts.map(x => x.signature), { searchTransactionHistory: true })).value;
        if (statuses.every(x => x?.confirmationStatus === 'finalized')) {
          statuses.forEach((status, i) => assert.deepEqual(status.err, receipts[i].error));
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      throw Error('Solana batch finality timeout');
    }
    return { project, root, directory, runDirectory, session, attestation, binding, expected,
      readIntent: name => loadJson(join(runDirectory, 'solana-' + name + '.json')),
      connection, owner, agent, relay, observer, recipient, observe, prepareCredential, deleteCredential, transaction, finalized, finalizedAll,
      close: async () => { await client.disconnect(); await lock.close(); await unlink(lockPath); } };
  } catch (e) {
    await client.disconnect(); await lock.close(); await unlink(lockPath); throw e;
  }
}
