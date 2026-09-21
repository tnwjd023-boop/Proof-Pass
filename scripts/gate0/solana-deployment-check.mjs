import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Connection } from '@solana/web3.js';
import { key, PROGRAM_ID, DEVNET_GENESIS } from './solana-client.mjs';
const connection = new Connection('https://api.devnet.solana.com', 'finalized');
assert.equal(await connection.getGenesisHash(), DEVNET_GENESIS);
const binary = await readFile(process.argv[2]);
const payer = await key('payer');
// Null is the only accepted absence result. RPC errors always stop deployment.
const program = await connection.getAccountInfo(PROGRAM_ID);
const balance = await connection.getBalance(payer.publicKey);
const rent = await connection.getMinimumBalanceForRentExemption(binary.length + 45);
const required = rent * 2 + 150_000_000; // Conservative buffer + program + experiment/fee allowance.
const report = { network: 'Solana Devnet', programId: PROGRAM_ID.toBase58(), payer: payer.publicKey.toBase58(),
  programExists: program !== null, payerLamports: balance, conservativeRequiredLamports: required,
  binaryBytes: binary.length, binarySha256: createHash('sha256').update(binary).digest('hex'),
  programDataRentLamports: rent, observedAt: new Date().toISOString() };
await writeFile(new URL('../../evidence/gate0/solana-deployment-preflight.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
assert.equal(program, null, 'Program already exists; reconcile prior deployment before any upgrade');
assert.ok(balance >= required, 'Dedicated Devnet payer needs test SOL before deployment');
