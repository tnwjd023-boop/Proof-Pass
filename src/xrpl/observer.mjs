import assert from 'node:assert/strict';
import { hexBytes, sha256 } from '../protocol.mjs';
export function assessCredential(node, expected, ledger, now) {
  assert.ok(Number.isSafeInteger(now));
  assert.ok(Number.isSafeInteger(ledger.index) && ledger.index > 0);
  hexBytes(ledger.hash, 32);
  assert.ok(Number.isSafeInteger(ledger.closeTime) && ledger.closeTime <= now + 5 && now - ledger.closeTime <= 30, 'Stale ledger');
  let status = 'absent', expiration = now, generation = 'absent';
  if (node !== null) {
    assert.equal(node.LedgerEntryType, 'Credential');
    assert.equal(node.Issuer, expected.issuer); assert.equal(node.Subject, expected.subject); assert.equal(node.CredentialType, expected.type);
    assert.ok(Number.isInteger(node.Flags) && node.Flags >= 0 && node.Flags <= 0xffffffff);
    hexBytes(node.index.toLowerCase(), 32); hexBytes(node.PreviousTxnID.toLowerCase(), 32);
    assert.ok(Number.isSafeInteger(node.Expiration) && node.Expiration >= 0 && node.Expiration <= 0xffffffff, 'Expiration required');
    expiration = node.Expiration + 946684800;
    status = expiration <= Math.max(now, ledger.closeTime) ? 'expired' : node.Flags & 65536 ? 'accepted' : 'unaccepted';
    generation = node.index + ':' + node.PreviousTxnID + ':' + node.Expiration;
  }
  const active = status === 'accepted';
  return { ledger, observedAt: now, status, active, validUntil: active ? Math.min(now + 60, expiration) : now,
    fingerprint: sha256(Buffer.from(status + ':' + generation)) };
}
export function nextObservation(previous, current) {
  if (previous) {
    assert.ok(current.ledger.index >= previous.ledger.index, 'Ledger rollback');
    assert.ok(current.observedAt >= previous.observedAt, 'Observation clock rollback');
    if (current.ledger.index === previous.ledger.index) {
      assert.equal(current.ledger.hash, previous.ledger.hash, 'Conflicting ledger');
      // Time alone may expire a credential without a new ledger.
      assert.ok(current.fingerprint === previous.fingerprint || current.status === 'expired', 'Conflicting credential state');
    }
  }
  const sourceEpoch = previous ? previous.sourceEpoch + (previous.fingerprint !== current.fingerprint ? 1 : 0) : 1;
  assert.ok(Number.isSafeInteger(sourceEpoch));
  return { ...current, sourceEpoch };
}
