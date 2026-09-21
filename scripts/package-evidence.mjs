import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const load = async file => JSON.parse(await readFile(join(root, file), 'utf8'));
const save = async (file, value) => writeFile(join(root, file), JSON.stringify(value, null, 2) + '\n');
const flow = await load('evidence/gate1/live-flow.json');
const recovery = await load('evidence/gate1/live-recovery.json');
const browser = await load('evidence/demo/browser-check.json');
const ui = await load('evidence/demo/ui-live-run.json');
const uiResume = await load('evidence/demo/ui-resume.json');
const video = await load('evidence/demo/video-check.json');
const deployment = await load('evidence/gate1/solana-authorization-deployment.json');
const midnight = await load('evidence/gate1/midnight-live-deployment.json');
const concurrency = await load('evidence/gate1/solana-concurrent-consumption.json');
for (const value of [flow, recovery, browser, ui, uiResume, video, concurrency]) assert.equal(value.status, 'passed');
assert.equal(flow.fullGate1Complete, true);
assert.equal(flow.overLimit.noSubmission, true);
assert.equal(flow.duplicatePayments, 0);
assert.equal(recovery.newPayments, 0);
assert.equal(recovery.paymentSignature, flow.payment.signature);
assert.equal(ui.paymentSignature, flow.payment.signature);
assert.equal(uiResume.paymentSignature, flow.payment.signature);
assert(flow.rejectedPayments.every(x => x.liveAtAttempt && x.balancesUnchanged));
const testBytes = await readFile(join(root, '.local/setup/final-node-tests.tap'));
const tap = testBytes.toString(testBytes[0] === 255 && testBytes[1] === 254 ? 'utf16le' : 'utf8');
assert.match(tap, /# fail 0\b/);
const passed = Number(tap.match(/# pass (\d+)/)?.[1]);
assert(passed >= 36);
const testNames = [...tap.matchAll(/^ok \d+ - (.+)$/gm)].map(x => x[1].trim());
await save('evidence/demo/node-tests.json', { status: 'passed', passed, failed: 0, command: 'node --test test/*.test.mjs', tests: testNames, packagedAt: new Date().toISOString() });
const status = await load('evidence/gate1/status.json');
Object.assign(status, { stage: 'Actual OpenDID/XRPL/Midnight/Solana flow and local operator demo', fullGate1Complete: true,
  productUiComplete: true, nodeTestsPassed: passed, remaining: [], checkedAt: new Date().toISOString(),
  liveIntegrationReview: { importantFindings: 2, fixed: 2, reReview: false,
    fixes: ['Actual validated issuer/type/subject bound before source signing', 'Durable phases and original receipt deltas; expired binding permits historical recovery only'] },
  dashboardReview: { importantFindings: 3, fixed: 3, reReview: false,
    fixes: ['Job-specific binding selection and preparation checkpoint', 'Initial/final journal errors retain failed state and release busy flag', 'Read-only browser inspection preserves operator journal'] },
  resumeLimit: 'Unfinished live phases stop if binding/approval expires; no new approval from expired evidence',
  publication: 'Local deliverables only; not submitted or publicly deployed' });
status.artifacts = {};
for (const file of (await readdir(join(root, 'evidence/gate1'))).sort()) {
  if (!file.endsWith('.json') || file === 'status.json') continue;
  const bytes = await readFile(join(root, 'evidence/gate1', file));
  status.artifacts[file] = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}
await save('evidence/gate1/status.json', status);
const sources = {};
async function collect(directory) {
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    if (['node_modules', 'target', 'dist', 'managed', '.local', '.tools', '.external', 'build'].includes(entry.name)) continue;
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await collect(file);
    else if (/\.(mjs|js|json|md|rs|compact|sh|css|html|toml|lock|java|hex)$/.test(entry.name)) {
      const bytes = await readFile(join(root, file));
      sources[file.replaceAll('\\', '/')] = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
    }
  }
}
for (const directory of ['src', 'scripts', 'web', 'test', 'midnight', 'solana', 'config', 'docs']) await collect(directory);
for (const file of ['README.md', 'COMPATIBILITY.md', 'package.json', 'package-lock.json', 'ProofPass_기획서_v2.md']) {
  const bytes = await readFile(join(root, file)); sources[file] = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}
const artifacts = {};
for (const file of ['gate1/live-flow.json', 'gate1/live-recovery.json', 'gate1/status.json', 'demo/browser-check.json', 'demo/node-tests.json', 'demo/ui-live-run.json', 'demo/ui-resume.json', 'demo/video-check.json', 'demo/watch.html', 'demo/desktop.png', 'demo/mobile.png', 'demo/actual-run-unedited.webm', 'demo/actual-run-1.4x-edited.webm']) {
  const bytes = await readFile(join(root, 'evidence', file));
  artifacts['evidence/' + file] = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}
await save('evidence/demo-run.json', { status: 'passed', packagedAt: new Date().toISOString(), codeCommit: null,
  codeIdentity: 'SHA-256 source manifest; workspace has no Git repository',
  networks: { identity: 'Synthetic issuer, actual OpenDID SDK cryptography', xrpl: 'Testnet', midnight: 'undeployed-local', solana: 'Devnet' },
  contracts: { midnight, solana: deployment },
  gates: { feasibility: 'passed', liveIntegration: 'passed', coreAbuseCases: 'passed', localUiAndEvidence: 'passed' },
  tests: { node: passed, compact: status.compactPolicyTestsPassed, rust: status.rustDestinationTestsPassed,
    solanaLocalOperations: status.solanaLocalChecksPassed, browserViewports: browser.results.map(x => x.name) },
  latestRun: { completedAt: flow.completedAt, payment: flow.payment, rejectedPayments: flow.rejectedPayments,
    overLimit: flow.overLimit, metrics: flow.metrics, recovery, ui, uiResume, video },
  concurrency: { network: 'local-validator', successfulPayments: concurrency.successfulPayments, duplicatePayments: concurrency.duplicatePayments },
  limitations: ['Trusted adapters, clock and relay; not a trustless bridge', 'Local prover sees private inputs',
    'Public transaction references and timing can correlate activity', 'Cross-chain revocation is delayed, not atomic',
    'Synthetic identity issuer and project-held test wallets; no mobile wallet integration',
    'Midnight is local; Solana upgrade authority retained by operator',
    'Expired unfinished phases fail closed; ambiguous transactions require reconciliation',
    'Not a production security audit; no public submission or deployment'],
  artifacts, sourceManifest: sources });
console.log(JSON.stringify({ status: 'packaged', sourceFiles: Object.keys(sources).length, nodeTests: passed, evidence: 'evidence/demo-run.json' }));
