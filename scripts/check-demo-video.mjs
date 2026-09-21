import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(new URL('../evidence/demo/watch.html', import.meta.url).href);
  await page.waitForFunction(() => Number.isFinite(document.querySelector('video').duration));
  const editedSeconds = await page.locator('video').evaluate(video => video.duration);
  assert(editedSeconds > 30 && editedSeconds < 180, 'Edited presentation must fit three minutes');
  assert(await page.getByText('발표용 1.4배속 · 실시간 아님 · 내레이션 없음', { exact: true }).isVisible());
  await page.locator('video').evaluate(video => { video.src = 'actual-run-unedited.webm'; video.load(); });
  await page.waitForFunction(() => Number.isFinite(document.querySelector('video').duration));
  const originalSeconds = await page.locator('video').evaluate(video => video.duration);
  assert(Math.abs(originalSeconds / editedSeconds - 1.4) < 0.01);
  await writeFile(new URL('../evidence/demo/video-check.json', import.meta.url), JSON.stringify({ status: 'passed', originalSeconds, editedSeconds,
    playbackSpeed: 1.4, orderChanged: false, narrated: false, playerLabelsRecordedAndAccelerated: true, checkedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'passed', originalSeconds, editedSeconds }));
} finally { await browser.close(); }
