import assert from 'node:assert/strict';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Transaction } from '@solana/web3.js';
import bs58 from 'bs58';

export async function submitIntent(connection, payer, instructions, path, { beforeNew = async () => {}, additionalSigners = [] } = {}) {
  if (path instanceof URL) path = fileURLToPath(path);
  const fingerprint = createHash('sha256').update(JSON.stringify({ payer: payer.publicKey.toBase58(),
    instructions: instructions.map(i => ({ program: i.programId.toBase58(), data: i.data.toString('hex'),
      keys: i.keys.map(k => [k.pubkey.toBase58(), k.isSigner, k.isWritable]) })) })).digest('hex');
  let intent;
  try { intent = JSON.parse(await readFile(path, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const persist = async () => {
    await writeFile(path + '.tmp', JSON.stringify(intent, null, 2) + '\n', { mode: 0o600 });
    await rename(path + '.tmp', path);
  };
  if (!intent) {
    await beforeNew();
    const block = await connection.getLatestBlockhash('confirmed');
    const transaction = new Transaction({ feePayer: payer.publicKey, ...block }).add(...instructions);
    transaction.sign(...new Map([payer, ...additionalSigners].map(k => [k.publicKey.toBase58(), k])).values());
    intent = { fingerprint, signature: bs58.encode(transaction.signature), bytes: transaction.serialize().toString('base64'), ...block };
    await persist();
  }
  assert.equal(intent.fingerprint, fingerprint, 'Changed durable Solana request');
  let status = (await connection.getSignatureStatuses([intent.signature], { searchTransactionHistory: true })).value[0];
  if (!['confirmed', 'finalized'].includes(status?.confirmationStatus)) {
    assert(await connection.getBlockHeight('confirmed') <= intent.lastValidBlockHeight,
      'Expired unresolved Solana intent; reconcile before replacement');
    await connection.sendRawTransaction(Buffer.from(intent.bytes, 'base64'), { skipPreflight: true, maxRetries: 3 });
    for (let attempt = 0; attempt < 60; attempt++) {
      status = (await connection.getSignatureStatuses([intent.signature], { searchTransactionHistory: true })).value[0];
      if (['confirmed', 'finalized'].includes(status?.confirmationStatus)) break;
      await delay(500);
    }
  }
  assert(['confirmed', 'finalized'].includes(status?.confirmationStatus), 'Solana intent still pending; retain journal');
  intent.result = { signature: intent.signature, error: status.err, confirmationStatus: status.confirmationStatus };
  await persist();
  return intent.result;
}
