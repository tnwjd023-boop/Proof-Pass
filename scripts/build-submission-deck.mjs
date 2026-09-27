import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { slides } from './submission-content.mjs';
import { submissionServer } from './submission-server.mjs';
const require = createRequire(import.meta.url);
const PptxGenJS = require('../.local/submission-tools/node_modules/pptxgenjs');
const out = 'artifacts/submission';
await mkdir(out + '/slides', { recursive: true });
await mkdir('dist/submission/media', { recursive: true });
await copyFile('.local/submission-tools/NotoSansKR.ttf','dist/submission/media/NotoSansKR.ttf');
const { server, url } = await submissionServer();
const browser = await chromium.launch({ channel:'msedge', headless:true });
const colors = { ink:'142E28', sub:'62736D', green:'174B3C', mint:'E8F2EC', red:'A1432C', blush:'FAEEE8', line:'DCE5DF', bg:'F7F9F7', blue:'EEF1F8' };
const rgb=hex=>({red:parseInt(hex.slice(0,2),16)/255,green:parseInt(hex.slice(2,4),16)/255,blue:parseInt(hex.slice(4,6),16)/255});
const native=[];
const imagePositions=[];
const evidence = JSON.parse(await readFile('evidence/preprod/live-flow.json','utf8'));
const repo = 'https://github.com/tnwjd023-boop/Proof-Pass';
const evidenceUrl = repo + '/blob/main/evidence/preprod/live-flow.json';
const payUrl = 'https://explorer.solana.com/tx/' + evidence.payment.signature + '?cluster=devnet';
const denial = evidence.rejectedPayments.find(x=>x.name==='source-deleted');
const denyUrl = 'https://explorer.solana.com/tx/' + denial.signature + '?cluster=devnet';
const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
try {
  const page = await browser.newPage({ viewport:{width:1440,height:1000} });
  await page.goto(url, { waitUntil:'networkidle' });
  await page.locator('#result-payment').filter({hasText:'PAID'}).waitFor();
  assert.match(await page.locator('#revoke-outcome').textContent(), /REJECTED/);
  const pictures = {};
  for (const [name, selector] of [['policy','.policy-scene'],['payment','.scene.request'],['revocation','.revoke-scene'],['enforcement','.enforcement']]) {
    const box = await page.locator(selector).boundingBox();
    const path = out + '/slides/' + name + '.png';
    await page.locator(selector).screenshot({ path });
    await copyFile(path, 'dist/submission/media/' + name + '.png');
    pictures[name] = { path:resolve(path), width:box.width, height:box.height };
  }
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'ProofPass'; pptx.subject = 'Private authorization with execution-time revocation';
  pptx.title = 'ProofPass — Project Deck'; pptx.company = 'ProofPass'; pptx.lang = 'ko-KR';
  pptx.theme = { headFontFace:'Noto Sans KR', bodyFontFace:'Noto Sans KR', lang:'ko-KR' };
  let htmlSlides = [];
  for (let index=0; index<slides.length; index++) {
    const spec = slides[index]; const slide = pptx.addSlide();
    const dark=spec.kind==='cover'; const background=dark?'112F27':colors.bg;
    slide.background = {color:background};
    const requests=[{updatePageProperties:{objectId:'p'+(index+1),pageProperties:{pageBackgroundFill:{solidFill:{color:{rgbColor:rgb(background)},alpha:1}}},fields:'pageBackgroundFill'}}];
    const nodes=[];
    let serial=0;
    const create=(type,x,y,w,h)=>{const id=`pp_v2_s${index+1}_${++serial}`;requests.push({createShape:{objectId:id,shapeType:type,elementProperties:{pageObjectId:'p'+(index+1),size:{width:{magnitude:w*.75,unit:'PT'},height:{magnitude:h*.75,unit:'PT'}},transform:{scaleX:1,scaleY:1,translateX:x*.75,translateY:y*.75,unit:'PT'}}}});return id;};
    function rect(x,y,w,h,fill=colors.mint,line=fill) {
      slide.addShape(pptx.ShapeType.rect,{x:x/96,y:y/96,w:w/96,h:h/96,fill:{color:fill},line:{color:line,width:.8}});
      const id=create('RECTANGLE',x,y,w,h);requests.push({updateShapeProperties:{objectId:id,shapeProperties:{shapeBackgroundFill:{solidFill:{color:{rgbColor:rgb(fill)},alpha:1}},outline:{propertyState:'NOT_RENDERED'}},fields:'shapeBackgroundFill,outline'}});
      nodes.push(`<div style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:#${fill};border:1px solid #${line}"></div>`);
    }
    function text(value,x,y,w,h,size=25,color=colors.ink,bold=false,link=null) {
      slide.addText(value,{x:x/96,y:y/96,w:w/96,h:h/96,fontFace:'Noto Sans KR',fontSize:size*.75,color,bold,margin:0,breakLine:false,paraSpaceAfterPt:6,valign:'top',...(link?{hyperlink:{url:link}}:{})});
      const id=create('TEXT_BOX',x-4,y-3,w+8,h+6);
      requests.push({insertText:{objectId:id,text:value}},{updateTextStyle:{objectId:id,textRange:{type:'ALL'},style:{fontFamily:'Noto Sans KR',fontSize:{magnitude:size*.75,unit:'PT'},bold,foregroundColor:{opaqueColor:{rgbColor:rgb(color)}},...(link?{link:{url:link}}:{})},fields:'fontFamily,fontSize,bold,foregroundColor'+(link?',link':'')}},{updateParagraphStyle:{objectId:id,textRange:{type:'ALL'},style:{spaceAbove:{magnitude:0,unit:'PT'},spaceBelow:{magnitude:0,unit:'PT'},lineSpacing:110},fields:'spaceAbove,spaceBelow,lineSpacing'}});
      const content=esc(value).replaceAll('\n','<br>');
      nodes.push(`<div class="text" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;font-size:${size}px;color:#${color};font-weight:${bold?700:400}">${link?`<a href="${esc(link)}">${content}</a>`:content}</div>`);
    }
    function picture(name,x,y,w,h) {
      const p=pictures[name]; const scale=Math.min(w/p.width,h/p.height); const iw=p.width*scale,ih=p.height*scale;
      slide.addImage({path:p.path,x:(x+(w-iw)/2)/96,y:y/96,w:iw/96,h:ih/96});
      imagePositions.push({page:'p'+(index+1),name,x:x+(w-iw)/2,y,w:iw,h:ih});
      nodes.push(`<img alt="Actual recorded ${name} UI" src="./media/${name}.png" style="left:${x+(w-iw)/2}px;top:${y}px;width:${iw}px;height:${ih}px">`);
    }
    rect(56,35,28,4,dark?'BEE6C7':colors.green);
    text(spec.kicker,100,25,980,30,13,dark?'BEE6C7':colors.green,true);
    text('ProofPass',1100,23,130,35,18,dark?'FFFFFF':colors.green,true);
    text(spec.title,56,91,1170,spec.title.includes('\n')?(dark?160:140):75,dark?55:44,dark?'FFFFFF':colors.ink,true);
    const subY=spec.title.includes('\n')?225:169;
    text(spec.subtitle,56,dark?255:subY,1170,50,22,dark?'B9D5C8':colors.sub);
    rect(56,665,1168,1,dark?'345449':colors.line);
    text('Stored testnet run 2026-09-21  ·  Hackathon reference implementation',56,682,1060,23,12,dark?'B9D5C8':colors.sub);
    text(String(index+1).padStart(2,'0')+' / 07',1140,682,90,23,12,dark?'B9D5C8':colors.sub,true);
    if(spec.kind==='cover') {
      text('권한은 회수됐는데, 이미 발급한 승인은 계속 돈을 쓸 수 있을까요?',56,321,1168,50,25,'FFFFFF',false);
      rect(56,391,556,205,'214E3E'); rect(636,391,588,205,'F4EAE2');
      text('01  /  VALID REQUEST',80,411,510,28,14,'B9D5C8',true);
      text('0.05 SOL',80,449,510,75,54,'FFFFFF',true);
      text('50,000,000 lamports · Solana Devnet',80,542,510,27,18,'D3E4DB');
      text('02  /  AUTHORITY REVOKED',660,411,535,28,14,colors.red,true);
      text('REJECTED',660,449,520,75,54,colors.red,true);
      text('0 SOL moved · after destination state update',660,542,535,27,18,colors.red);
      text('PRIVATE POLICY  →  AUTHORIZATION  →  PAYMENT  →  REVOCATION',56,619,1168,28,16,'B9D5C8',true);
    } else if(spec.kind==='policy') {
      rect(56,308,510,298,'FFFFFF',colors.line); rect(590,308,634,298,colors.blue);
      text('PRIVATE INPUTS',80,330,462,28,17,colors.sub,true);
      text('Identity details           HIDDEN\nFull mandate             HIDDEN\nPer-transaction limit   HIDDEN',80,380,462,155,26,colors.ink,true);
      text('로컬 어댑터·prover는 원문을 처리합니다.',80,554,462,32,17,colors.sub);
      text('PUBLIC REQUEST / PRIVATE COMPARISON',614,330,586,28,17,colors.sub,true);
      text('0.05 SOL ≤ [HIDDEN]',614,381,586,65,39,colors.green,true);
      text('✓ AUTHORIZATION CREATED',614,453,586,44,26,colors.green,true);
      text('0.15 SOL → 승인 생성 거절',614,518,586,40,28,colors.red,true);
      text('체인 미제출 · 온체인 실패 proof 없음',614,564,586,26,17,colors.sub);
      text('설명용 데모 한도: 0.10 SOL. 한도 원문은 목적지에 전달되지 않습니다. 거래 금액·주소와 XRPL 자격 자체는 공개입니다.',56,619,1168,38,17,colors.sub);
    } else if(spec.kind==='architecture') {
      const cards=[['OpenDID SDK','신원 proof 검증','합성 테스트 발급자'],['XRPL Testnet','자격 create / accept / delete','trusted observer'],['Midnight Preprod','비공개 정책 증명','요청 commitment에 승인 결합'],['Solana Devnet','실행 시 상태 재검사','요청 hash · 만료 · 미소비']];
      cards.forEach((c,i)=>{const x=56+i*298;rect(x,260,274,240,'FFFFFF',colors.line);text(String(i+1).padStart(2,'0'),x+22,281,230,35,20,colors.sub);text(c[0],x+22,334,230,42,25,colors.green,true);text(c[1],x+22,396,230,54,20,colors.ink);text(c[2],x+22,457,230,32,15,colors.sub);});
      rect(56,533,1168,99,colors.green);
      text('Trusted adapters / time → Midnight → trusted relay → Solana',80,552,1120,34,26,'FFFFFF',true);
      text('Solana는 Midnight proof나 XRPL 합의를 직접 검증하지 않습니다.',80,597,1120,27,19,'D3E4DB');
    } else if(spec.kind==='payment') {
      text('FINALIZED PAYMENT',56,252,710,35,16,colors.green,true);
      text('0.05',49,294,540,156,114,colors.green,true);
      text('SOL',434,370,280,68,48,colors.green,true);
      text('50,000,000 lamports moved',56,456,700,45,29,colors.ink,true);
      rect(56,525,338,61,colors.mint);rect(410,525,366,61,colors.mint);
      text('Vault  −50,000,000',72,542,310,33,21,colors.green,true);
      text('Recipient  +50,000,000',426,542,340,33,21,colors.green,true);
      picture('payment',827,229,350,412);
      text('실제 지급 거래 확인 ↗',56,609,550,31,20,colors.green,true,payUrl);
    } else if(spec.kind==='revocation') {
      text('2026-09-21 UTC · 우측 실제 UI는 KST 표시',56,211,740,27,16,colors.sub);
      const steps=[['09:03:47.202','미사용 승인 Midnight 확정'],['09:03:59.806','XRPL Credential 삭제 확정'],['09:04:01.954','Solana source 상태 무효화'],['09:04:01.955','기존 승인 실행 시도 → REJECTED']];
      steps.forEach((v,i)=>{const y=243+i*68;if(i===3)rect(56,y,740,57,colors.blush);else rect(56,y+57,740,1,colors.line);text(v[0],73,y+13,190,30,19,i===3?colors.red:colors.sub,true);text(v[1],280,y+12,496,32,22,i===3?colors.red:colors.ink,true);});
      text('만료까지 7.045초 남음',56,541,740,46,34,colors.red,true);
      text('0 SOL moved · Source 6003',56,592,740,42,28,colors.red,true,denyUrl);
      picture('revocation',835,222,343,419);
    } else if(spec.kind==='evidence') {
      const rows=[['0.05 SOL valid request','PAID','50,000,000 lamports'],['Same authorization reused','REJECTED','Consumed 6007 · 지급 0'],['Mandate revoked → old approval','REJECTED','Mandate 6001 · 지급 0'],['Credential deleted → old approval','REJECTED','Source 6003 · 지급 0']];
      rows.forEach((r,i)=>{const y=247+i*76;rect(56,y,1168,64,i===0?colors.mint:'FFFFFF',colors.line);text(r[0],76,y+18,545,31,23,colors.ink,true);text(r[1],644,y+18,190,31,23,i===0?colors.green:colors.red,true);text(r[2],870,y+19,330,31,20,colors.sub);});
      text('추가 검증: 0.15 SOL → 승인 생성 거절 / 세 실패 시도 모두 승인 만료 전',56,574,1168,32,21,colors.sub);
      text('원본 영수증 · 잔액 · 오류 코드 · 실행 시간 확인 ↗',56,620,1168,30,19,colors.green,true,evidenceUrl);
    } else {
      rect(56,245,566,347,'FFFFFF',colors.line);rect(648,245,576,347,colors.green);
      text('CURRENT BOUNDARIES',80,268,518,35,18,colors.green,true);
      text('Trusted relay / observer / adapters / time\n취소 반영 지연 · 최대 60초 lease\n해당 vault/program 지급 경로만 통제\n금액·주소·시각 공개 · 익명 시스템 아님\n현재 Agent = authorized signer',80,329,518,243,23,colors.ink);
      text('ROADMAP / NOT IMPLEMENTED',672,268,528,35,16,'B9D5C8',true);
      text('Organization → Officer\n→ AI Agent → External service',672,334,528,92,26,'FFFFFF',true);
      text('담당자의 권한이 회수되면,\n그 담당자가 위임한 Agent도\n회사 자금 사용을 멈춰야 할까요?',672,451,528,115,24,'D3E4DB');
      text('The boundary of a company is extending to AI Agents.',56,616,1168,34,24,colors.green,true);
    }
    slide.addNotes(spec.notes + '\n\nSources: ' + evidenceUrl + '\n' + repo);
    native.push({page:'p'+(index+1),requests});
    htmlSlides.push(`<section class="slide" style="background:#${background}" id="slide-${index+1}" aria-label="Slide ${index+1}">${nodes.join('')}</section>`);
  }
  await pptx.writeFile({fileName:out+'/ProofPass-Project-Deck.pptx'});
  await copyFile(out+'/ProofPass-Project-Deck.pptx','dist/submission/ProofPass-Project-Deck.pptx');
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ProofPass — Project Deck</title><style>@font-face{font-family:'Noto Sans KR';src:url('./media/NotoSansKR.ttf') format('truetype');font-weight:100 900;font-display:swap}*{box-sizing:border-box}body{margin:0;background:#dce4e6;font-family:'Noto Sans KR',sans-serif}.toolbar{padding:18px;text-align:center;position:sticky;top:0;background:#fff;z-index:2}.toolbar a{color:#203e33;margin:0 15px}.slide{position:relative;width:1280px;height:720px;background:#${colors.bg};margin:24px auto;overflow:hidden}.slide>*{position:absolute}.text{line-height:1.35;letter-spacing:-.025em;overflow-wrap:break-word}.text a{color:inherit;text-decoration:underline;text-underline-offset:4px}.slide img{object-fit:contain}@media(max-width:1300px){.slide{zoom:calc((100vw - 24px)/1280px)}}@media print{.toolbar{display:none}.slide{margin:0;break-after:page;zoom:1}@page{size:13.333in 7.5in;margin:0}}</style></head><body><nav class="toolbar"><a href="./">Demo</a><a href="./watch.html">Video</a><a href="./ProofPass-Project-Deck.pptx">Download editable PPTX</a></nav>${htmlSlides.join('')}</body></html>`;
  await writeFile('dist/submission/deck.html',html);
  await page.setViewportSize({width:1400,height:900});
  await page.goto(url+'/deck.html',{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  for(let i=1;i<=7;i++) await page.locator('#slide-'+i).screenshot({path:out+'/slides/slide-'+i+'.png'});
  await page.pdf({path:out+'/ProofPass-Project-Deck.pdf',printBackground:true,preferCSSPageSize:true});
  await copyFile(out+'/ProofPass-Project-Deck.pdf','dist/submission/ProofPass-Project-Deck.pdf');
  const overflow=await page.locator('.text').evaluateAll(nodes=>nodes.filter(n=>n.scrollHeight>n.clientHeight+3).map(n=>n.textContent));
  assert.deepEqual(overflow, [],'Slide text overflow');
  await writeFile(out+'/deck-check.json',JSON.stringify({slides:7,editablePptx:true,nativeNarrativeText:true,notes:true,sourceLinks:true,overflow,checkedAt:new Date().toISOString()},null,2)+'\n');
  await writeFile(out+'/native-deck-update.json',JSON.stringify({native,imagePositions}));
  console.log(JSON.stringify({status:'passed',slides:7,pptx:out+'/ProofPass-Project-Deck.pptx'}));
} finally { await browser.close(); await new Promise(r=>server.close(r)); }
