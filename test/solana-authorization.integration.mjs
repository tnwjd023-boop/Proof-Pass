import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Connection, Keypair, SystemProgram } from '@solana/web3.js';
import * as api from '../scripts/gate1/solana-client.mjs';
import { paymentHash } from '../src/protocol.mjs';

const connection = new Connection('http://127.0.0.1:18899', 'confirmed');
const [owner, recipient, agent, relay, observer] = await Promise.all(['payer', 'recipient', 'agent', 'relay', 'observer'].map(api.key));
const attacker = Keypair.generate();
for (const wallet of [owner, agent, relay, observer, attacker]) {
  const sig = await connection.requestAirdrop(wallet.publicKey, 5_000_000_000);
  await connection.confirmTransaction(sig, 'confirmed');
}
assert((await connection.getAccountInfo(api.PROGRAM_ID))?.executable);
const cluster = api.hex(await connection.getGenesisHash());
const policyId = api.hash('PROOFPASS:AGENT_PAYMENT_AUTH:V1').toString('hex');
const handle = randomBytes(32).toString('hex');
let commitment = randomBytes(32).toString('hex');
let sourceEpoch = 1, ledgerIndex = 1;
const now = () => Math.floor(Date.now() / 1000);
const results = [];
async function passed(name, signer, instructions) {
  const result = await api.send(connection, signer, instructions);
  assert.equal(result.error, null, name + ': ' + JSON.stringify(result.error));
  results.push({ name, status: 'passed', signature: result.signature });
  return result;
}
const balances = async () => [await connection.getBalance(api.vaultAddress(owner.publicKey)), await connection.getBalance(recipient.publicKey)];
async function denied(name, signer, instructions) {
  const before = await balances();
  const result = await api.send(connection, signer, instructions);
  assert.notEqual(result.error, null, name + ' unexpectedly passed');
  assert.deepEqual(await balances(), before, name + ' moved protected funds');
  results.push({ name, status: 'rejected', signature: result.signature, balancesUnchanged: true, error: result.error });
}
await denied('unauthorized-bootstrap', attacker, [api.initializeConfig(attacker.publicKey, relay.publicKey, observer.publicKey, policyId, cluster)]);
await passed('initialize-config', owner, [api.initializeConfig(owner.publicKey, relay.publicKey, observer.publicKey, policyId, cluster)]);
await passed('owner-registers-mandate', owner, [api.initializeMandate(owner.publicKey, agent.publicKey, commitment, handle, now() - 1, now() + 900)]);
await passed('owner-funds-vault', owner, [api.fundVault(owner.publicKey, 150_000_000)]);
await denied('cannot-reinitialize-mandate', owner, [api.initializeMandate(owner.publicKey, agent.publicKey, commitment, handle, now() - 1, now() + 900)]);

function observation(active = true) {
  return { handle, epoch: sourceEpoch, active, ledgerIndex: ledgerIndex++,
    ledgerHash: api.hash('local-ledger-' + ledgerIndex).toString('hex'), observedAt: now(), validUntil: now() + (active ? 60 : 0) };
}
async function refresh(active = true) {
  const value = observation(active);
  await passed(active ? 'refresh-current-source' : 'source-invalidation', observer, [api.updateSource(observer.publicKey, value)]);
  return value;
}
await denied('wrong-observer', attacker, [api.updateSource(attacker.publicKey, observation())]);
const firstSource = await refresh();
await denied('source-lease-over-60-seconds', observer, [api.updateSource(observer.publicKey, { ...observation(), validUntil: now() + 61 })]);
await denied('source-ledger-rollback', observer, [api.updateSource(observer.publicKey, { ...observation(), ledgerIndex: 1 })]);
await denied('source-conflicting-ledger-hash', observer, [api.updateSource(observer.publicKey, { ...firstSource, ledgerHash: 'ff'.repeat(32) })]);
await denied('same-epoch-status-change', observer, [api.updateSource(observer.publicKey, { ...observation(false), active: false })]);

async function request(overrides = {}) {
  const mandate = await api.account(connection, api.mandateAddress(owner.publicKey), 'Mandate');
  return { version: 1, policyId, policyVersion: 1, destinationCluster: cluster, programId: api.hex(api.PROGRAM_ID),
    owner: api.hex(owner.publicKey), agentKey: api.hex(agent.publicKey), vault: api.hex(api.vaultAddress(owner.publicKey)),
    recipient: api.hex(recipient.publicKey), assetId: '00'.repeat(32), amountBaseUnits: '50000000',
    requestId: randomBytes(32).toString('hex'), mandateEpoch: mandate.epoch.toString(), expiresAt: String(now() + 50), ...overrides };
}
const record = (r, signer = relay) => api.recordAuthorization(signer.publicKey, r, commitment, handle, sourceEpoch, api.hash('synthetic-local-confirmed-midnight-reference'));
async function issue(overrides = {}) {
  await refresh();
  const value = await request(overrides);
  await passed('trusted-relay-records-request', relay, [record(value)]);
  return value;
}
await denied('wrong-relay', attacker, [record(await request(), attacker)]);
for (const [field, value] of [['destinationCluster', 'ff'.repeat(32)], ['programId', 'ff'.repeat(32)],
  ['policyId', 'ff'.repeat(32)], ['assetId', 'ff'.repeat(32)], ['expiresAt', String(now() - 1)]]) {
  await denied('record-wrong-' + field, relay, [record(await request({ [field]: value }))]);
}
const payment = await issue();
const execute = (r = payment, signer = agent, overrides) => api.executePayment(signer.publicKey, r, handle, overrides);
await denied('missing-agent-signature', attacker, [execute(payment, agent, { signer: false })]);
await denied('wrong-agent', attacker, [execute(payment, attacker)]);
await denied('recipient-account-substitution', agent, [execute(payment, agent, { recipient: attacker.publicKey })]);
await denied('wrong-vault-owner', agent, [execute(payment, agent, { accounts: { 2: attacker.publicKey } })]);
await denied('amount-substitution', agent, [execute({ ...payment, amountBaseUnits: '49999999' })]);
await denied('network-substitution', agent, [execute({ ...payment, destinationCluster: 'ff'.repeat(32) })]);
await denied('reissued-request-id-with-new-amount', relay, [record({ ...payment, amountBaseUnits: '49999999' })]);
await denied('transaction-rollback-does-not-consume', agent, [execute(payment), SystemProgram.transfer({
  fromPubkey: agent.publicKey, toPubkey: recipient.publicKey, lamports: 1_000_000_000_000 })]);
assert.equal((await api.account(connection, api.authorizationAddress(owner.publicKey, payment.requestId), 'Authorization')).consumed, false);
const before = await balances();
await passed('exact-0.05-SOL-authorized-payment', agent, [execute(payment)]);
assert.deepEqual(await balances(), [before[0] - 50_000_000, before[1] + 50_000_000]);
const auth = await api.account(connection, api.authorizationAddress(owner.publicKey, payment.requestId), 'Authorization');
assert.equal(auth.consumed, true);
assert.equal(auth.requestHash, paymentHash(payment));
await denied('consumed-authorization-replay', agent, [execute(payment)]);
await denied('consumed-authorization-recreation', relay, [record(payment)]);

const pendingSource = await issue();
sourceEpoch++;
await refresh(false);
await denied('deleted-source-blocks-pending-authorization', agent, [execute(pendingSource)]);
sourceEpoch++;
await refresh(true);
await denied('reissued-source-does-not-revive-old-authorization', agent, [execute(pendingSource)]);
const pendingMandate = await issue();
await passed('owner-revokes-mandate', owner, [api.revokeMandate(owner.publicKey)]);
await denied('revoked-mandate-blocks-pending-authorization', agent, [execute(pendingMandate)]);
commitment = randomBytes(32).toString('hex');
await passed('owner-renews-mandate-with-higher-epoch', owner, [api.renewMandate(owner.publicKey, agent.publicKey, commitment, handle, now() - 1, now() + 900)]);
await denied('renewed-mandate-does-not-revive-old-authorization', agent, [execute(pendingMandate)]);
const insufficient = await issue({ amountBaseUnits: '100000001' });
await denied('rent-preserved-on-insufficient-funds', agent, [execute(insufficient)]);
const expiring = await issue({ expiresAt: String(now() + 3) });
while (now() <= Number(expiring.expiresAt)) await new Promise(resolve => setTimeout(resolve, 250));
await denied('execution-clock-rejects-expired-authorization', agent, [execute(expiring)]);
const vaultBeforeWithdrawal = (await balances())[0];
await passed('separate-owner-withdrawal', owner, [api.withdrawVault(owner.publicKey, 100_000_000)]);
assert.equal((await balances())[0], vaultBeforeWithdrawal - 100_000_000);
const vaultInfo = await connection.getAccountInfo(api.vaultAddress(owner.publicKey));
assert.equal(vaultInfo.lamports, await connection.getMinimumBalanceForRentExemption(vaultInfo.data.length));
await denied('owner-withdrawal-cannot-spend-rent', owner, [api.withdrawVault(owner.publicKey, 1)]);

await writeFile(new URL('../evidence/gate1/solana-authorization-local.json', import.meta.url), JSON.stringify({
  status: 'passed', mode: 'real-local-validator-with-trusted-relay-fixtures', programId: api.PROGRAM_ID.toBase58(),
  clusterGenesis: await connection.getGenesisHash(), assertions: results.length, results,
  exactPaymentLamports: 50_000_000, finalRentLamports: vaultInfo.lamports,
  liveMidnightRelayConnected: false, fullGate1Complete: false, completedAt: new Date().toISOString(),
}, null, 2) + '\n');
console.log(JSON.stringify({ status: 'passed', assertions: results.length, exactPaymentLamports: 50_000_000, mode: 'local-validator' }));
