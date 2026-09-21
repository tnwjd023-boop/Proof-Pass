import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSubmissionService } from '../src/midnight/fresh-submission.mjs';

test('submission uses a fresh connected client for each transaction, closes on failure, and never reconnects a disconnected client', async () => {
  let connections = 0, closed = 0;
  const service = freshSubmissionService(async () => {
    connections++;
    let connected = true;
    return { submit: async tx => { assert(connected); if (tx === 'failed') throw Error('uncertain'); return tx; }, close: async () => { connected = false; closed++; } };
  });
  assert.equal(connections, 0, 'no RPC connection while restoring large wallet state');
  assert.equal(await service.submitTransaction('first', 'Finalized'), 'first');
  await assert.rejects(service.submitTransaction('failed', 'Finalized'), /uncertain/);
  assert.equal(await service.submitTransaction('third', 'Finalized'), 'third');
  assert.equal(connections, 3); assert.equal(closed, 3);
  await service.close();
  await assert.rejects(service.submitTransaction('after-close'), /closed/);
});
