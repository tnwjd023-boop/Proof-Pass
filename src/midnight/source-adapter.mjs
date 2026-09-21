import assert from 'node:assert/strict';
import codec from 'ripple-address-codec';
import { createHash } from 'node:crypto';

// Caller supplies the node fetched at its fixed validated ledger, never policy
// constants standing in for observed issuer/type/account fields.
export function validateSourceIdentity(node, policy, binding) {
  assert.equal(node?.LedgerEntryType, 'Credential');
  assert(Number.isInteger(node.Flags) && (node.Flags & 65536) !== 0, 'Credential not accepted');
  assert.match(node.CredentialType, /^(?:[a-fA-F0-9]{2}){1,64}$/);
  const issuer = new Uint8Array(codec.decodeAccountID(node.Issuer));
  const account = new Uint8Array(codec.decodeAccountID(node.Subject));
  const credentialType = new Uint8Array(createHash('sha256').update(Buffer.from(node.CredentialType, 'hex')).digest());
  assert.deepEqual(Buffer.from(issuer), Buffer.from(policy.xrplIssuer), 'Observed issuer differs from policy');
  assert.deepEqual(Buffer.from(credentialType), Buffer.from(policy.credentialType), 'Observed type differs from policy');
  assert.deepEqual(Buffer.from(account), Buffer.from(binding.xrplAccount), 'Observed subject differs from binding');
  assert.equal(binding.xrplNetwork, 1n);
  return { issuer, account, credentialType, xrplNetwork: binding.xrplNetwork };
}
