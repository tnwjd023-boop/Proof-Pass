import { Keypair } from '@solana/web3.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const directory = new URL('../../.local/solana-gate0/', import.meta.url);
await mkdir(directory, { recursive: true, mode: 0o700 });
for (const role of ['program', 'payer', 'recipient']) {
  const path = new URL(`${role}.json`, directory);
  let key;
  try { key = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(path, 'utf8')))); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    key = Keypair.generate();
    await writeFile(path, JSON.stringify(Array.from(key.secretKey)), { flag: 'wx', mode: 0o600 });
  }
  console.log(`${role}: ${key.publicKey.toBase58()}`);
}
