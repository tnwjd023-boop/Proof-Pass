import assert from 'node:assert/strict';

export function credentialLookup(binding) {
  return { issuer: binding.issuer, subject: binding.subject, credential_type: binding.type };
}

export function validateCredential(node, binding, stage) {
  assert.ok(['created', 'accepted', 'deleted'].includes(stage));
  if (stage === 'deleted') {
    assert.equal(node, null, 'Credential still exists');
    return true;
  }
  assert.equal(node?.LedgerEntryType, 'Credential');
  assert.equal(node.Issuer, binding.issuer);
  assert.equal(node.Subject, binding.subject);
  assert.equal(node.CredentialType, binding.type);
  assert.ok(Number.isSafeInteger(node.Flags));
  assert.equal(Boolean(node.Flags & 65536), stage === 'accepted', 'Unexpected accepted flag');
  return true;
}

export function validatedReceipt(result, expectedHash) {
  assert.equal(result?.validated, true, 'Transaction is not validated');
  assert.equal(result.hash, expectedHash, 'Transaction hash mismatch');
  assert.ok(Number.isSafeInteger(result.ledger_index) && result.ledger_index > 0);
  assert.equal(result.meta?.TransactionResult, 'tesSUCCESS', 'Transaction did not succeed');
  return { hash: result.hash, ledgerIndex: result.ledger_index, result: result.meta.TransactionResult };
}

export function resumeAction(result, latestValidated, lastLedgerSequence) {
  assert.ok(Number.isSafeInteger(latestValidated) && Number.isSafeInteger(lastLedgerSequence));
  if (result?.validated === true) return 'inspect-receipt';
  if (latestValidated > lastLedgerSequence) return 'expired-stop';
  return result ? 'wait' : 'resubmit-same-blob';
}
