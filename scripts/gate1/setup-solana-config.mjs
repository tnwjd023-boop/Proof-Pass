import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { Connection, SystemProgram } from '@solana/web3.js';
import * as api from './solana-client.mjs';
import { submitIntent } from '../../src/solana/intents.mjs';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const genesis = await connection.getGenesisHash();
assert.equal(genesis, 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
const [owner, agent, relay, observer] = await Promise.all(['payer', 'agent', 'relay', 'observer'].map(api.key));
const directory = new URL('../../.local/solana-gate1/setup/', import.meta.url);
await mkdir(directory, { recursive: true });
const intents = [];
const config = await connection.getAccountInfo(api.configAddress(), 'finalized');
if (!config) {
  const result = await submitIntent(connection, owner, [api.initializeConfig(owner.publicKey, relay.publicKey, observer.publicKey,
    api.hash('PROOFPASS:AGENT_PAYMENT_AUTH:V1'), Buffer.from(api.hex(genesis), 'hex'))], new URL('config.json', directory));
  assert.equal(result.error, null); intents.push(result);
}
const observed = await api.account(connection, api.configAddress(), 'Config');
assert.equal(observed.admin, api.hex(owner.publicKey));
assert.equal(observed.relay, api.hex(relay.publicKey));
assert.equal(observed.observer, api.hex(observer.publicKey));
assert.equal(observed.policyId, api.hash('PROOFPASS:AGENT_PAYMENT_AUTH:V1').toString('hex'));
assert.equal(observed.policyVersion, 1);
assert.equal(observed.cluster, api.hex(genesis));
for (const [name, wallet] of [['agent', agent], ['relay', relay], ['observer', observer]]) {
  const balance = await connection.getBalance(wallet.publicKey, 'finalized');
  if (balance < 50_000_000) {
    const result = await submitIntent(connection, owner, [SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: wallet.publicKey, lamports: 50_000_000 })], new URL(name + '-funding.json', directory));
    assert.equal(result.error, null); intents.push(result);
  }
}
for (let n = 0; n < 60; n++) {
  const statuses = (await connection.getSignatureStatuses(intents.map(i => i.signature), { searchTransactionHistory: true })).value;
  if (statuses.every(s => s?.confirmationStatus === 'finalized' && s.err === null)) break;
  assert(n < 59, 'Setup finality timeout');
  await new Promise(resolve => setTimeout(resolve, 1000));
}
await writeFile(new URL('../../evidence/gate1/solana-config.json', import.meta.url), JSON.stringify({ status: 'passed', network: 'Devnet',
  programId: api.PROGRAM_ID.toBase58(), configuredRoles: ['relay', 'observer'], feeFunding: '0.05 test SOL per role wallet',
  finalizedSignatures: intents.map(i => i.signature), fullGate1Complete: false, completedAt: new Date().toISOString() }, null, 2) + '\n');
console.log('Devnet config verified; role wallets funded and setup transactions finalized.');
