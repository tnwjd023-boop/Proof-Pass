import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { Connection } from '@solana/web3.js';
import { key, DEVNET_GENESIS } from './solana-client.mjs';
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
assert.equal(await connection.getGenesisHash(), DEVNET_GENESIS);
const payer = await key('payer');
const before = await connection.getBalance(payer.publicKey);
console.log(`Devnet payer ${payer.publicKey.toBase58()}, balance ${before} lamports`);
const fundingPath = new URL('../../.local/solana-gate0/funding.json', import.meta.url);
let previous;
try { previous = JSON.parse(await readFile(fundingPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (previous) {
  const status = (await connection.getSignatureStatuses([previous.signature], { searchTransactionHistory: true })).value[0];
  assert.ok(status, 'Existing faucet request is unresolved; do not request again automatically');
  assert.equal(status.err, null, 'Previous airdrop failed');
  console.log(`Existing faucet signature ${previous.signature}: ${status.confirmationStatus}. No new request sent.`);
  process.exit(0);
}
if (before < 2_000_000_000) {
  const signature = await connection.requestAirdrop(payer.publicKey, 2_000_000_000);
  await writeFile(fundingPath, JSON.stringify({ signature, requestedLamports: 2_000_000_000, requestedAt: new Date().toISOString() }), { flag: 'wx' });
  assert.equal((await connection.confirmTransaction(signature, 'confirmed')).value.err, null);
  console.log(`Airdrop ${signature}; balance ${await connection.getBalance(payer.publicKey)} lamports`);
}
