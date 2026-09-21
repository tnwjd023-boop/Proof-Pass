import assert from 'node:assert/strict';

export function freshSubmissionService(connect) {
  let active, closed = false;
  return {
    async submitTransaction(tx, status) {
      assert(!closed, 'Submission service closed');
      assert(!active, 'A transaction submission is already active');
      const operation = (async () => {
        const client = await connect();
        try { return await client.submit(tx, status); }
        finally { await client.close(); }
      })();
      active = operation;
      try { return await operation; }
      finally { active = undefined; }
    },
    async close() { closed = true; if (active) await active.catch(() => {}); }
  };
}
