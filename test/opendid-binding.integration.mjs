// Real Java/OpenDID process integration. Run after building the pinned SDK fixture.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { bindingNonce } from '../src/protocol.mjs';
import { issueFixture, createOpenDidVerifier } from '../src/binding/opendid.mjs';
const privateDir = resolve('.local/gate1/sdk-' + randomBytes(8).toString('hex'));
const session = { version: 1, sessionId: '01'.repeat(32), challenge: '02'.repeat(32), audienceHash: '03'.repeat(32),
  issuerPolicyId: '04'.repeat(32), xrplNetwork: 1, xrplAccount: '05'.repeat(20), solanaCluster: '06'.repeat(32),
  solanaOwner: '07'.repeat(32), issuedAt: '1800000000', expiresAt: '1800000300' };
await issueFixture(session, privateDir);
const verify = createOpenDidVerifier(join(privateDir, 'registry.json'));
const proofPath = join(privateDir, 'proof.json');
assert.equal((await verify(session, proofPath)).verified, true);
assert.equal((await verify(session, proofPath)).nonce, bindingNonce(session));
await assert.rejects(verify({ ...session, challenge: 'ff'.repeat(32) }, proofPath), /OpenDID/);
const proof = JSON.parse(await readFile(proofPath, 'utf8'));
proof.aggregatedProof.cHash = (BigInt(proof.aggregatedProof.cHash) + 1n).toString();
await writeFile(join(privateDir, 'tampered.json'), JSON.stringify(proof));
await assert.rejects(verify(session, join(privateDir, 'tampered.json')), /OpenDID/);
const supplied = JSON.parse(await readFile(proofPath, 'utf8'));
supplied.verified = true;
supplied.credentialDefinition = {};
await writeFile(join(privateDir, 'injected.json'), JSON.stringify(supplied));
await assert.rejects(verify(session, join(privateDir, 'injected.json')), /OpenDID/);
await assert.rejects(verify({ ...session, issuerPolicyId: 'aa'.repeat(32) }, proofPath), /policy/);
// Regression: a proof without credentials must not pass even with a valid public challenge.
let nonceHex = BigInt(bindingNonce(session)).toString(16);
if (nonceHex.length % 2) nonceHex = '0' + nonceHex;
const emptyHash = createHash('sha256').update(Buffer.concat([Buffer.from([0]), Buffer.from(nonceHex, 'hex')])).digest('hex');
await writeFile(join(privateDir, 'empty.json'), JSON.stringify({ proofs: [], identifiers: [], requestedProof: {},
  aggregatedProof: { cList: [[0]], cHash: BigInt('0x' + emptyHash).toString() } }));
const stricter = JSON.parse(await readFile(join(privateDir, 'registry.json'), 'utf8'));
stricter.policyDate = '1900-01-01';
await writeFile(join(privateDir, 'stricter-registry.json'), JSON.stringify(stricter));
const decisions = await Promise.allSettled([
  verify(session, join(privateDir, 'empty.json')),
  createOpenDidVerifier(join(privateDir, 'stricter-registry.json'))(session, proofPath),
]);
assert.deepEqual(decisions.map(item => item.status), ['rejected', 'rejected'],
  'Credential-free proof and mismatched age predicate must both be rejected');
for (const [name, mutate] of [
  ['missing-age-mapping', p => { p.requestedProof.predicates = {}; }],
  ['missing-age-proof', p => { p.proofs[0].primaryProof.neProofs = []; }],
  ['untrusted-identifier', p => { p.identifiers[0].credDefId = 'did:omn:untrusted'; }],
]) {
  const altered = JSON.parse(await readFile(proofPath, 'utf8'));
  mutate(altered);
  const alteredPath = join(privateDir, name + '.json');
  await writeFile(alteredPath, JSON.stringify(altered));
  await assert.rejects(verify(session, alteredPath), /OpenDID/);
}
await mkdir('evidence/gate1', { recursive: true });
await writeFile('evidence/gate1/opendid-binding.json', JSON.stringify({ mode: 'actual-sdk-separate-issuer-and-verifier-processes',
  normal: 'accepted', changedNonce: 'rejected', tamperedProof: 'rejected', callerDefinitionInjection: 'rejected',
  changedPolicy: 'rejected', credentialFreeProof: 'rejected', weakerAgePredicate: 'rejected',
  missingAgeMapping: 'rejected', missingAgeProof: 'rejected', untrustedIdentifier: 'rejected',
  privateArtifacts: 'not-published', completedAt: new Date().toISOString() }, null, 2) + '\n');
console.log('Real OpenDID binding integration passed: normal + nine negative cases.');
