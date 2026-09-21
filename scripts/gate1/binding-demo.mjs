// Synthetic issuer, real OpenDID cryptography, real funded Testnet wallet ownership.
// No new on-chain transactions. All address linkage stays in .local.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes, createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { Wallet } from 'xrpl';
import keypairs from 'ripple-keypairs';
import codec from 'ripple-address-codec';
import bs58 from 'bs58';
import { SessionStore } from '../../src/binding/sessions.mjs';
import { readMasterState } from '../../src/binding/xrpl-state.mjs';
import { issueFixture, createOpenDidVerifier } from '../../src/binding/opendid.mjs';
import { encodeBinding, sha256 } from '../../src/protocol.mjs';
import { key, DEVNET_GENESIS } from '../gate0/solana-client.mjs';
const started = Date.now();
const bindingName = process.env.PROOFPASS_BINDING_NAME ?? 'binding-' + randomBytes(8).toString('hex');
assert.match(bindingName, /^binding-[a-f0-9]{16}$/);
const directory = resolve('.local/gate1', bindingName);
await mkdir(directory, { recursive: true, mode: 0o700 });
const xrplKeys = JSON.parse(await readFile('.local/xrpl-gate0/keys.json', 'utf8'));
const xrpl = Wallet.fromSeed(xrplKeys.subject);
const solana = await key('payer');
const solanaPrivate = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'),
  Buffer.from(solana.secretKey).subarray(0, 32)]), format: 'der', type: 'pkcs8' });
const adapter = generateKeyPairSync('ed25519');
await writeFile(join(directory, 'adapter-private.pem'), adapter.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
await writeFile(join(directory, 'adapter-public.pem'), adapter.publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o600, flag: 'wx' });
const policy = { audience: 'proofpass.local/gate1', issuerPolicyId: sha256(Buffer.from('proofpass:test-issuer:age19:v1')),
  xrplNetwork: 1, solanaCluster: Buffer.from(bs58.decode(DEVNET_GENESIS)).toString('hex'), ttlSeconds: 300 };
const registryPath = join(directory, 'registry.json');
const store = new SessionStore(join(directory, 'sessions'), policy, { adapterPrivateKey: adapter.privateKey,
  accountState: readMasterState, verifyPresentation: createOpenDidVerifier(registryPath) });
const session = await store.issue({ xrplAccount: Buffer.from(codec.decodeAccountID(xrpl.classicAddress)).toString('hex'),
  solanaOwner: solana.publicKey.toBuffer().toString('hex') });
await issueFixture(session, directory);
const transcript = encodeBinding(session);
const proofs = { presentationPath: join(directory, 'proof.json'), xrplPublicKey: xrpl.publicKey,
  xrplSignature: keypairs.sign(transcript.toString('hex'), xrpl.privateKey),
  solanaSignature: sign(null, transcript, solanaPrivate).toString('hex') };
await assert.rejects(store.complete(session.sessionId, { ...proofs, solanaSignature: '00'.repeat(64) }), /Solana/);
const result = await store.complete(session.sessionId, proofs);
assert.equal(result.verificationMode, 'opendid-zkp');
await writeFile(join(directory, 'attestation.json'), JSON.stringify(result), { mode: 0o600, flag: 'wx' });
await writeFile(join(directory, 'policy.json'), JSON.stringify(policy), { mode: 0o600, flag: 'wx' });
await assert.rejects(store.complete(session.sessionId, proofs), /consumed/);
await mkdir('evidence/gate1', { recursive: true });
const report = { stage: 'Gate1 protocol and session binding', status: 'passed',
  mode: 'actual-opendid-zkp-and-wallet-signatures-with-live-xrpl-account-state',
  issuer: 'synthetic-test-issuer', xrplNetwork: 'Testnet', solanaNetwork: 'Devnet',
  checks: { presentationBoundToTranscriptNonce: true, xrplMasterKeyAuthority: true,
    solanaOwnerSignature: true, substitutedSolanaSignature: 'rejected', consumedSessionReplay: 'rejected',
    adapterAttestationSigned: true },
  disclosure: 'Proof, private keys, commitment, transcript and linked wallet addresses remain in .local only',
  newOnChainTransactions: 0, elapsedMs: Date.now() - started, completedAt: new Date().toISOString(),
  fullGate1Complete: false };
await writeFile('evidence/gate1/binding.json', JSON.stringify(report, null, 2) + '\n');
await writeFile(join(directory, 'binding-ready.json'), JSON.stringify({ status: 'passed' }), { mode: 0o600, flag: 'wx' });
await writeFile('.local/gate1/latest-binding.json', JSON.stringify({ directory }), { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
