import { chromium } from 'playwright';
import { mkdir, writeFile, copyFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { narration } from './submission-narration-en.mjs';
import { submissionServer } from './submission-server.mjs';
const require=createRequire(import.meta.url);
const ffmpeg=require('../.local/submission-tools/node_modules/ffmpeg-static');
const ffprobe=require('../.local/submission-tools/node_modules/ffprobe-static').path;
const duration=path=>Number(execFileSync(ffprobe,['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',path],{encoding:'utf8',windowsHide:true}));
const run=args=>execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y',...args],{windowsHide:true,stdio:'pipe',maxBuffer:1000000});
const out='artifacts/submission';
await mkdir(out+'/recordings',{recursive:true});
const sections=[
  ['PRIVATE AUTHORIZATION','권한이 사라지면, 기존 승인도 지급을 멈춰야 합니다.'],
  ['SCENE A · PRIVATE POLICY','신원·위임 한도는 목적지에 원문 비공개 / 요청 금액·주소는 공개'],
  ['WHY ZK?','0.05 SOL ≤ [HIDDEN] → 승인 / 0.15 SOL → 승인 생성 거절'],
  ['SCENE B · ACTUAL PAYMENT','50,000,000 lamports moved · 0.05 SOL PAID'],
  ['SCENE C · REVOCATION','만료까지 약 7초가 남아 있어도 REJECTED · 0 SOL moved'],
  ['ENFORCEMENT EVIDENCE','정상 지급 / 재사용 거절 / 위임 취소 거절 / 자격 삭제 거절'],
  ['TRUST BOUNDARIES','Trusted relay / observer / adapters / time · 취소 반영 지연 존재']
];
const {server,url}=await submissionServer();
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out+'/recordings',size:{width:1440,height:900}}});
const started=Date.now();
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const timeline=[];
try {
  await page.goto(url,{waitUntil:'networkidle'});
  await page.locator('#result-payment').filter({hasText:'PAID'}).waitFor();
  assert.match(await page.locator('#revoke-balance').textContent(),/0 SOL moved/);
  const state=await (await page.request.get(url+'/api/status.json')).json();
  assert.equal(state.readOnly,true);
  assert.equal(await page.locator('#run').isHidden(),true);
  await page.addStyleTag({content:`.film-label{position:fixed;top:0;left:0;right:0;background:#182c35;color:#fff;padding:11px 25px;z-index:1000;font:14px 'Malgun Gothic',sans-serif;display:flex;justify-content:space-between}.film-caption{position:fixed;bottom:0;left:0;right:0;background:#182c35f5;color:#fff;padding:18px 28px;z-index:1000;min-height:110px;box-shadow:0 -8px 25px #0001}.film-caption strong{display:block;color:#c6e5d5;font-size:14px;letter-spacing:2px;margin-bottom:10px}.film-caption span{font-size:24px;line-height:1.5}.film-focus{outline:4px solid #587e9a;outline-offset:5px}html{scroll-behavior:smooth}`});
  await page.evaluate(()=>{
    const label=document.createElement('div');label.className='film-label';label.innerHTML='<span>ProofPass · Recorded evidence walkthrough</span><span>2026-09-21 저장 실행 · 새 거래 아님</span>';document.body.append(label);
    const caption=document.createElement('div');caption.className='film-caption';caption.innerHTML='<strong></strong><span></span>';document.body.append(caption);
  });
  for(let i=0;i<narration.length;i++) {
    const segment=narration[i];
    const selector=segment.target==='hero'?'.hero':segment.target;
    await page.evaluate(({selector,heading,caption})=>{
      document.querySelectorAll('.film-focus').forEach(e=>e.classList.remove('film-focus'));
      const target=document.querySelector(selector);target.classList.add('film-focus');
      document.querySelector('.film-caption strong').textContent=heading;
      document.querySelector('.film-caption span').textContent=caption;
      const top=target.getBoundingClientRect().top+scrollY-65;
      window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
    },{selector,heading:sections[i][0],caption:sections[i][1]});
    await page.waitForTimeout(850);
    const audioPath=out+'/audio/en-'+i+'.mp3';
    const seconds=duration(audioPath);
    const start=(Date.now()-started)/1000;
    timeline.push({id:segment.id,start,duration:seconds,caption:sections[i][1],text:segment.text});
    if(i===0) await page.screenshot({path:out+'/video-poster.png'});
    await page.screenshot({path:out+'/recordings/'+segment.id+'.png'});
    if(segment.id==='payment') await page.locator('#result-link').hover();
    else if(segment.id==='revoke') await page.locator('#revoke-outcome').hover();
    else await page.mouse.move(1390,70);
    console.log('Recording '+segment.id+' · '+seconds.toFixed(1)+' s');
    await page.waitForTimeout(seconds*1000+800);
  }
  assert.deepEqual(errors,[]);
} finally {
  const video=page.video(); await context.close();await video.saveAs(out+'/recorded-ui.webm');await video.delete();
  await browser.close();await new Promise(r=>server.close(r));
}
const rawDuration=duration(out+'/recorded-ui.webm');
assert(rawDuration<180,'Recording exceeds three minutes');
const inputs=['-i',out+'/recorded-ui.webm'];
for(let i=0;i<timeline.length;i++) inputs.push('-i',out+'/audio/en-'+i+'.mp3');
const filters=timeline.map((s,i)=>`[${i+1}:a]adelay=${Math.round(s.start*1000)}:all=1[a${i}]`);
filters.push(timeline.map((_,i)=>`[a${i}]`).join('')+`amix=inputs=${timeline.length}:duration=longest:normalize=0,apad[audio]`);
run([...inputs,'-filter_complex',filters.join(';'),'-map','0:v','-map','[audio]','-t',String(rawDuration),'-c:v','libx264','-preset','medium','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart',out+'/ProofPass-Demo.mp4']);
const finalDuration=duration(out+'/ProofPass-Demo.mp4');
const streams=JSON.parse(execFileSync(ffprobe,['-v','error','-show_streams','-of','json',out+'/ProofPass-Demo.mp4'],{encoding:'utf8',windowsHide:true})).streams;
assert(finalDuration<180);assert(streams.some(x=>x.codec_type==='audio'));assert(streams.some(x=>x.codec_name==='h264'));
const stamp=s=>{const ms=Math.round(s*1000);return String(Math.floor(ms/3600000)).padStart(2,'0')+':'+String(Math.floor(ms/60000)%60).padStart(2,'0')+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+String(ms%1000).padStart(3,'0')};
let vtt='WEBVTT\n\n';
for(const s of timeline){const sentences=s.text.match(/[^.!?]+[.!?]?/g).map(s=>s.trim()).filter(Boolean);const chars=sentences.reduce((n,s)=>n+s.length,0);let at=s.start;for(const sentence of sentences){const end=at+s.duration*sentence.length/chars;vtt+=`${stamp(at)} --> ${stamp(end)}\n${sentence}\n\n`;at=end;}}
await writeFile(out+'/captions-en.vtt',vtt.trimEnd()+'\n');
await writeFile(out+'/video-check.json',JSON.stringify({status:'passed',durationSeconds:finalDuration,width:1440,height:900,audio:'English male synthetic narration / Cillian / ElevenLabs via Higgsfield',historicalRun:'2026-09-21',newChainTransactions:false,readOnly:true,timeline,pageErrors:errors,bytes:(await stat(out+'/ProofPass-Demo.mp4')).size,checkedAt:new Date().toISOString()},null,2)+'\n');
for(const name of ['ProofPass-Demo.mp4','video-poster.png','captions-en.vtt'])await copyFile(out+'/'+name,'dist/submission/'+name);
console.log(JSON.stringify({status:'passed',durationSeconds:finalDuration,video:resolve(out+'/ProofPass-Demo.mp4')}));
