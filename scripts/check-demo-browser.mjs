import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createDemoServer } from '../src/demo-server.mjs';
const project = fileURLToPath(new URL('../', import.meta.url));
const server = await createDemoServer({ project, readOnly: true });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
const results = [];
await mkdir(project + '/evidence/demo', { recursive: true });
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1080 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByText('최근 실행 통과', { exact: true }).first().waitFor();
    assert.equal(await page.locator('.stage').count(), 4);
    assert.equal(await page.getByRole('link', { name: 'Explorer ↗' }).count(), 7);
    assert(await page.getByText('위임 한도 초과 요청', { exact: true }).isVisible());
    assert(await page.getByText('현재 자격 상태: 확인 불가 · 과거 기록', { exact: true }).isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name + ' horizontal overflow');
    await page.screenshot({ path: project + '/evidence/demo/' + name + '.png', fullPage: true });
    results.push({ name, viewport, fourStages: true, actualExplorerLinks: 7, historicalStateClearlyLabeled: true, horizontalOverflow: false });
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(project + '/evidence/demo/browser-check.json', JSON.stringify({ status: 'passed', browser: 'Microsoft Edge via Playwright', results, pageErrors: errors, checkedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'passed', viewports: results.map(x => x.name), pageErrors: 0 }));
} finally { await browser.close(); await new Promise(r => server.close(r)); }
