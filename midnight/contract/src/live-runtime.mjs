import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { serialize, deserialize } from 'node:v8';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import pino from 'pino';
import { firstValueFrom, filter, timeout } from 'rxjs';
import { ecMulGenerator } from '@midnight-ntwrk/compact-runtime';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { findDeployedContract, deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { Contract, ledger } from './managed/policy/contract/index.js';
import { scalar, witnesses } from './signing.mjs';
import { persistentWallet } from './persistent-wallet.mjs';

export const project = process.env.PROOFPASS_PROJECT;
export const upstream = process.env.PROOFPASS_MIDNIGHT_UPSTREAM;
assert(project && upstream, 'Use the ProofPass runtime script');
const { networkProfile } = await import(pathToFileURL(path.join(project, 'src/midnight/network.mjs')));
export const config = networkProfile(process.env.PROOFPASS_MIDNIGHT_NETWORK ?? 'undeployed');
export const liveDirectory = path.resolve(config.privateDirectory);
export const evidenceDirectory = path.join(project, config.evidenceDirectory);
export const fromHex = hex => new Uint8Array(Buffer.from(hex, 'hex'));
export const digest = value => new Uint8Array(createHash('sha256').update(value).digest());
export async function loadPrivate(name) {
  try { return deserialize(await readFile(path.join(liveDirectory, name + '.bin'))); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
export async function savePrivate(name, data) {
  await mkdir(liveDirectory, { recursive: true, mode: 0o700 });
  const file = path.join(liveDirectory, name + '.bin');
  await writeFile(file + '.tmp', serialize(data), { mode: 0o600 });
  await rename(file + '.tmp', file);
}
async function genesis() {
  const r = await fetch(config.node, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'chain_getBlockHash', params: [0] }), signal: AbortSignal.timeout(10000) });
  assert(r.ok);
  const data = await r.json();
  assert.match(data.result, /^0x[0-9a-f]{64}$/);
  if (config.genesisHash) assert.equal(data.result, config.genesisHash, 'Wrong Midnight network genesis');
  return data.result;
}
export async function runtime() {
  await mkdir(liveDirectory, { recursive: true, mode: 0o700 });
  let secrets = await loadPrivate('role-secrets');
  if (!secrets) { secrets = [scalar(), scalar(), scalar(), scalar()]; await savePrivate('role-secrets', secrets); }
  let password = await loadPrivate('storage-password');
  if (!password) { password = 'Aa1!' + randomBytes(32).toString('hex'); await savePrivate('storage-password', password); }
  const api = await import(pathToFileURL(path.join(upstream, 'zkloan-credit-scorer-cli/src/api.ts')));
  api.setLogger(pino({ level: 'warn' }));
  setNetworkId(config.networkId);
  const genesisHash = await genesis();
  const prior = await loadPrivate('deployment');
  if (prior) assert.equal(prior.genesisHash, genesisHash, 'Local chain changed; deployment cannot be reused');
  const walletSeed = config.allowDevelopmentSeed ? '0'.repeat(63) + '1' : await loadPrivate('wallet-seed');
  assert(walletSeed, 'Prepare the network-specific wallet first');
  const wallet = config.allowDevelopmentSeed ? await api.buildWalletFromHexSeed(config, walletSeed)
    : await persistentWallet({ seed: Buffer.from(walletSeed, 'hex'), config, project, load: loadPrivate, save: savePrivate });
  if (!config.allowDevelopmentSeed) {
    try {
      console.log('Preprod wallet: restored; synchronizing');
      await api.waitForSync(wallet.wallet);
      const balance = await api.displayWalletBalances(wallet.wallet);
      assert(balance.night > 0n, 'Preprod wallet needs faucet funding');
      const { registerDust } = await import(pathToFileURL(project + '/src/midnight/dust-registration.mjs'));
      const state = await wallet.wallet.waitForSyncedState();
      await registerDust({ context: wallet, availableCoins: state.unshielded.availableCoins, dustBalance: state.dust.balance(new Date()),
        load: loadPrivate, save: savePrivate,
        waitForDust: () => firstValueFrom(wallet.wallet.state().pipe(filter(s => s.dust.balance(new Date()) > 0n), timeout(180000))) });
      await wallet.checkpoint();
    } catch (error) { await wallet.close(); throw error; }
  }
  const walletProvider = await api.createWalletAndMidnightProvider(wallet);
  const zkPath = path.resolve('src/managed/policy');
  const zkConfigProvider = new NodeZkConfigProvider(zkPath);
  const timings = { proofs: [], submissions: [] };
  const rawProofProvider = httpClientProofProvider(config.proofServer, zkConfigProvider);
  const proofProvider = { async proveTx(...args) {
    const start = performance.now();
    const result = await rawProofProvider.proveTx(...args);
    timings.proofs.push({ durationMs: Math.round(performance.now() - start) });
    return result;
  } };
  const midnightProvider = { async submitTx(tx) {
    const started = performance.now();
    const startedAt = new Date().toISOString();
    const result = await walletProvider.submitTx(tx);
    timings.submissions.push({ started, startedAt, submittedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - started) });
    return result;
  } };
  const privateStateProvider = levelPrivateStateProvider({ privateStateStoreName: path.join(liveDirectory, 'state'),
    privateStoragePasswordProvider: () => password, accountId: wallet.unshieldedKeystore.getBech32Address().asString() });
  const providers = { privateStateProvider, publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider, proofProvider, walletProvider, midnightProvider };
  const compiledContract = CompiledContract.make('ProofPassPolicy', Contract).pipe(
    CompiledContract.withWitnesses(witnesses), CompiledContract.withCompiledFileAssets(zkPath));
  return { providers, compiledContract, secrets, roleKeys: secrets.map(ecMulGenerator), genesisHash, timings,
    close: () => config.allowDevelopmentSeed ? api.closeWallet(wallet) : wallet.close(),
    async deploy(policy) {
      assert.equal(await loadPrivate('deployment-started'), null, 'Prior deployment intent needs reconciliation');
      await savePrivate('deployment-started', { policy, roleKeys: secrets.map(ecMulGenerator), genesisHash });
      const contract = await deployContract(providers, { compiledContract, privateStateId: 'livePolicy', initialPrivateState: {},
        args: [policy, secrets.map(ecMulGenerator)] });
      const receipt = contract.deployTxData.public;
      await savePrivate('deployment', { address: receipt.contractAddress, receipt, policy, roleKeys: secrets.map(ecMulGenerator), genesisHash });
      return contract;
    },
    async join() {
      const saved = await loadPrivate('deployment');
      assert(saved, 'Deploy live policy first');
      const confirmed = await providers.publicDataProvider.queryContractState(saved.address);
      assert(confirmed, 'Pinned contract not found on current chain');
      const current = ledger(confirmed.data);
      assert.deepEqual(current.configuration, saved.policy, 'Pinned configuration changed');
      assert.deepEqual(current.roleKeys, saved.roleKeys, 'Pinned role keys changed');
      return findDeployedContract(providers, { contractAddress: saved.address, compiledContract,
        privateStateId: 'livePolicy', initialPrivateState: {} });
    } };
}
