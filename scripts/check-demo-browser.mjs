import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createDemoServer } from '../src/demo-server.mjs';
import { networkProfile } from '../src/midnight/network.mjs';
const project = fileURLToPath(new URL('../', import.meta.url));
const profile = networkProfile(process.env.PROOFPASS_MIDNIGHT_NETWORK ?? 'undeployed');
const output = project + '/' + (profile.networkId === 'preprod' ? 'evidence/preprod/browser' : 'evidence/demo');
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
    if (completed) assert(await page.getByText('위임 한도 초과 요청', { exact: true }).isVisible());
    else assert.equal(await page.getByText('최근 실행 통과', { exact: true }).count(), 0);
    assert(await page.getByText('현재 자격 상태: 확인 불가 · 과거 기록', { exact: true }).isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name + ' horizontal overflow');
    await page.screenshot({ path: output + '/' + name + '.png', fullPage: true });
    results.push({ name, viewport, fourStages: true, actualExplorerLinks: explorerLinks, historicalStateClearlyLabeled: true, horizontalOverflow: false });
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(output + '/browser-check.json', JSON.stringify({ status: 'passed', checkScope: 'dashboard-rendering', network: profile.networkId, completedChainRunPresent: completed, browser: 'Microsoft Edge via Playwright', results, pageErrors: errors, checkedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'passed', viewports: results.map(x => x.name), pageErrors: 0 }));
} finally { await browser.close(); await new Promise(r => server.close(r)); }
