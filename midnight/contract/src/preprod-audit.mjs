// Read-only account replay using the stored public key; never reads a seed or signs.
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { UnshieldedWallet, InMemoryTransactionHistoryStorage, WalletEntrySchema } from '@midnight-ntwrk/wallet-sdk';
import { config, loadPrivate } from './live-runtime.mjs';
globalThis.WebSocket = WebSocket;
assert.equal(config.networkId, 'preprod');
const snapshot = await loadPrivate('wallet-snapshot');
const original = JSON.parse(snapshot.unshielded);
const wallet = UnshieldedWallet({ networkId: config.networkId,
  indexerClientConnection: { indexerHttpUrl: config.indexer, indexerWsUrl: config.indexerWS },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema) }).startWithPublicKey(original.publicKey);
let timeout;
try {
  await wallet.start();
  const state = await Promise.race([wallet.waitForSyncedState(), new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('Public account audit timeout')), 120000); })]);
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), audit: 'fresh-public-account-replay',
    availableValue: state.availableCoins.reduce((sum, coin) => sum + coin.utxo.value, 0n).toString(),
    availableCoins: state.availableCoins.length, registeredCoins: state.availableCoins.filter(coin => coin.meta.registeredForDustGeneration).length,
    appliedId: String(state.progress.appliedId),
    sameAsPendingInput: state.availableCoins.some(coin => original.state.pendingUtxos.some(old => old.utxo.intentHash === coin.utxo.intentHash && old.utxo.outputNo === coin.utxo.outputNo)) }));
} finally { clearTimeout(timeout); await wallet.stop(); }
