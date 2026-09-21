import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { pureCircuits as p } from '../src/managed/policy/contract/index.js';

const project = process.env.PROOFPASS_PROJECT;
assert(project, 'Use the project build/test script');
const { toCompactPayment, fromCompactPayment, mapConfirmedAuthorization } = await import(pathToFileURL(project + '/src/midnight/request.mjs'));
const { paymentHash } = await import(pathToFileURL(project + '/src/protocol.mjs'));
const request = JSON.parse(await readFile(project + '/test/fixtures/payment-v1.json', 'utf8'));
test('actual compiled Compact commitment maps the independent Node/Rust request vector', async () => {
  const compact = toCompactPayment(request);
  assert.deepEqual(fromCompactPayment(compact), request);
  const commitment = p.paymentCommitment(compact);
  const output = { destinationCluster: compact.destinationCluster, programId: compact.programId,
    mandateCommitment: new Uint8Array(32).fill(5), mandateEpoch: compact.mandateEpoch,
    sourceHandle: new Uint8Array(32).fill(6), sourceEpoch: 2n, expiresAt: compact.expiresAt };
  const mapped = mapConfirmedAuthorization(request, commitment, output, p.paymentCommitment);
  assert.equal(mapped.requestHash, paymentHash(request));
  const mutations = [];
  for (const [field, value] of Object.entries(request)) {
    if (field === 'version') continue; // canonical codec rejects unsupported versions.
    const changed = { ...request, [field]: typeof value === 'number' ? value + 1 : /^\d+$/.test(value) && ['amountBaseUnits', 'mandateEpoch', 'expiresAt'].includes(field) ? (BigInt(value) + 1n).toString() : (value[0] === '0' ? '1' : '0') + value.slice(1) };
    assert.notDeepEqual(p.paymentCommitment(toCompactPayment(changed)), commitment, field);
    assert.throws(() => mapConfirmedAuthorization(changed, commitment, output, p.paymentCommitment), field);
    mutations.push(field);
  }
  await writeFile(project + '/evidence/gate1/compact-request-vector.json', JSON.stringify({ status: 'passed',
    canonicalSha256: mapped.requestHash, compactCommitment: mapped.compactCommitment,
    mapping: 'strict typed preimage; hashes intentionally differ', mutationRejections: mutations,
    fixtureOnly: true }, null, 2) + '\n');
});
