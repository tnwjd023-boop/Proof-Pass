import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey('BvFezGdFzEgKwGKntXK1acyv9tzcKowRJXy5EjFt14i8');
export const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export async function key(role) {
  const path = new URL(`../../.local/solana-gate0/${role}.json`, import.meta.url);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(path, 'utf8'))));
}
export function vaultAddress(authority) {
  return PublicKey.findProgramAddressSync([Buffer.from('gate0-vault'), authority.toBuffer()], PROGRAM_ID)[0];
}
function discriminator(name) { return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8); }
export function initialize(authority) {
  return new TransactionInstruction({ programId: PROGRAM_ID, data: discriminator('initialize'), keys: [
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: vaultAddress(authority), isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ] });
}
export function pay(authority, recipient, amount, { vault = vaultAddress(authority), signer = true } = {}) {
  const encoded = Buffer.alloc(8);
  encoded.writeBigUInt64LE(BigInt(amount));
  return new TransactionInstruction({ programId: PROGRAM_ID, data: Buffer.concat([discriminator('pay'), encoded]), keys: [
    { pubkey: authority, isSigner: signer, isWritable: false },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: recipient, isSigner: false, isWritable: true },
  ] });
}
export async function signed(connection, payer, instructions) {
  const block = await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({ feePayer: payer.publicKey, ...block }).add(...instructions);
  transaction.sign(payer);
  return { transaction, block, bytes: transaction.serialize() };
}
export async function send(connection, payer, instructions) {
  const prepared = await signed(connection, payer, instructions);
  const signature = await connection.sendRawTransaction(prepared.bytes, { skipPreflight: true, maxRetries: 3 });
  const result = await connection.confirmTransaction({ signature, ...prepared.block }, 'confirmed');
  return { signature, error: result.value.err, bytes: prepared.bytes, block: prepared.block };
}
