// Wallet initialization derived from Midnight Foundation example-zkloan api.ts.
// Copyright (C) 2025 Midnight Foundation. SPDX-License-Identifier: Apache-2.0.
// Modifications: network/account-bound SDK snapshots and periodic persistence.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import * as ledger from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { HDWallet, Roles, WalletFacade, ShieldedWallet, DustWallet, UnshieldedWallet,
  createKeystore, InMemoryTransactionHistoryStorage, WalletEntrySchema, PublicKey } from '@midnight-ntwrk/wallet-sdk';
import { preprodSubmission } from './preprod-submission.mjs';

export async function persistentWallet({ seed, config, project, load, save }) {
  const { validateWalletSnapshot } = await import(pathToFileURL(project + '/src/midnight/wallet-snapshot.mjs'));
  const hd = HDWallet.fromSeed(seed);
  assert.equal(hd.type, 'seedOk');
  const derived = hd.hdWallet.selectAccount(0).selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
  assert.equal(derived.type, 'keysDerived');
  hd.hdWallet.clear();
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derived.keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(derived.keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(derived.keys[Roles.NightExternal], config.networkId);
  const address = unshieldedKeystore.getBech32Address().asString();
  const identity = { network: config.networkId, genesis: config.genesisHash, address };
  const snapshot = await load('wallet-snapshot');
  if (snapshot) validateWalletSnapshot(snapshot, identity);
  const configuration = () => ({ networkId: config.networkId,
    indexerClientConnection: { indexerHttpUrl: config.indexer, indexerWsUrl: config.indexerWS },
    provingServerUrl: new URL(config.proofServer), relayURL: new URL(config.node.replace(/^http/, 'ws')),
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema) });
  const submissionService = await preprodSubmission(config, project);
  const wallet = await WalletFacade.init({ configuration: configuration(), submissionService: () => submissionService,
    shielded: () => snapshot ? ShieldedWallet(configuration()).restore(snapshot.shielded) : ShieldedWallet(configuration()).startWithSecretKeys(shieldedSecretKeys),
    unshielded: () => snapshot ? UnshieldedWallet(configuration()).restore(snapshot.unshielded) : UnshieldedWallet(configuration()).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: () => snapshot ? DustWallet(configuration()).restore(snapshot.dust) : DustWallet(configuration()).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust) });
  await wallet.start(shieldedSecretKeys, dustSecretKey);
  if (process.env.PROOFPASS_TRACE_WALLET === '1') {
    for (const [name, component, methods] of [
      ['unshielded', wallet.unshielded, ['rotateUtxos', 'signUnprovenTransaction']],
      ['dust', wallet.dust, ['attachDustRegistration', 'calculateFee', 'addDustRegistrationSignature']],
      ['wallet', wallet, ['finalizeRecipe', 'submitTransaction']]]) {
      for (const method of methods) {
        const original = component[method].bind(component);
        component[method] = async (...args) => {
          console.log('Wallet diagnostic: ' + name + '.' + method + ' started');
          const result = await original(...args);
          console.log('Wallet diagnostic: ' + name + '.' + method + ' completed');
          return result;
        };
      }
    }
  }
  let saving = Promise.resolve();
  const checkpoint = () => {
    saving = saving.then(async () => {
      const [shielded, unshielded, dust] = await Promise.all([wallet.shielded.serializeState(), wallet.unshielded.serializeState(), wallet.dust.serializeState()]);
      await save('wallet-snapshot', { ...identity, shielded, unshielded, dust, savedAt: new Date().toISOString() });
    });
    return saving;
  };
  let persistenceError;
  const timer = setInterval(() => { if (!persistenceError) checkpoint().catch(error => { persistenceError = error; }); }, 30000);
  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore, checkpoint,
    async close() {
      clearInterval(timer);
      try { await checkpoint(); if (persistenceError) throw persistenceError; }
      finally { await wallet.stop(); }
    } };
}
