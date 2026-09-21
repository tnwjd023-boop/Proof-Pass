import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { encodePayment } from '../../src/protocol.mjs';

export const PROGRAM_ID = new PublicKey('3983maEGpsg2M5tTqBqMtLm5rRmZsYKTDDUZAnrPuBAJ');
export async function key(role) {
  const folder = ['payer', 'recipient'].includes(role) ? 'solana-gate0' : 'solana-gate1';
  assert(['payer', 'recipient', 'agent', 'relay', 'observer', 'program'].includes(role));
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(new URL(`../../.local/${folder}/${role}.json`, import.meta.url), 'utf8'))));
}
export const hex = value => new PublicKey(value).toBuffer().toString('hex');
export const hash = value => createHash('sha256').update(value).digest();
const bytes = value => typeof value === 'string' ? Buffer.from(value, 'hex') : Buffer.from(value);
const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const pk = value => new PublicKey(value).toBuffer();
const meta = (pubkey, isSigner = false, isWritable = false) => ({ pubkey: new PublicKey(pubkey), isSigner, isWritable });
const system = meta(SystemProgram.programId);
const pda = seeds => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
export const configAddress = () => pda([Buffer.from('config')]);
export const mandateAddress = owner => pda([Buffer.from('mandate'), pk(owner)]);
export const vaultAddress = owner => pda([Buffer.from('vault'), pk(owner)]);
export const sourceAddress = handle => pda([Buffer.from('source'), bytes(handle)]);
export const authorizationAddress = (owner, id) => pda([Buffer.from('authorization'), pk(owner), bytes(id)]);
function instruction(name, fields, keys) {
  return new TransactionInstruction({ programId: PROGRAM_ID, data: Buffer.concat([hash(`global:${name}`).subarray(0, 8), ...fields]), keys });
}
const paymentBytes = request => encodePayment(request).subarray(Buffer.byteLength('PROOFPASS:AGENT_PAYMENT_AUTH:V1'));
export function initializeConfig(admin, relay, observer, policyId, cluster) {
  return instruction('initialize_config', [pk(relay), pk(observer), bytes(policyId), bytes(cluster)],
    [meta(admin, true, true), meta(configAddress(), false, true), system]);
}
export function initializeMandate(owner, agent, commitment, handle, notBefore, expiresAt) {
  return instruction('initialize_mandate', [pk(agent), bytes(commitment), bytes(handle), u64(notBefore), u64(expiresAt)],
    [meta(owner, true, true), meta(mandateAddress(owner), false, true), meta(vaultAddress(owner), false, true), system]);
}
export function renewMandate(owner, agent, commitment, handle, notBefore, expiresAt) {
  return instruction('renew_mandate', [pk(agent), bytes(commitment), bytes(handle), u64(notBefore), u64(expiresAt)],
    [meta(owner, true), meta(mandateAddress(owner), false, true)]);
}
export function revokeMandate(owner) {
  return instruction('revoke_mandate', [], [meta(owner, true), meta(mandateAddress(owner), false, true)]);
}
export function fundVault(owner, amount) {
  return instruction('fund_vault', [u64(amount)], [meta(owner, true, true), meta(vaultAddress(owner), false, true), system]);
}
export function withdrawVault(owner, amount) {
  return instruction('withdraw_vault', [u64(amount)], [meta(owner, true, true), meta(vaultAddress(owner), false, true)]);
}
export function updateSource(observer, value) {
  return instruction('update_source_status', [bytes(value.handle), u64(value.epoch), Buffer.from([Number(value.active)]),
    u64(value.ledgerIndex), bytes(value.ledgerHash), u64(value.observedAt), u64(value.validUntil)],
    [meta(observer, true, true), meta(configAddress()), meta(sourceAddress(value.handle), false, true), system]);
}
const requestAccounts = (request, handle) => [meta(configAddress()), meta(mandateAddress(Buffer.from(request.owner, 'hex'))),
  meta(vaultAddress(Buffer.from(request.owner, 'hex'))), meta(sourceAddress(handle)),
  meta(authorizationAddress(Buffer.from(request.owner, 'hex'), request.requestId), false, true)];
export function recordAuthorization(relay, request, commitment, handle, sourceEpoch, midnightRef) {
  return instruction('record_authorization', [paymentBytes(request), bytes(commitment), u64(sourceEpoch), bytes(midnightRef)],
    [meta(relay, true, true), ...requestAccounts(request, handle), system]);
}
export function executePayment(agent, request, handle, overrides = {}) {
  const accounts = requestAccounts(request, handle);
  accounts[2].isWritable = true;
  for (const [index, address] of Object.entries(overrides.accounts ?? {})) accounts[Number(index)].pubkey = new PublicKey(address);
  return instruction('execute_payment', [paymentBytes(request)], [meta(agent, overrides.signer ?? true), ...accounts,
    meta(overrides.recipient ?? Buffer.from(request.recipient, 'hex'), false, true)]);
}
export async function send(connection, payer, instructions, additional = []) {
  const block = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction({ feePayer: payer.publicKey, ...block }).add(...instructions);
  tx.sign(...new Map([payer, ...additional].map(k => [k.publicKey.toBase58(), k])).values());
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
  const result = await connection.confirmTransaction({ signature, ...block }, 'confirmed');
  return { signature, error: result.value.err };
}
export async function account(connection, address, kind, commitment = 'confirmed') {
  const info = await connection.getAccountInfo(address, commitment);
  assert(info && info.owner.equals(PROGRAM_ID), 'Missing or wrong-owner program account');
  assert(info.data.subarray(0, 8).equals(hash(`account:${kind}`).subarray(0, 8)), 'Wrong account discriminator');
  let at = 8;
  const fields = { bytes: n => { const v = info.data.subarray(at, at + n); assert.equal(v.length, n); at += n; return v.toString('hex'); },
    uint: () => { const v = info.data.readBigUInt64LE(at); at += 8; return v; },
    u32: () => { const v = info.data.readUInt32LE(at); at += 4; return v; }, bool: () => info.data[at++] === 1 };
  if (kind === 'Config') return { admin: fields.bytes(32), relay: fields.bytes(32), observer: fields.bytes(32),
    policyId: fields.bytes(32), policyVersion: fields.u32(), cluster: fields.bytes(32) };
  if (kind === 'Mandate') return { owner: fields.bytes(32), agent: fields.bytes(32), commitment: fields.bytes(32),
    sourceHandle: fields.bytes(32), epoch: fields.uint(), active: fields.bool(), notBefore: fields.uint(), expiresAt: fields.uint() };
  if (kind === 'SourceStatus') return { handle: fields.bytes(32), epoch: fields.uint(), active: fields.bool(), ledgerIndex: fields.uint(),
    ledgerHash: fields.bytes(32), observedAt: fields.uint(), validUntil: fields.uint() };
  if (kind === 'Authorization') return { owner: fields.bytes(32), requestId: fields.bytes(32), requestHash: fields.bytes(32),
    mandateCommitment: fields.bytes(32), mandateEpoch: fields.uint(), sourceHandle: fields.bytes(32), sourceEpoch: fields.uint(),
    expiresAt: fields.uint(), midnightRef: fields.bytes(32), consumed: fields.bool() };
  throw new Error('Unsupported account decoder');
}
