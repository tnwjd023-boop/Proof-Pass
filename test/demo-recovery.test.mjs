import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createDemoServer } from '../src/demo-server.mjs';
import * as binding from '../src/demo-binding.mjs';

test('failed new preparation never resumes an older completed binding', async () => {
  assert.equal(typeof binding.prepareJobBinding, 'function');
  const job = {};
  const saved = [];
  const options = { job, persist: async () => saved.push(structuredClone(job)), isReady: async () => false,
    prepare: async () => { throw Error('identity unavailable'); } };
  await assert.rejects(binding.prepareJobBinding(options), /identity unavailable/);
  assert.match(job.bindingName, /^binding-[a-f0-9]{16}$/);
  assert.notEqual(job.bindingName, 'binding-0000000000000000');
  const first = job.bindingName;
  await assert.rejects(binding.prepareJobBinding({ ...options, resume: true }), /identity unavailable/);
  assert.notEqual(job.bindingName, first);
  assert.equal(job.bindingReady, false);
  assert(saved.length >= 2);
});

test('read-only browser inspection leaves an active operator journal unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'proofpass-demo-recovery-'));
  const path = join(root, '.local/demo/job.json');
  await mkdir(join(root, '.local/demo'), { recursive: true });
  const original = JSON.stringify({ status: 'running', stage: 'identity' });
  await writeFile(path, original);
  const server = await createDemoServer({ project: root, readOnly: true, runJob: async () => {} });
  try { assert.equal(await readFile(path, 'utf8'), original); }
  finally { server.close(); assert(resolve(root).startsWith(resolve(tmpdir()) + sep)); await rm(root, { recursive: true, force: true }); }
});

for (const when of ['initial', 'final']) test(when + ' journal write failure stays alive and requires recovery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'proofpass-demo-recovery-'));
  const temporary = join(root, '.local/demo/job.json.tmp');
  let calls = 0;
  const server = await createDemoServer({ project: root, runJob: async () => { calls++; if (when === 'final') await mkdir(temporary); } });
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;
    const token = (await (await fetch(base + '/api/status')).json()).token;
    if (when === 'initial') await mkdir(temporary);
    const post = path => fetch(base + path, { method: 'POST', headers: { origin: base, 'content-type': 'application/json', 'x-proofpass-token': token }, body: '{}' });
    await post('/api/run');
    await server.waitForJob();
    const state = await (await fetch(base + '/api/status')).json();
    assert.equal(state.job.status, 'failed');
    assert.equal((await post('/api/run')).status, 409);
    await rm(temporary, { recursive: false, force: true }).catch(async () => { const { rmdir } = await import('node:fs/promises'); await rmdir(temporary); });
    assert.equal((await post('/api/resume')).status, 202);
    await server.waitForJob();
    assert.equal(calls, when === 'initial' ? 1 : 2);
  } finally {
    await new Promise(r => server.close(r));
    assert(resolve(root).startsWith(resolve(tmpdir()) + sep));
    await rm(root, { recursive: true, force: true });
  }
});
