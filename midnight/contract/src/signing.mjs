import { randomBytes } from 'node:crypto';
import { ecMulGenerator } from '@midnight-ntwrk/compact-runtime';

export const ORDER = 6554484396890773809930967563523245729705921265872317281365359162392183254199n;
const TWO_248 = 1n << 248n;
// Rejection sampling avoids modulo bias and excludes the identity key.
export function scalar() {
  for (;;) {
    const value = BigInt('0x' + randomBytes(32).toString('hex'));
    if (value > 0n && value < ORDER) return value;
  }
}
export function sign(secret, message, challenge) {
  if (typeof secret !== 'bigint' || secret <= 0n || secret >= ORDER) throw new Error('Invalid signing key');
  const publicKey = ecMulGenerator(secret);
  const nonce = scalar();
  const announcement = ecMulGenerator(nonce);
  const c = challenge(announcement.x, announcement.y, publicKey.x, publicKey.y, message) % TWO_248;
  return { announcement, response: (nonce + c * secret) % ORDER };
}
const field = name => ({ privateState }) => [privateState, privateState[name]];
export const witnesses = {
  getPayment: field('payment'), getIdentity: field('identity'), getBinding: field('binding'),
  getSource: field('source'), getMandate: field('mandate'), getClock: field('clock'), getSignatures: field('signatures'),
  getSchnorrReduction: ({ privateState }, hash) => [privateState, [hash / TWO_248, hash % TWO_248]],
};
