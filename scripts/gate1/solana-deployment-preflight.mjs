import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Connection } from '@solana/web3.js';
import { key, PROGRAM_ID } from './solana-client.mjs';
const connection = new Connection('https://api.devnet.solana.com', 'finalized');
const genesis = await connection.getGenesisHash();
assert.equal(genesis, 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
const binary = await readFile(process.argv[2]);
const payer = await key('payer');
const program = await connection.getAccountInfo(PROGRAM_ID);
const balance = await connection.getBalance(payer.publicKey);
const rent = await connection.getMinimumBalanceForRentExemption(binary.length + 45);
const required = rent * 2 + 150_000_000;
const report = { network: 'Solana Devnet', genesis, programId: PROGRAM_ID.toBase58(), payer: payer.publicKey.toBase58(),
  programExists: program !== null, payerLamports: balance, conservativeRequiredLamports: required,
  shortfallLamports: Math.max(0, required - balance), binaryBytes: binary.length,
  binarySha256: createHash('sha256').update(binary).digest('hex'), programDataRentLamports: rent,
  observedAt: new Date().toISOString() };
await writeFile(new URL('../../evidence/gate1/solana-deployment-preflight.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--require-ready')) {
  assert.equal(program, null, 'Existing deployment must be reconciled before upgrade');
  assert(balance >= required, 'Insufficient test SOL for conservative deployment budget');
}
