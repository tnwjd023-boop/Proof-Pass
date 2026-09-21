import test from 'node:test';
import assert from 'node:assert/strict';
import { runBoundJob } from '../src/demo-binding.mjs';

test('Preprod prepares identity after wallet warmup and resumes the same binding after flow failure', async () => {
  const job = {}, ready = new Set(), calls = [];
  let first = true;
  const options = { network: 'preprod', job, persist: async () => {}, isReady: async name => ready.has(name),
    prepare: async () => { throw Error('Identity must be created by warm runner'); },
    execute: async (name, fresh) => { calls.push({ name, fresh }); if (fresh) ready.add(name); if (first) { first = false; throw Error('Flow interrupted after binding'); } } };
  await assert.rejects(runBoundJob(options), /Flow interrupted/);
  await runBoundJob({ ...options, resume: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].name, calls[1].name);
  assert.equal(calls[0].fresh, true);
  assert.equal(calls[1].fresh, false);
});
