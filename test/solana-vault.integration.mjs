// Real local validator integration. This is not a mock or Devnet evidence.
import assert from 'node:assert/strict';
import { Connection, Keypair, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { writeFile } from 'node:fs/promises';
import { PROGRAM_ID, key, vaultAddress, initialize, pay, send } from '../scripts/gate0/solana-client.mjs';
const connection = new Connection('http://127.0.0.1:18899', 'confirmed');
const payer = await key('payer');
const recipient = await key('recipient');
const attacker = Keypair.generate();
const vault = vaultAddress(payer.publicKey);
const results = [];
for (const wallet of [payer, attacker]) {
  const signature = await connection.requestAirdrop(wallet.publicKey, 10 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(signature, 'confirmed');
}
const program = await connection.getAccountInfo(PROGRAM_ID);
assert.ok(program?.executable, 'Local validator must load the compiled program');
assert.equal((await send(connection, payer, [initialize(payer.publicKey)])).error, null);
assert.equal((await send(connection, payer, [SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: vault, lamports: 100_000_000 })])).error, null);
const vaultInfo = await connection.getAccountInfo(vault);
assert.equal(vaultInfo.owner.toBase58(), PROGRAM_ID.toBase58());
const rent = await connection.getMinimumBalanceForRentExemption(vaultInfo.data.length);
async function balances() { return [await connection.getBalance(vault), await connection.getBalance(recipient.publicKey)]; }
async function denied(name, signer, instructions) {
  const before = await balances();
  const result = await send(connection, signer, instructions);
  assert.notEqual(result.error, null, `${name} unexpectedly succeeded`);
  assert.deepEqual(await balances(), before, `${name} moved funds`);
  results.push({ name, status: 'rejected', signature: result.signature, error: result.error, vaultAndRecipientUnchanged: true });
}
await denied('missing-authority-signature', attacker, [pay(payer.publicKey, recipient.publicKey, 50_000_000, { signer: false })]);
await denied('wrong-authority', attacker, [pay(attacker.publicKey, recipient.publicKey, 50_000_000, { vault })]);
await denied('wrong-vault-owner', payer, [pay(payer.publicKey, recipient.publicKey, 50_000_000, { vault: attacker.publicKey })]);
await denied('insufficient-balance-and-rent', payer, [pay(payer.publicKey, recipient.publicKey, 100_000_001)]);
await denied('zero-amount', payer, [pay(payer.publicKey, recipient.publicKey, 0)]);
await denied('failed-transaction-is-atomic', payer, [pay(payer.publicKey, recipient.publicKey, 50_000_000),
  SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: recipient.publicKey, lamports: 1_000_000_000_000 })]);
const before = await balances();
const payment = await send(connection, payer, [pay(payer.publicKey, recipient.publicKey, 50_000_000)]);
assert.equal(payment.error, null);
assert.deepEqual(await balances(), [before[0] - 50_000_000, before[1] + 50_000_000]);
results.push({ name: 'exact-0.05-sol-program-payout', status: 'passed', signature: payment.signature });
const after = await balances();
assert.equal(await connection.sendRawTransaction(payment.bytes, { skipPreflight: true }), payment.signature);
assert.deepEqual(await balances(), after);
results.push({ name: 'identical-signed-transaction-replay', status: 'passed', note: 'Solana tx deduplication only; not product authorization replay protection' });
assert.equal((await send(connection, payer, [pay(payer.publicKey, recipient.publicKey, after[0] - rent)])).error, null);
assert.equal(await connection.getBalance(vault), rent);
results.push({ name: 'rent-floor-preserved', status: 'passed', rentLamports: rent });
await denied('cannot-spend-final-rent', payer, [pay(payer.publicKey, recipient.publicKey, 1)]);
const report = { mode: 'local-validator', programId: PROGRAM_ID.toBase58(), passed: results.length, results, completedAt: new Date().toISOString() };
await writeFile(new URL('../evidence/gate0/solana-local-tests.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
