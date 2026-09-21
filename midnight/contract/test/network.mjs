// Real local-chain proof/deployment test with deliberately synthetic attestations.
// This script never claims that a live OpenDID/XRPL/Solana mandate was consumed.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import pino from 'pino';
import { ecMulGenerator } from '@midnight-ntwrk/compact-runtime';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { Contract, ledger, pureCircuits as p } from '../src/managed/policy/contract/index.js';
import { witnesses } from '../src/signing.mjs';
import { fixture, keys } from './fixture.mjs';

const project = process.env.PROOFPASS_PROJECT;
const upstream = process.env.PROOFPASS_MIDNIGHT_UPSTREAM;
assert(project && upstream);
const api = await import(pathToFileURL(path.join(upstream, 'zkloan-credit-scorer-cli/src/api.ts')));
const { fromCompactPayment, mapConfirmedAuthorization } = await import(pathToFileURL(path.join(project, 'src/midnight/request.mjs')));
const logger = pino({ level: 'info', redact: ['seed', 'privateState', 'secret', 'password'] });
api.setLogger(logger);
const config = { networkId: 'undeployed', node: 'http://127.0.0.1:9944', indexer: 'http://127.0.0.1:8088/api/v4/graphql',
  indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws', proofServer: 'http://127.0.0.1:6300' };
setNetworkId('undeployed');
const run = randomUUID();
const directory = path.resolve('private', run);
await mkdir(directory, { recursive: true, mode: 0o700 });
const password = 'Aa1!' + randomBytes(32).toString('hex');
await writeFile(path.join(directory, 'storage-password'), password, { mode: 0o600, flag: 'wx' });
const scope = new Uint8Array(randomBytes(32));
const base = fixture(state => { state.config.scope = scope; });
let wallet;
const timeout = setTimeout(() => { console.error('Local network test timed out; inspect private run journal before retry.'); process.exit(1); }, 15 * 60 * 1000);
try {
  // Public dev-genesis seed from the pinned upstream standalone fixture only.
  wallet = await api.buildWalletFromHexSeed(config, '0'.repeat(63) + '1');
  const walletProvider = await api.createWalletAndMidnightProvider(wallet);
  const zkPath = path.resolve('src/managed/policy');
  const zkConfigProvider = new NodeZkConfigProvider(zkPath);
  const privateStateProvider = levelPrivateStateProvider({ privateStateStoreName: path.join(directory, 'state'),
    privateStoragePasswordProvider: () => password, accountId: wallet.unshieldedKeystore.getBech32Address().asString() });
  const providers = { privateStateProvider, publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider, proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider, midnightProvider: walletProvider };
  const compiledContract = CompiledContract.make('ProofPassPolicy', Contract).pipe(
    CompiledContract.withWitnesses(witnesses), CompiledContract.withCompiledFileAssets(zkPath));
  console.log('Deploying isolated synthetic-fixture policy to the real local Midnight node.');
  const deployed = await deployContract(providers, { compiledContract, privateStateId: 'proofpassPolicy',
    initialPrivateState: base.state, args: [base.config, keys.map(ecMulGenerator)] });
  const address = deployed.deployTxData.public.contractAddress;
  const json = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n';
  await writeFile(path.join(directory, 'deployment.json'), json(deployed.deployTxData.public), { mode: 0o600 });
  console.log('Deployment confirmed; preparing a fresh 55-second request.');
  const now = BigInt(Math.floor(Date.now() / 1000));
  const next = fixture(state => {
    state.config.scope = scope;
    state.payment.requestId = new Uint8Array(randomBytes(32));
    state.payment.expiresAt = now + 55n;
    state.identity.checkedAt = now; state.identity.expiresAt = now + 300n;
    state.binding.issuedAt = now; state.binding.expiresAt = now + 300n;
    state.source.ledgerCloseTime = now; state.source.observedAt = now; state.source.validUntil = now + 60n;
    state.mandate.notBefore = now; state.mandate.expiresAt = now + 300n;
    state.clock.now = now; state.clock.expiresAt = now + 60n;
    state.clock.requestCommitment = p.paymentCommitment(state.payment);
  });
  await privateStateProvider.set('proofpassPolicy', next.state);
  const tx = await deployed.callTx.authorize();
  await writeFile(path.join(directory, 'authorization.json'), json(tx.public), { mode: 0o600 });
  const confirmed = await providers.publicDataProvider.queryContractState(address);
  assert(confirmed);
  const requestCommitment = p.paymentCommitment(next.state.payment);
  const current = ledger(confirmed.data);
  assert(current.authorizations.member(requestCommitment));
  const mapped = mapConfirmedAuthorization(fromCompactPayment(next.state.payment), requestCommitment,
    current.authorizations.lookup(requestCommitment), p.paymentCommitment);
  assert.deepEqual(current.configuration.scope, scope);
  const artifacts = {};
  for (const file of ['src/policy.compact', 'src/schnorr.compact', 'src/managed/policy/contract/index.js']) {
    artifacts[file] = createHash('sha256').update(await readFile(file)).digest('hex');
  }
  const report = { status: 'passed', mode: 'real-local-chain-with-synthetic-attestation-fixtures', artifacts,
    network: 'undeployed', contractAddress: address,
    deployment: { txId: deployed.deployTxData.public.txId, blockHeight: deployed.deployTxData.public.blockHeight },
    authorization: { txId: tx.public.txId, blockHeight: tx.public.blockHeight },
    confirmedStateRead: true, exactRequestMapping: true,
    leaseLiveAtRead: BigInt(Math.floor(Date.now() / 1000)) < next.state.payment.expiresAt,
    requestHash: mapped.requestHash, compactCommitment: mapped.compactCommitment,
    sourceOfAttestations: 'synthetic-test-fixtures; not live adapters or a registered Solana mandate',
    fullGate1Complete: false, completedAt: new Date().toISOString() };
  await writeFile(path.join(project, 'evidence/gate1/midnight-policy-network.json'), json(report));
  console.log(json(report));
} finally {
  clearTimeout(timeout);
  if (wallet) await api.closeWallet(wallet);
}
