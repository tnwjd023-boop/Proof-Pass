// Resumable Gate 0 experiment; no cross-chain authorization claims.
import assert from 'node:assert/strict';
import { readFile, writeFile, rename, mkdir, open, unlink } from 'node:fs/promises';
import { Connection, Keypair, SystemProgram } from '@solana/web3.js';
import bs58 from 'bs58';
import { PROGRAM_ID, DEVNET_GENESIS, key, vaultAddress, initialize, pay, signed } from './solana-client.mjs';

const local = process.argv.includes('--local-test');
const execute = process.argv.includes('--execute');
const root = new URL('../../', import.meta.url);
const dir = new URL(local ? '.local/solana-gate0/local-workflow/' : '.local/solana-gate0/', root);
const connection = new Connection(local ? 'http://127.0.0.1:18899' : 'https://api.devnet.solana.com', 'finalized');
async function load(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function save(path, value) {
  const temp = new URL(path.href + '.tmp');
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(temp, path);
}
await mkdir(dir, { recursive: true });
const lockPath = new URL('payout.lock', dir);
const lock = await open(lockPath, 'wx');
await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
try {
  const genesis = await connection.getGenesisHash();
  if (!local) assert.equal(genesis, DEVNET_GENESIS);
  else assert.notEqual(genesis, DEVNET_GENESIS);
  let payer;
  if (local) {
    const path = new URL('payer.json', dir);
    let bytes = await load(path);
    if (!bytes) { bytes = [...Keypair.generate().secretKey]; await save(path, bytes); }
    payer = Keypair.fromSecretKey(Uint8Array.from(bytes));
    if (execute && await connection.getBalance(payer.publicKey) === 0) {
      await connection.confirmTransaction(await connection.requestAirdrop(payer.publicKey, 1_000_000_000), 'finalized');
    }
  } else payer = await key('payer');
  const recipient = await key('recipient');
  const vault = vaultAddress(payer.publicKey);
  const program = await connection.getAccountInfo(PROGRAM_ID);
  const balance = await connection.getBalance(payer.publicKey);
  const state = { mode: local ? 'local-validator-workflow' : 'Solana Devnet', genesis,
    programId: PROGRAM_ID.toBase58(), payer: payer.publicKey.toBase58(),
    recipient: recipient.publicKey.toBase58(), vault: vault.toBase58(), payerBalanceLamports: balance,
    programExecutable: Boolean(program?.executable), observedAt: new Date().toISOString() };
  if (!execute) {
    await save(new URL(`evidence/gate0/solana-${local ? 'local-' : ''}preflight.json`, root), state);
    console.log(JSON.stringify(state, null, 2));
  } else {
    assert.ok(program?.executable, 'Program must be deployed first');
    const journalPath = new URL('payout-journal.json', dir);
    const binding = { genesis, program: state.programId, payer: state.payer, recipient: state.recipient, vault: state.vault };
    const journal = await load(journalPath) ?? { binding, steps: {} };
    assert.deepEqual(journal.binding, binding, 'Journal/network/account mismatch');
    const receipts = {};
    const definitions = [
      ['initialize', () => [initialize(payer.publicKey)]],
      ['deposit', () => [SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: vault, lamports: 100_000_000 })]],
      ['payout', () => [pay(payer.publicKey, recipient.publicKey, 50_000_000)]],
    ];
    for (const [name, instructions] of definitions) {
      if (!journal.steps[name]) {
        if (name === 'initialize') assert.equal(await connection.getAccountInfo(vault), null, 'Unexpected existing vault');
        else {
          const info = await connection.getAccountInfo(vault);
          assert.equal(info?.owner.toBase58(), state.programId);
          assert.equal(info.data.length, 41);
          assert.deepEqual(info.data.subarray(8, 40), payer.publicKey.toBuffer());
        }
        const prepared = await signed(connection, payer, instructions());
        journal.steps[name] = { signature: bs58.encode(prepared.transaction.signature),
          bytes: prepared.bytes.toString('base64'), block: prepared.block, preparedAt: new Date().toISOString() };
        await save(journalPath, journal); // Persist exact signed intent before submission.
      }
      const intent = journal.steps[name];
      let status = (await connection.getSignatureStatuses([intent.signature], { searchTransactionHistory: true })).value[0];
      if (status?.err) throw new Error(`${name} failed: ${JSON.stringify(status.err)}`);
      if (status?.confirmationStatus !== 'finalized') {
        if (!status) {
          assert.ok(await connection.getBlockHeight('finalized') <= intent.block.lastValidBlockHeight,
            `${name} expired unresolved; no replacement transaction will be signed`);
          assert.equal(await connection.sendRawTransaction(Buffer.from(intent.bytes, 'base64'), {
            skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3,
          }), intent.signature);
        }
        const confirmed = await connection.confirmTransaction({ signature: intent.signature, ...intent.block }, 'finalized');
        assert.equal(confirmed.value.err, null);
      }
      const receipt = await connection.getTransaction(intent.signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
      assert.ok(receipt?.meta);
      assert.equal(receipt.meta.err, null);
      const addresses = receipt.transaction.message.staticAccountKeys.map(k => k.toBase58());
      const delta = address => {
        const i = addresses.indexOf(address);
        assert.ok(i >= 0, `Receipt missing ${address}`);
        return { before: receipt.meta.preBalances[i], after: receipt.meta.postBalances[i], change: receipt.meta.postBalances[i] - receipt.meta.preBalances[i] };
      };
      receipts[name] = { signature: intent.signature, finalized: true, slot: receipt.slot, blockTime: receipt.blockTime,
        feeLamports: receipt.meta.fee, vault: delta(state.vault), payer: delta(state.payer) };
      if (name === 'payout') {
        receipts[name].recipient = delta(state.recipient);
        assert.equal(receipts[name].vault.change, -50_000_000);
        assert.equal(receipts[name].recipient.change, 50_000_000);
        assert.equal(receipts[name].payer.change, -receipt.meta.fee);
      }
      if (name === 'deposit') assert.equal(receipts[name].vault.change, 100_000_000);
      console.log(`${name}: finalized ${intent.signature}`);
    }
    const finalVault = await connection.getAccountInfo(vault);
    assert.equal(finalVault.owner.toBase58(), state.programId);
    const rent = await connection.getMinimumBalanceForRentExemption(finalVault.data.length);
    assert.equal(finalVault.lamports, rent + 50_000_000);
    const report = { ...state, status: 'passed', receipts, vaultOwner: finalVault.owner.toBase58(),
      finalVaultLamports: finalVault.lamports, rentLamports: rent,
      note: 'Gate 0 user-signed program payout only; cross-chain authorization is not implemented', completedAt: new Date().toISOString() };
    await save(new URL(`evidence/gate0/solana-${local ? 'local-workflow' : 'devnet-payout'}.json`, root), report);
    console.log('Program vault payout verified; existing journal prevents a second payment on resume.');
  }
} finally { await lock.close(); await unlink(lockPath); }
