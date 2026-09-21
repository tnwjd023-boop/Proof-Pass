import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Connection, ComputeBudgetProgram } from '@solana/web3.js';
import * as api from '../scripts/gate1/solana-client.mjs';

const c = new Connection('http://127.0.0.1:18899', 'confirmed');
const [owner, agent, relay, observer, recipient] = await Promise.all(['payer', 'agent', 'relay', 'observer', 'recipient'].map(api.key));
const beforeMandate = await api.account(c, api.mandateAddress(owner.publicKey), 'Mandate');
const source = await api.account(c, api.sourceAddress(beforeMandate.sourceHandle), 'SourceStatus');
const now = Math.floor(Date.now() / 1000);
const commitment = randomBytes(32).toString('hex');
const sent = async (signer, instructions) => {
  const result = await api.send(c, signer, instructions);
  assert.equal(result.error, null, JSON.stringify(result.error));
  return result;
};
await sent(owner, [api.renewMandate(owner.publicKey, agent.publicKey, commitment, beforeMandate.sourceHandle, now - 1, now + 600), api.fundVault(owner.publicKey, 100_000_000)]);
const current = await api.account(c, api.mandateAddress(owner.publicKey), 'Mandate');
await sent(observer, [api.updateSource(observer.publicKey, { handle: current.sourceHandle, epoch: source.epoch,
  active: true, ledgerIndex: source.ledgerIndex + 1n, ledgerHash: api.hash('concurrent-local-ledger'), observedAt: now, validUntil: now + 60 })]);
const request = { version: 1, policyId: api.hash('PROOFPASS:AGENT_PAYMENT_AUTH:V1').toString('hex'), policyVersion: 1,
  destinationCluster: api.hex(await c.getGenesisHash()), programId: api.hex(api.PROGRAM_ID), owner: api.hex(owner.publicKey),
  agentKey: api.hex(agent.publicKey), vault: api.hex(api.vaultAddress(owner.publicKey)), recipient: api.hex(recipient.publicKey),
  assetId: '00'.repeat(32), amountBaseUnits: '50000000', requestId: randomBytes(32).toString('hex'),
  mandateEpoch: current.epoch.toString(), expiresAt: String(now + 50) };
const balances = async () => [await c.getBalance(api.vaultAddress(owner.publicKey)), await c.getBalance(recipient.publicKey)];
const beforeDirect = await balances();
const direct = await api.send(c, agent, [api.executePayment(agent.publicKey, request, current.sourceHandle)]);
assert.notEqual(direct.error, null, 'Unrecorded authorization must fail');
assert.deepEqual(await balances(), beforeDirect);
await sent(relay, [api.recordAuthorization(relay.publicKey, request, commitment, current.sourceHandle, source.epoch, api.hash('local-concurrency-fixture'))]);
const before = await balances();
// Different compute-budget instructions guarantee different signed transactions;
// this exercises the program's consumed state rather than tx-hash deduplication.
const attempts = await Promise.all([200_000, 210_000].map(units => api.send(c, agent, [
  ComputeBudgetProgram.setComputeUnitLimit({ units }), api.executePayment(agent.publicKey, request, current.sourceHandle) ])));
assert.notEqual(attempts[0].signature, attempts[1].signature);
assert.equal(attempts.filter(r => r.error === null).length, 1);
assert.equal(attempts.find(r => r.error !== null).error.InstructionError[1].Custom, 6007);
assert.deepEqual(await balances(), [before[0] - 50_000_000, before[1] + 50_000_000]);
assert.equal((await api.account(c, api.authorizationAddress(owner.publicKey, request.requestId), 'Authorization')).consumed, true);
const report = { status: 'passed', mode: 'real-local-validator', unrecordedDirectCall: 'rejected-with-balances-unchanged',
  distinctTransactions: attempts, successfulPayments: 1, duplicatePayments: 0, amountLamports: 50_000_000,
  completedAt: new Date().toISOString() };
await writeFile(new URL('../evidence/gate1/solana-concurrent-consumption.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
