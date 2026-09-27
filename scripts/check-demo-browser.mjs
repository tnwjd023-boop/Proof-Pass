import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createDemoServer } from '../src/demo-server.mjs';
import { networkProfile } from '../src/midnight/network.mjs';
const project = fileURLToPath(new URL('../', import.meta.url));
const profile = networkProfile(process.env.PROOFPASS_MIDNIGHT_NETWORK ?? 'undeployed');
// UI checks are new artifacts, never replacements for historical chain evidence.
const output = project + '/artifacts/authorization-story/' + profile.networkId;
const server = await createDemoServer({ project, readOnly: true, network: profile.networkId });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
const results = [];
await mkdir(output, { recursive: true });
try {
  const state = await (await fetch(url + '/api/status')).json();
  assert.equal(state.network, profile.networkId);
  const completed = state.evidence?.status === 'passed';
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1080 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('#midnight-network').filter({ hasText: profile.networkId === 'preprod' ? 'Preprod' : '로컬' }).waitFor();
    await page.getByText(completed ? '최근 실행 통과' : '확정된 실행 기록 없음', { exact: true }).first().waitFor();
    assert.equal(await page.locator('.stage').count(), 4);
    const explorerLinks = await page.getByRole('link', { name: 'Explorer ↗' }).count();
    assert.equal(explorerLinks, completed ? 7 : 0);
    if (completed) assert.match(await page.locator('#limit-outcome').textContent(), /승인 생성 거절 확인/);
    else assert.equal(await page.getByText('최근 실행 통과', { exact: true }).count(), 0);
    assert(await page.getByText('현재 자격 상태: 확인 불가 · 과거 기록', { exact: true }).isVisible());
    assert(await page.locator('#run').isDisabled());
    assert(await page.locator('#resume').isDisabled());
    assert.equal(await page.locator('.operator-details').getAttribute('open'), null);
    if (completed) {
      assert.equal(await page.locator('#result-link').getAttribute('href'), 'https://explorer.solana.com/tx/' + state.evidence.payment.signature + '?cluster=devnet');
      assert.match(await page.locator('#result-amount').textContent(), /0\.05 SOL/);
      assert.match(await page.locator('#result-consumed').textContent(), /소비됨/);
      assert.match(await page.locator('#result-lamports').textContent(), /50,000,000 lamports moved/);
      assert.match(await page.locator('#policy-outcome').textContent(), /AUTHORIZATION CREATED/);
      assert.match(await page.locator('#revoke-outcome').textContent(), /REJECTED/);
      assert.match(await page.locator('#revoke-balance').textContent(), /0 SOL moved/);
      const denial = state.evidence.rejectedPayments.find(x => x.name === 'source-deleted');
      assert.equal(await page.locator('#revoke-link').getAttribute('href'), 'https://explorer.solana.com/tx/' + denial.signature + '?cluster=devnet');
      assert.equal(await page.locator('#checks .check-row').count(), 4);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name + ' horizontal overflow');
    await page.screenshot({ path: output + '/' + name + '.png', fullPage: true });
    results.push({ name, viewport, fourStages: true, actualExplorerLinks: explorerLinks, historicalStateClearlyLabeled: true, horizontalOverflow: false });
    await page.close();
  }
  // Intercept all actions: these exercise UI behavior, never the chain runner.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => errors.push(e.message));
  let mock = { ...state, readOnly: false, externalBusy: false, job: { status: 'idle', stage: 'ready' } };
  let unavailable = false;
  const actions = [];
  await page.route('**/api/status', route => unavailable
    ? route.fulfill({ status: 503, body: '{}' })
    : route.fulfill({ json: mock }));
  for (const action of ['run', 'resume']) await page.route('**/api/' + action, async route => {
    assert.equal(route.request().method(), 'POST');
    assert.equal(route.request().postData(), '{}');
    assert.equal(route.request().headers()['x-proofpass-token'], state.token);
    actions.push(action);
    mock = { ...mock, job: { status: 'running', stage: action === 'run' ? 'midnight-payment' : 'reconciliation' } };
    await route.fulfill({ status: 202, json: { status: 'running' } });
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  assert(await page.locator('#resume').isDisabled());
  await page.locator('#run').click();
  await page.waitForFunction(() => document.getElementById('job-label').textContent.includes('증명 중'));
  assert(await page.locator('#run').isDisabled());
  assert(await page.locator('#resume').isDisabled());
  assert.match(await page.locator('#job-detail').textContent(), /마지막 완료 기록/);
  const recorded = await page.locator('#result-amount').textContent();
  await page.screenshot({ path: output + '/running-mobile.png', fullPage: true });
  mock = { ...mock, job: { status: 'failed', stage: 'resume-required' } };
  await page.evaluate(() => refresh());
  assert(await page.locator('#run').isDisabled());
  assert(await page.locator('#resume').isEnabled());
  await page.locator('#resume').click();
  await page.waitForFunction(() => document.getElementById('job-label').textContent.includes('대조 중'));
  assert.deepEqual(actions, ['run', 'resume']);
  unavailable = true;
  await page.evaluate(() => refresh());
  assert.match(await page.locator('#job-label').textContent(), /확인 불가/);
  assert.match(await page.locator('#result-time').textContent(), /과거 기록/);
  assert.equal(await page.locator('#result-amount').textContent(), recorded);
  assert(await page.locator('#run').isDisabled());
  assert(await page.locator('#resume').isDisabled());
  await page.screenshot({ path: output + '/unavailable-mobile.png', fullPage: true });
  unavailable = false;
  for (const evidence of [null, { ...state.evidence, status: 'running' }, { ...state.evidence, midnightNetwork: 'wrong-network' }]) {
    mock = { ...mock, evidence };
    await page.evaluate(() => refresh());
    assert.equal(await page.locator('#result-amount').textContent(), '—');
    assert(await page.locator('#result-link').isHidden());
    assert.equal(await page.locator('.badge.good').count(), 0);
    assert.match(await page.locator('#revoke-outcome').textContent(), /확인 불가/);
    assert(await page.locator('#revoke-link').isHidden());
    assert.equal(await page.locator('.policy-checks.verified').count(), 0);
  }
  await page.screenshot({ path: output + '/no-evidence-mobile.png', fullPage: true });
  // Never infer execution-time revocation from a generic failure or expiry.
  for (const change of [{ programError: 6002 }, { balancesUnchanged: false }, { liveAtAttempt: false }, { remainingLeaseMs: 0 }]) {
    mock = { ...mock, evidence: { ...state.evidence, rejectedPayments: state.evidence.rejectedPayments.map(x => x.name === 'source-deleted' ? { ...x, ...change } : x) } };
    await page.evaluate(() => refresh());
    assert.match(await page.locator('#revoke-outcome').textContent(), /확인 불가/);
    assert.doesNotMatch(await page.locator('#revoke-balance').textContent(), /0 SOL moved/);
    assert(await page.locator('#revoke-link').isHidden());
  }
  // A changed record must drive the display, not the illustrative 0.05 SOL.
  mock = { ...mock, evidence: { ...state.evidence, status: 'passed', midnightNetwork: profile.networkId === 'preprod' ? 'preprod' : 'undeployed-local', payment: { lamports: 25000000, vaultDelta: -25000000, recipientDelta: 25000000, consumed: false, signature: 'invalid' } } };
  await page.evaluate(() => refresh());
  assert.equal(await page.locator('#result-amount').textContent(), '0.025 SOL');
  assert.match(await page.locator('#result-consumed').textContent(), /미소비/);
  assert(await page.locator('#result-link').isHidden());
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, '320px horizontal overflow');
  await page.close();
  assert.deepEqual(errors, []);
  await writeFile(output + '/browser-check.json', JSON.stringify({ status: 'passed', checkScope: 'read-only evidence rendering and mocked UI transitions; no chain submission', network: profile.networkId, completedChainRunPresent: completed, browser: 'Microsoft Edge via Playwright', results, mockChecks: ['run and resume POST/token', 'running retains historical result', 'failed allows resume only', '503 disables actions and labels cached record', 'missing/incomplete/wrong-network evidence has no success badge', 'amount and consumption follow record', 'invalid transaction link hidden', '320px no overflow'], pageErrors: errors, checkedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'passed', viewports: results.map(x => x.name), pageErrors: 0 }));
} finally { await browser.close(); await new Promise(r => server.close(r)); }
