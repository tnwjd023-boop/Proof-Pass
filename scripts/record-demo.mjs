import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const project = fileURLToPath(new URL('../', import.meta.url));
const directory = project + '/evidence/demo';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, recordVideo: { dir: directory + '/recordings', size: { width: 1440, height: 1080 } } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const started = Date.now();
let finalState;
try {
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  const prior = await page.evaluate(async () => (await (await fetch('/api/status')).json()).evidence?.payment?.signature);
  await page.getByRole('button', { name: '실제 데모 실행' }).click();
  for (let n = 0; n < 160; n++) {
    await page.waitForTimeout(3000);
    finalState = await page.evaluate(async () => (await (await fetch('/api/status')).json()));
    if (finalState.job.status === 'failed') throw Error('Actual dashboard run failed; retain video and journals');
    if (finalState.job.status === 'passed') break;
  }
  assert.equal(finalState.job.status, 'passed');
  assert.notEqual(finalState.evidence.payment.signature, prior, 'New run did not produce its own payment receipt');
  assert.equal(finalState.evidence.overLimit.noSubmission, true);
  assert.equal(finalState.evidence.rejectedPayments.length, 3);
  await page.locator('.lower-grid').scrollIntoViewIfNeeded();
  await page.waitForTimeout(5000);
  await page.locator('.receipts').scrollIntoViewIfNeeded();
  await page.waitForTimeout(5000);
  assert.deepEqual(errors, []);
} finally {
  const video = page.video();
  await context.close();
  await video.saveAs(directory + '/actual-run-unedited.webm');
  await video.delete();
  await browser.close();
}
await writeFile(directory + '/ui-live-run.json', JSON.stringify({ status: 'passed',
  trigger: 'Actual dashboard button via Edge', durationMs: Date.now() - started,
  paymentSignature: finalState.evidence.payment.signature, completedAt: finalState.evidence.completedAt,
  video: 'actual-run-unedited.webm', edited: false, includesPreviousRecordedEvidenceWhileRunning: true,
  pageErrors: errors, checkedAt: new Date().toISOString() }, null, 2) + '\n');
console.log(JSON.stringify({ status: 'passed', video: 'evidence/demo/actual-run-unedited.webm', elapsedMs: Date.now() - started }));
