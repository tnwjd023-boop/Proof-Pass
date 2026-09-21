import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Keypair } from '@solana/web3.js';
const dir = new URL('../../.local/solana-gate1/', import.meta.url);
await mkdir(dir, { recursive: true });
const addresses = {};
for (const role of ['program', 'agent', 'relay', 'observer']) {
  const file = new URL(role + '.json', dir);
  let key;
  try { key = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(file, 'utf8')))); }
  catch (e) {
    if (e.code !== 'ENOENT') throw e;
    key = Keypair.generate();
    await writeFile(file, JSON.stringify([...key.secretKey]) + '\n', { flag: 'wx', mode: 0o600 });
  }
  addresses[role] = key.publicKey.toBase58();
}
await writeFile(new URL('addresses.json', dir), JSON.stringify(addresses, null, 2) + '\n');
console.log(JSON.stringify(addresses, null, 2));
