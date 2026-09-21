import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDemoServer } from '../src/demo-server.mjs';

test('Preprod dashboard keeps local results and operator limits out of its view', async () => {
  const root = await mkdtemp(join(tmpdir(), 'proofpass-network-test-'));
  const binding = 'binding-0123456789abcdef';
  let server;
  try {
    for (const folder of ['evidence/gate1', '.local/gate1/' + binding + '/live', '.local/gate1/' + binding + '/live-preprod']) await mkdir(join(root, folder), { recursive: true });
    await writeFile(join(root, 'evidence/gate1/live-flow.json'), JSON.stringify({ status: 'passed', midnightNetwork: 'undeployed-local' }));
    await writeFile(join(root, '.local/gate1/latest-binding.json'), JSON.stringify({ directory: binding }));
    await writeFile(join(root, '.local/gate1', binding, 'live/operator-view.json'), JSON.stringify({ maxPerTxLamports: '999' }));
    server = await createDemoServer({ project: root, network: 'preprod', readOnly: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const status = async () => (await fetch('http://127.0.0.1:' + server.address().port + '/api/status')).json();
    let state = await status();
    assert.equal(state.network, 'preprod');
    assert.equal(state.evidence, null);
    assert.equal(state.operatorPolicy, null);
    await mkdir(join(root, 'evidence/preprod'), { recursive: true });
    await writeFile(join(root, 'evidence/preprod/live-flow.json'), JSON.stringify({ status: 'passed', midnightNetwork: 'preprod' }));
    await writeFile(join(root, '.local/gate1', binding, 'live-preprod/operator-view.json'), JSON.stringify({ maxPerTxLamports: '100000000' }));
    state = await status();
    assert.equal(state.evidence.midnightNetwork, 'preprod');
    assert.equal(state.operatorPolicy.maxPerTxLamports, '100000000');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    assert(root.startsWith(join(tmpdir(), 'proofpass-network-test-')));
    await rm(root, { recursive: true, force: true });
  }
});

test('dashboard network text follows server selection and fails closed on mismatched evidence', async () => {
  const { runInNewContext } = await import('node:vm');
  const code = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');
  const elements = new Map();
  const element = () => ({ textContent: '', className: '', children: [], append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; }, addEventListener() {} });
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  let state = { network: 'preprod', job: { status: 'idle' }, evidence: { status: 'passed', midnightNetwork: 'undeployed-local' } };
  const context = { document: { getElementById: get, createElement: element }, fetch: async () => ({ ok: true, json: async () => state }), setInterval() {} };
  runInNewContext(code, context);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(get('midnight-network').textContent, /Preprod/);
  assert.equal(get('midnight-badge').textContent, '기록 없음');
  state = { ...state, evidence: { status: 'passed', midnightNetwork: 'preprod' } };
  await context.refresh();
  assert.equal(get('midnight-badge').textContent, '최근 실행 통과');
  state = { network: 'undeployed', job: { status: 'idle' }, evidence: null };
  await context.refresh();
  assert.match(get('midnight-network').textContent, /로컬/);
});
