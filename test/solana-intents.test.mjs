import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Keypair, SystemProgram } from '@solana/web3.js';
import { submitIntent } from '../src/solana/intents.mjs';

async function fixture(fn) {
  const directory = await mkdtemp(join(tmpdir(), 'proofpass-intent-'));
  const payer = Keypair.generate(), recipient = Keypair.generate();
  const instruction = n => SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: recipient.publicKey, lamports: n });
  let status = null, sends = 0, height = 100;
  const connection = { getLatestBlockhash: async () => ({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 150 }),
    getSignatureStatuses: async () => ({ value: [status] }), getBlockHeight: async () => height,
    sendRawTransaction: async () => { sends++; status = { confirmationStatus: 'confirmed', err: null }; } };
  const path = join(directory, 'intent.json');
  try { await fn({ payer, instruction, connection, path, sends: () => sends, setStatus: value => { status = value; }, setHeight: n => { height = n; } }); }
  finally {
    assert(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'proofpass-intent-'));
    await rm(directory, { recursive: true, force: true });
  }
}
test('a confirmed persisted Solana intent is reconciled without a new signature or send', () => fixture(async f => {
  const first = await submitIntent(f.connection, f.payer, [f.instruction(1)], f.path);
  assert.equal(first.error, null);
  const stored = JSON.parse(await readFile(f.path, 'utf8'));
  assert(stored.bytes && stored.signature);
  f.setHeight(200);
  const resumed = await submitIntent(f.connection, f.payer, [f.instruction(1)], f.path);
  assert.equal(resumed.signature, first.signature);
  assert.equal(f.sends(), 1);
}));
test('expired unresolved or changed Solana intents stop without replacement', () => fixture(async f => {
  await submitIntent(f.connection, f.payer, [f.instruction(1)], f.path);
  await assert.rejects(submitIntent(f.connection, f.payer, [f.instruction(2)], f.path), /Changed/);
  f.setStatus(null); f.setHeight(151);
  await assert.rejects(submitIntent(f.connection, f.payer, [f.instruction(1)], f.path), /Expired unresolved/);
  assert.equal(f.sends(), 1);
}));
test('file URL journals persist atomically on Windows and Linux', () => fixture(async f => {
  const result = await submitIntent(f.connection, f.payer, [f.instruction(1)], pathToFileURL(f.path));
  assert.equal(result.error, null);
  assert.equal(JSON.parse(await readFile(f.path, 'utf8')).signature, result.signature);
}));
