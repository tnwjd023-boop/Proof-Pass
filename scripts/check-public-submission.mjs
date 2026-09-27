import { chromium } from 'playwright';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { submissionServer } from './submission-server.mjs';
const remote=process.argv[2];
const local=remote?null:await submissionServer();
const base=remote||local.url+'/';
const browser=await chromium.launch({channel:'msedge',headless:true});
const errors=[];const results=[];
try {
  for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]) {
    const page=await browser.newPage({viewport});page.on('pageerror',e=>errors.push(e.message));
    const response=await page.goto(base,{waitUntil:'networkidle'});assert.equal(response.status(),200);
    await page.locator('#result-payment').filter({hasText:'PAID'}).waitFor();
    assert.match(await page.locator('#revoke-balance').textContent(),/0 SOL moved/);
    assert(await page.locator('#run').isHidden());assert(await page.locator('#resume').isHidden());
    const state=await (await page.request.get(new URL('api/status.json',base).href)).json();
    assert.equal(state.readOnly,true);assert.equal(state.token,undefined);assert.equal(state.operatorPolicy,null);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:'artifacts/submission/'+(remote?'live-':'public-')+name+'.png',fullPage:true});
    await page.goto(new URL('watch.html?v=english-captions-1',base).href,{waitUntil:'networkidle'});
    assert.equal(await page.locator('video').getAttribute('data-captions'),'burned-en');
    assert.match(await page.locator('source').getAttribute('src'),/ProofPass-Demo-Captioned.mp4/);
    await page.waitForFunction(()=>Number.isFinite(document.querySelector('video').duration));
    const seconds=await page.locator('video').evaluate(v=>v.duration);assert(seconds>120&&seconds<180);
    await page.locator('[data-time]').nth(4).click();
    await page.waitForFunction(()=>document.querySelector('video').currentTime>60&&!document.querySelector('video').paused);
    await page.screenshot({path:'artifacts/submission/'+(remote?'live-':'public-')+'video-'+name+'.png',fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    results.push({name,durationSeconds:seconds,paid:true,revokedZero:true,readOnly:true,videoSeekAndPlay:true,overflow:false});
    await page.close();
  }
  for(const path of ['deck.html','ProofPass-Project-Deck.pptx','ProofPass-Project-Deck.pdf','evidence/live-flow.json','captions-en.vtt']){
    const response=await fetch(new URL(path,base));assert.equal(response.status,200,path);await response.body?.cancel();
  }
  assert.deepEqual(errors,[]);
  if(!remote){
    const files=await readdir('dist/submission',{recursive:true});
    assert(files.every(f=>!/(\.local|\.env|private|node_modules|\.git)/.test(f)));
    const app=await readFile('dist/submission/app.js','utf8');assert(!app.includes("method: 'POST'"));
  }
  await writeFile('artifacts/submission/'+(remote?'live-':'public-')+'check.json',JSON.stringify({status:'passed',url:base,results,pageErrors:errors,checkedAt:new Date().toISOString()},null,2)+'\n');
  console.log(JSON.stringify({status:'passed',remote:!!remote,results}));
} finally {await browser.close();if(local){local.server.closeAllConnections();await new Promise(r=>local.server.close(r));}}
