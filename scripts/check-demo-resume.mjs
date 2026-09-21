import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  const prior = await page.evaluate(async () => (await (await fetch('/api/status')).json()));
  assert.equal(prior.job.status, 'passed');
  await page.getByRole('button', { name: '기존 실행 재개' }).click();
  let state;
  for (let n = 0; n < 80; n++) {
    await page.waitForTimeout(3000);
    state = await page.evaluate(async () => (await (await fetch('/api/status')).json()));
    if (state.job.status === 'failed') throw Error('Dashboard resume failed');
    if (state.job.status === 'passed' && state.job.completedAt !== prior.job.completedAt) break;
  }
  assert.equal(state.job.status, 'passed');
  assert.notEqual(state.job.completedAt, prior.job.completedAt);
  assert.equal(state.evidence.payment.signature, prior.evidence.payment.signature);
  const recovery = JSON.parse(await readFile(new URL('../evidence/gate1/live-recovery.json', import.meta.url), 'utf8'));
  assert.equal(recovery.paymentSignature, state.evidence.payment.signature);
  assert.equal(recovery.newPayments, 0);
  await writeFile(new URL('../evidence/demo/ui-resume.json', import.meta.url), JSON.stringify({ status: 'passed',
    paymentSignature: recovery.paymentSignature, newPayments: 0, trigger: 'Dashboard resume button via Edge', checkedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'passed', newPayments: 0, action: 'dashboard-resume' }));
} finally { await browser.close(); }
