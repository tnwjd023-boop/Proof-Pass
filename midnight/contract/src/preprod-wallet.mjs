import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import pino from 'pino';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { config, project, upstream, loadPrivate, savePrivate } from './live-runtime.mjs';
import { persistentWallet } from './persistent-wallet.mjs';
assert.equal(config.networkId, 'preprod');
assert.equal(config.allowDevelopmentSeed, false);
let seed = await loadPrivate('wallet-seed');
if (!seed) { seed = randomBytes(32).toString('hex'); await savePrivate('wallet-seed', seed); }
const api = await import(pathToFileURL(upstream + '/zkloan-credit-scorer-cli/src/api.ts'));
api.setLogger(pino({ level: 'warn' }));
setNetworkId(config.networkId);
let wallet;
let subscription;
try {
  wallet = await persistentWallet({ seed: Buffer.from(seed, 'hex'), config, project, load: loadPrivate, save: savePrivate });
  const address = wallet.unshieldedKeystore.getBech32Address().asString();
  assert(address.startsWith('mn_addr_preprod'));
  await mkdir(project + '/.local/midnight-preprod', { recursive: true });
  const publicInfo = { network: config.networkId, address, faucet: config.faucet };
  await writeFile(project + '/.local/midnight-preprod/wallet-public.json', JSON.stringify(publicInfo, null, 2) + '\n');
  console.log(JSON.stringify(publicInfo));
  let lastProgress = 0;
  subscription = wallet.wallet.state().subscribe({ next(state) {
    if (Date.now() - lastProgress < 60000) return;
    lastProgress = Date.now();
    const progress = item => ({ isSynced: item?.isSynced, progress: item?.progress, stateKeys: Object.keys(item ?? {}) });
    console.log(JSON.stringify({ isSynced: state.isSynced, shielded: progress(state.shielded), unshielded: progress(state.unshielded), dust: progress(state.dust) }, (_, value) => typeof value === 'bigint' ? String(value) : value));
  }, error(error) { console.error('Wallet state stream failed: ' + error.message); } });
  let timer;
  try { await Promise.race([api.waitForSync(wallet.wallet), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Wallet sync timeout; snapshot retained')), 10800000); })]); }
  finally { clearTimeout(timer); }
  const balance = await api.displayWalletBalances(wallet.wallet);
  console.log(JSON.stringify({ night: String(balance.night), dust: String(balance.dust), synchronized: true }));
  await writeFile(project + '/.local/midnight-preprod/balance.json', JSON.stringify({ night: String(balance.night), dust: String(balance.dust), checkedAt: new Date().toISOString() }));
} finally { subscription?.unsubscribe(); if (wallet) await wallet.close(); }
