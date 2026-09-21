import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { pureCircuits as p } from '../src/managed/policy/contract/index.js';
import { fixture, b, account } from './fixture.mjs';

test('valid separate role attestations authorize exactly one payment and retain only minimal output', () => {
  const f = fixture();
  const state = f.authorize();
  const output = state.authorizations.lookup(p.paymentCommitment(f.state.payment));
  assert.equal(output.expiresAt, 1040n);
  assert.equal(output.sourceEpoch, 2n);
  assert.deepEqual(output.mandateCommitment, p.mandateCommitment(f.state.mandate));
  assert.equal('subject' in output, false);
  assert.throws(() => f.authorize(), /already authorized/);
});

test('all signed subjects and chain accounts must agree', () => {
  for (const change of [s => { s.identity.subject = b(99); }, s => { s.binding.subject = b(99); },
    s => { s.source.subject = b(99); }, s => { s.binding.xrplAccount = account(99); },
    s => { s.binding.solanaOwner = b(99); }, s => { s.source.issuer = account(99); },
    s => { s.source.credentialType = b(99); }, s => { s.identity.issuerPolicyId = b(99); },
    s => { s.identity.predicate = 18n; }, s => { s.identity.verificationMode = 2n; }]) {
    assert.throws(() => fixture(change).authorize());
  }
});

test('mandate binds every destination field, epoch, amount and validity', () => {
  for (const field of ['owner', 'agentKey', 'destinationCluster', 'programId', 'vault', 'recipient', 'assetId']) {
    assert.throws(() => fixture(s => { s.payment[field] = b(99); s.clock.requestCommitment = p.paymentCommitment(s.payment); }).authorize());
  }
  for (const change of [s => { s.payment.amount = 0n; }, s => { s.payment.amount = 50000001n; },
    s => { s.payment.mandateEpoch = 2n; }, s => { s.mandate.notBefore = 1001n; },
    s => { s.mandate.expiresAt = 1039n; }, s => { s.payment.policyVersion = 2n; }, s => { s.payment.version = 2n; }]) {
    assert.throws(() => fixture(s => { change(s); s.clock.requestCommitment = p.paymentCommitment(s.payment); }).authorize());
  }
});

test('unaccepted, expired, stale and future-dated observations cannot authorize', () => {
  for (const change of [s => { s.source.accepted = false; }, s => { s.source.validUntil = 1039n; },
    s => { s.source.validUntil = 1061n; }, s => { s.source.observedAt = 1001n; },
    s => { s.source.ledgerCloseTime = 969n; }, s => { s.source.ledgerCloseTime = 1001n; },
    s => { s.identity.expiresAt = 1039n; }, s => { s.binding.expiresAt = 1039n; },
    s => { s.clock.now = 1040n; }, s => { s.clock.expiresAt = 1061n; }, s => { s.clock.requestCommitment = b(99); }]) {
    assert.throws(() => fixture(change).authorize());
  }
});

test('tampering any signature or changing a signed condition is rejected', () => {
  for (let i = 0; i < 5; i++) {
    const f = fixture();
    f.state.signatures[i].response += 1n;
    assert.throws(() => f.authorize(), /signature/);
  }
  const f = fixture();
  f.state.mandate.maxPerTx += 1n;
  assert.throws(() => f.authorize(), /signature/);
  const swapped = fixture();
  [swapped.state.signatures[0], swapped.state.signatures[1]] = [swapped.state.signatures[1], swapped.state.signatures[0]];
  assert.throws(() => swapped.authorize(), /signature/);
});

test('every request field changes its Compact commitment', () => {
  const { state } = fixture();
  const original = p.paymentCommitment(state.payment);
  for (const [field, value] of Object.entries(state.payment)) {
    const changed = { ...state.payment, [field]: typeof value === 'bigint' ? value + 1n : new Uint8Array(randomBytes(32)) };
    assert.notDeepEqual(p.paymentCommitment(changed), original, field);
  }
});

test('attestations cannot cross deployment scopes even with the same role keys', () => {
  const original = fixture();
  const other = fixture(s => { s.config.scope = b(90); });
  original.state.signatures = other.state.signatures;
  assert.throws(() => original.authorize(), /signature/);
});

test('Schnorr reduction is canonical at the scalar-field wrap boundary', () => {
  const prime = 52435875175126190479447740508185965837690552500527637822603658699938581184513n;
  const factor = 1n << 248n;
  assert.equal(p.reduceSchnorrChallenge(0n, 0n, 0n), 0n);
  assert.equal(p.reduceSchnorrChallenge(prime - 1n, (prime - 1n) / factor, (prime - 1n) % factor), (prime - 1n) % factor);
  assert.throws(() => p.reduceSchnorrChallenge(0n, prime / factor, prime % factor), /canonical/);
});
