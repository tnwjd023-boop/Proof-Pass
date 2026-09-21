import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import keypairs from 'ripple-keypairs';
import codec from 'ripple-address-codec';
import { encodeBinding, hexBytes } from '../protocol.mjs';
export function verifyWallets(session, proofs) {
  const bytes = encodeBinding(session);
  let xrplValid = false;
  try {
    const address = keypairs.deriveAddress(proofs.xrplPublicKey);
    xrplValid = Buffer.from(codec.decodeAccountID(address)).toString('hex') === session.xrplAccount
      && keypairs.verify(bytes.toString('hex'), proofs.xrplSignature, proofs.xrplPublicKey);
  } catch { /* Malformed keys/signatures fail closed without printing values. */ }
  assert.ok(xrplValid, 'XRPL master signature invalid');
  const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'),
    hexBytes(session.solanaOwner, 32)]), format: 'der', type: 'spki' });
  assert.ok(verify(null, bytes, publicKey, hexBytes(proofs.solanaSignature, 64)), 'Solana signature invalid');
}
export function validateMasterState(session, state, now) {
  assert.ok(state && state.account === session.xrplAccount && state.networkId === session.xrplNetwork, 'XRPL state binding invalid');
  assert.ok(Number.isInteger(state.flags) && state.flags >= 0 && state.flags <= 0xffffffff, 'Invalid account flags');
  assert.equal(state.flags & 1048576, 0, 'XRPL master key disabled');
  assert.ok(Number.isSafeInteger(state.ledgerIndex) && state.ledgerIndex > 0, 'Invalid ledger index');
  hexBytes(state.ledgerHash, 32);
  for (const time of [state.closeTime, state.observedAt])
    assert.ok(Number.isSafeInteger(time) && time <= now + 5 && now - time <= 30, 'XRPL state stale');
}
