import assert from 'node:assert/strict';
const hex = value => {
  assert(value instanceof Uint8Array && value.length === 32);
  return Buffer.from(value).toString('hex');
};
// `registered` must come from the program-owned PDA decoder at the configured
// Solana RPC. This helper is internal; never accept a caller's account object.
export function validateRegisteredMandate(mandate, registered, sourceHandle, now, computeCommitment) {
  assert.equal(mandate.version, 1n);
  assert.equal(registered.active, true, 'Mandate revoked');
  assert.equal(registered.owner, hex(mandate.owner), 'Registered owner mismatch');
  assert.equal(registered.agent, hex(mandate.agentKey), 'Registered agent mismatch');
  assert.equal(registered.commitment, hex(computeCommitment(mandate)), 'Registered commitment mismatch');
  assert.equal(registered.sourceHandle, sourceHandle, 'Registered source binding mismatch');
  assert.equal(registered.epoch, mandate.mandateEpoch, 'Registered epoch mismatch');
  assert.equal(registered.notBefore, mandate.notBefore, 'Registered start time mismatch');
  assert.equal(registered.expiresAt, mandate.expiresAt, 'Registered expiry mismatch');
  assert(typeof now === 'bigint' && mandate.notBefore <= now && now < mandate.expiresAt, 'Mandate expired or not yet valid');
  assert(mandate.maxPerTx > 0n && mandate.maxPerTx <= 0xffffffffffffffffn);
  return mandate;
}
