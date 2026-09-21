import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

export async function runBoundJob({ network, execute, prepare, ...options }) {
  let executed = false;
  const binding = await prepareJobBinding({ ...options, prepare: async name => {
    if (network === 'preprod') { await execute(name, true); executed = true; }
    else await prepare(name);
  } });
  if (!executed) await execute(binding, false);
}

export async function prepareJobBinding({ job, resume = false, persist, isReady, prepare }) {
  if (job.bindingName) {
    assert.match(job.bindingName, /^binding-[a-f0-9]{16}$/);
    if (await isReady(job.bindingName)) {
      job.bindingReady = true;
      await persist();
      return job.bindingName;
    }
    assert(!job.bindingReady, 'Prepared binding missing; retain journal');
  }
  // Retry incomplete identity preparation with a fresh session. No chain flow
  // starts until readiness has been durably recorded for this exact job.
  job.bindingName = 'binding-' + randomBytes(8).toString('hex');
  job.bindingReady = false;
  await persist();
  await prepare(job.bindingName);
  assert(await isReady(job.bindingName), 'Binding preparation incomplete');
  job.bindingReady = true;
  await persist();
  return job.bindingName;
}
