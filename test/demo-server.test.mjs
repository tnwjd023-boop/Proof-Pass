import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import * as demo from '../src/demo-server.mjs';

test('loopback dashboard rejects cross-origin actions, private paths and overlapping jobs', async () => {
  assert.equal(typeof demo.createDemoServer, 'function');
  const root = await mkdtemp(join(tmpdir(), 'proofpass-demo-test-'));
  let release;
  const pending = new Promise(r => { release = r; });
  let calls = 0;
  const server = await demo.createDemoServer({ project: root, runJob: async () => { calls++; await pending; } });
  try {
    await mkdir(join(root, 'evidence/gate1'), { recursive: true });
    await writeFile(join(root, 'evidence/gate1/live-flow.json'), JSON.stringify({ status: 'passed', payment: { lamports: 50000000 } }));
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;
    const state = await (await fetch(base + '/api/status')).json();
    assert.equal(state.evidence.status, 'passed');
    assert.equal(state.observation.kind, 'historical');
    for (const path of ['/.local/keys.json', '/evidence/../../.local/keys.json', '/src/demo-server.mjs']) {
      assert.equal((await fetch(base + path)).status, 404);
    }
    const post = (headers = {}) => fetch(base + '/api/run', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });
    assert.equal((await post()).status, 403);
    assert.equal((await post({ origin: 'http://evil.invalid', 'x-proofpass-token': state.token })).status, 403);
    assert.equal((await post({ origin: base, 'x-proofpass-token': state.token })).status, 202);
    assert.equal((await post({ origin: base, 'x-proofpass-token': state.token })).status, 409);
    assert.equal(calls, 1);
    release();
    await server.waitForJob();
  } finally {
    release();
    await server.waitForJob();
    await new Promise(r => server.close(r));
    assert(resolve(root).startsWith(resolve(tmpdir()) + sep));
    assert(root.includes('proofpass-demo-test-'));
    await rm(root, { recursive: true, force: true });
  }
});
