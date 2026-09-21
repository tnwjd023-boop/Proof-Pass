import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCredential, validatedReceipt, resumeAction, credentialLookup } from '../scripts/gate0/xrpl-validation.mjs';

const binding = { issuer: 'issuer', subject: 'subject', type: '50524F4F46504153535F454C494749424C455F5631' };
const node = { LedgerEntryType: 'Credential', Issuer: 'issuer', Subject: 'subject', CredentialType: binding.type, Flags: 0 };
test('credential lookup uses the server wire field instead of the SDK type typo', () => {
  assert.equal(credentialLookup(binding).credential_type, '50524F4F46504153535F454C494749424C455F5631');
  assert.equal(credentialLookup(binding).credentialType, undefined);
});
test('unaccepted credentials cannot satisfy the accepted stage', () => {
  assert.throws(() => validateCredential(node, binding, 'accepted'));
  assert.equal(validateCredential(node, binding, 'created'), true);
  assert.equal(validateCredential({ ...node, Flags: 65536 }, binding, 'accepted'), true);
});
test('issuer, subject and type substitutions are rejected', () => {
  for (const field of ['Issuer', 'Subject', 'CredentialType']) {
    assert.throws(() => validateCredential({ ...node, [field]: 'other' }, binding, 'created'));
  }
  assert.throws(() => validateCredential(null, binding, 'created'));
  assert.throws(() => validateCredential(node, binding, 'deleted'));
  assert.equal(validateCredential(null, binding, 'deleted'), true);
});
test('provisional or failed transactions cannot become successful evidence', () => {
  const receipt = { validated: true, hash: 'HASH', ledger_index: 123, meta: { TransactionResult: 'tesSUCCESS' } };
  assert.equal(validatedReceipt(receipt, 'HASH').ledgerIndex, 123);
  assert.throws(() => validatedReceipt({ ...receipt, validated: false }, 'HASH'));
  assert.throws(() => validatedReceipt({ ...receipt, meta: { TransactionResult: 'tecNO_PERMISSION' } }, 'HASH'));
  assert.throws(() => validatedReceipt(receipt, 'OTHER'));
});
test('resume never replaces an unresolved signed transaction', () => {
  assert.equal(resumeAction({ validated: false }, 101, 110), 'wait');
  assert.equal(resumeAction(null, 110, 110), 'resubmit-same-blob');
  assert.equal(resumeAction(null, 111, 110), 'expired-stop');
  assert.equal(resumeAction({ validated: true }, 111, 110), 'inspect-receipt');
});
