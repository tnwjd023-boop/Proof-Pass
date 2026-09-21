// Read-only chain verification of the CLI deployment and downloaded program bytes.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Connection } from '@solana/web3.js';
import { PROGRAM_ID, DEVNET_GENESIS } from './solana-client.mjs';
const root = new URL('../../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const deployment = await json('.local/solana-gate0/deployment.json');
const expected = await json('evidence/gate0/solana-deployment-preflight.json');
const connection = new Connection('https://api.devnet.solana.com', 'finalized');
assert.equal(await connection.getGenesisHash(), DEVNET_GENESIS);
assert.equal(deployment.programId, PROGRAM_ID.toBase58());
assert.equal(expected.programId, deployment.programId);
const status = (await connection.getSignatureStatuses([deployment.signature], { searchTransactionHistory: true })).value[0];
assert.equal(status?.confirmationStatus, 'finalized');
assert.equal(status.err, null);
const receipt = await connection.getTransaction(deployment.signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
assert.ok(receipt?.meta);
assert.equal(receipt.meta.err, null);
assert.ok(receipt.transaction.message.staticAccountKeys.some(k => k.equals(PROGRAM_ID)));
const program = await connection.getAccountInfo(PROGRAM_ID);
assert.equal(program?.executable, true);
assert.equal(program.owner.toBase58(), 'BPFLoaderUpgradeab1e11111111111111111111111');
const downloaded = await readFile(new URL('.local/solana-gate0/deployed.so', root));
const hash = createHash('sha256').update(downloaded).digest('hex');
assert.equal(hash, expected.binarySha256, 'Deployed binary differs from tested SBF artifact');
assert.equal(downloaded.length, expected.binaryBytes);
const report = { network: 'Solana Devnet', genesis: DEVNET_GENESIS, status: 'passed',
  programId: deployment.programId, executable: true, owner: program.owner.toBase58(),
  signature: deployment.signature, finalized: true, slot: receipt.slot, blockTime: receipt.blockTime,
  finalDeploymentTransactionFeeLamports: receipt.meta.fee,
  feeNote: 'Final deployment transaction only; buffer creation and writes have separate fees',
  binaryBytes: downloaded.length, deployedBinarySha256: hash, matchesTestedBinary: true,
  explorer: `https://explorer.solana.com/tx/${deployment.signature}?cluster=devnet`,
  verifiedAt: new Date().toISOString() };
await writeFile(new URL('evidence/gate0/solana-devnet-deployment.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
