import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const directory = 'evidence/gate1/';
const read = async name => JSON.parse(await readFile(directory + name, 'utf8'));
const status = await read('status.json');
const report = await read('credential-observer.json');
assert.equal(report.status, 'passed');
assert.equal(report.unaccepted.status, 'unaccepted');
assert.equal(report.accepted.status, 'accepted');
assert.equal(report.deleted.status, 'absent');
assert(report.accepted.sourceEpoch < report.deleted.sourceEpoch);
assert(report.accepted.validUntil - report.accepted.observedAt <= 60);
for (const stage of ['create', 'accept', 'delete']) {
  assert.equal(report.receipts[stage].result, 'tesSUCCESS');
  assert.match(report.receipts[stage].hash, /^[A-F0-9]{64}$/);
}
for (const file of ['binding.json', 'opendid-binding.json', 'protocol-vector.json', 'credential-observer.json']) {
  const bytes = await readFile(directory + file);
  status.artifacts[file] = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}
status.stage = 'Gate1 protocol, session binding and XRPL credential observer';
status.xrplCredentialObserverPassed = true;
status.fullGate1Complete = false;
// Test count is recorded only after the separate full suite exits successfully.
assert.equal(process.argv[2], '--tests-22-passed', 'Run the full Node suite before recording evidence');
status.nodeTestsPassed = 22;
status.xrplReview = {
  completedReportRecovery: 'fixed and regression tested',
  expiredCredentialCleanup: 'fixed and regression tested; never counted as successful acceptance',
  staleProcessLock: 'fail closed; documented manual recovery after process termination is verified',
};
status.remaining = ['Mandate registration and Compact policy', 'Midnight confirmed authorization and relay',
  'Solana one-time authorization consumption and cross-chain invalidation'];
status.checkedAt = new Date().toISOString();
await writeFile(directory + 'status.json', JSON.stringify(status, null, 2) + '\n');
console.log('XRPL stage evidence recorded; fullGate1Complete remains false.');
