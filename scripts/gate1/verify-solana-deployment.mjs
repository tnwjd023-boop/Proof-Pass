import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Connection, PublicKey } from '@solana/web3.js';
import { PROGRAM_ID, key } from './solana-client.mjs';
const root = new URL('../../', import.meta.url);
const json = async file => JSON.parse(await readFile(new URL(file, root), 'utf8'));
const deployment = await json('.local/solana-gate1/deployment.json');
const expected = await json('.local/solana-gate1/deployment-started.json');
const connection = new Connection('https://api.devnet.solana.com', 'finalized');
assert.equal(await connection.getGenesisHash(), 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
assert.equal(deployment.programId, PROGRAM_ID.toBase58());
assert.equal(expected.programId, deployment.programId);
let status;
for (let attempt = 0; attempt < 40; attempt++) {
  status = (await connection.getSignatureStatuses([deployment.signature], { searchTransactionHistory: true })).value[0];
  if (status?.confirmationStatus === 'finalized') break;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
assert.equal(status?.confirmationStatus, 'finalized');
assert.equal(status.err, null);
const receipt = await connection.getTransaction(deployment.signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
assert(receipt?.meta && receipt.meta.err === null);
assert(receipt.transaction.message.staticAccountKeys.some(k => k.equals(PROGRAM_ID)));
const program = await connection.getAccountInfo(PROGRAM_ID);
assert(program?.executable);
assert.equal(program.owner.toBase58(), 'BPFLoaderUpgradeab1e11111111111111111111111');
assert.equal(program.data.readUInt32LE(0), 2, 'Expected upgradeable Program account');
const programDataAddress = new PublicKey(program.data.subarray(4, 36));
assert(programDataAddress.equals(PublicKey.findProgramAddressSync([PROGRAM_ID.toBuffer()], program.owner)[0]));
const data = await connection.getAccountInfo(programDataAddress);
assert(data && data.owner.equals(program.owner));
assert.equal(data.data.readUInt32LE(0), 3, 'Expected ProgramData account');
assert.equal(data.data[12], 1, 'Expected retained upgrade authority');
assert(new PublicKey(data.data.subarray(13, 45)).equals((await key('payer')).publicKey));
const binary = data.data.subarray(45);
const digest = createHash('sha256').update(binary).digest('hex');
assert.equal(digest, expected.binarySha256);
assert.equal(binary.length, expected.binaryBytes);
await writeFile(new URL('.local/solana-gate1/deployed.so', root), binary);
const report = { status: 'passed', network: 'Solana Devnet', programId: PROGRAM_ID.toBase58(),
  signature: deployment.signature, finalized: true, slot: receipt.slot, executable: true,
  binaryBytes: binary.length, binarySha256: digest, matchesTestedBinary: true,
  explorer: `https://explorer.solana.com/tx/${deployment.signature}?cluster=devnet`, verifiedAt: new Date().toISOString() };
await writeFile(new URL('evidence/gate1/solana-authorization-deployment.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
