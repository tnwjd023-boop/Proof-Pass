import test from 'node:test';
import assert from 'node:assert/strict';
import codec from 'ripple-address-codec';
import { createHash } from 'node:crypto';
import * as adapter from '../src/midnight/source-adapter.mjs';
const issuer = 'rQJjt1J4PuUzgAsCXuCKfRaynEeEJ1kMd';
const subject = 'rrpsKg223NBFnvYS7gyH69cTEgRoVYwTUk';
const type = Buffer.from('PROOFPASS_ELIGIBLE_V1').toString('hex');
const policy = { xrplIssuer: codec.decodeAccountID(issuer), credentialType: createHash('sha256').update(Buffer.from(type, 'hex')).digest() };
const binding = { xrplAccount: codec.decodeAccountID(subject), xrplNetwork: 1n };
const node = { LedgerEntryType: 'Credential', Issuer: issuer, Subject: subject, CredentialType: type, Flags: 65536 };
test('source signer binds actual validated credential issuer, type and subject to pinned policy', () => {
  assert.equal(typeof adapter.validateSourceIdentity, 'function');
  const value = adapter.validateSourceIdentity(node, policy, binding);
  assert.deepEqual(Buffer.from(value.issuer), Buffer.from(policy.xrplIssuer));
  for (const changed of [{ Issuer: subject }, { Subject: issuer }, { CredentialType: '00' }, { CredentialType: type + 'zz' }, { Flags: 0 }]) {
    assert.throws(() => adapter.validateSourceIdentity({ ...node, ...changed }, policy, binding));
  }
});
