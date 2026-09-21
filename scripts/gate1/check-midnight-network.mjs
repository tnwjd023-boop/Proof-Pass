import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const images = ['midnightntwrk/midnight-node:1.0.0', 'midnightntwrk/indexer-standalone:4.3.3', 'midnightntwrk/proof-server:8.1.0'];
const digests = images.map(image => {
  const [value] = JSON.parse(execFileSync('docker', ['image', 'inspect', image], { encoding: 'utf8' }));
  assert(value.RepoDigests.length > 0);
  return { image, id: value.Id, digests: value.RepoDigests };
});
const get = async (url, body, asText = false) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000), ...(body ? {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  } : {}) });
  assert(r.ok, `HTTP ${r.status}`);
  return asText ? r.text() : r.json();
};
const health = await get('http://127.0.0.1:9944/health');
const proof = (await get('http://127.0.0.1:6300/version', undefined, true)).trim();
assert.equal(proof, '8.1.0');
const rpc = async method => {
  const value = await get('http://127.0.0.1:9944', { jsonrpc: '2.0', id: 1, method, params: [] });
  assert(!value.error, JSON.stringify(value.error));
  return value.result;
};
const finalizedHead = await rpc('chain_getFinalizedHead');
assert.match(finalizedHead, /^0x[0-9a-f]{64}$/);
const indexer = await get('http://127.0.0.1:8088/api/v4/graphql', { query: '{ __typename }' });
assert(!indexer.errors, JSON.stringify(indexer.errors));
assert.equal(indexer.data.__typename, 'Query');
const report = { status: 'passed', mode: 'local-undeployed-network', images: digests,
  health, proofServerVersion: proof, finalizedHead, indexerQuery: 'passed', checkedAt: new Date().toISOString(),
  policyDeployed: false, fullGate1Complete: false };
await writeFile(fileURLToPath(new URL('../../evidence/gate1/midnight-network.json', import.meta.url)), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
