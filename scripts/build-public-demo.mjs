import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

// Publish only an explicit allowlist. No server, wallet, operator view or token.
const output = resolve(process.argv[2] || 'dist/submission');
await mkdir(join(output, 'api'), { recursive: true });
await mkdir(join(output, 'evidence'), { recursive: true });
const evidence = JSON.parse(await readFile('evidence/preprod/live-flow.json', 'utf8'));
assert.equal(evidence.status, 'passed');
assert.equal(evidence.midnightNetwork, 'preprod');
const state = { network: 'preprod', readOnly: true, externalBusy: false,
  job: { status: 'passed', stage: 'complete', completedAt: evidence.completedAt },
  evidence, operatorPolicy: null, observation: { kind: 'historical', currentStatus: 'unknown' } };
await writeFile(join(output, 'api/status.json'), JSON.stringify(state, null, 2) + '\n');
let html = await readFile('web/index.html', 'utf8');
html = html.replace('href="/style.css"', 'href="./style.css"').replace('src="/app.js"', 'src="./app.js"').replace('href="/"', 'href="./"');
html = html.replace('Local operator demo', 'PUBLIC EVIDENCE DEMO');
html = html.replace('<main>', `<nav class="submission-nav" aria-label="Submission resources"><a href="./watch.html">Watch the demo ↗</a><a href="./deck.html">Project deck ↗</a><a href="./evidence/live-flow.json">Original evidence ↗</a><a href="https://github.com/tnwjd023-boop/Proof-Pass">GitHub ↗</a></nav><main>`);
html = html.replace(/<details class="operator-details">[\s\S]*?<\/details>/, '<p class="operator-details" id="operator-policy" hidden></p>');
html = html.replace('<button class="secondary" id="resume" disabled>', '<button class="secondary" id="resume" disabled hidden>').replace('<button id="run" disabled>', '<button id="run" disabled hidden>');
await writeFile(join(output, 'index.html'), html);
let app = await readFile('web/app.js', 'utf8');
app = app.replace("fetch('/api/status')", "fetch('./api/status.json')");
const actionStart = app.indexOf('async function action(path)');
assert(actionStart > 0);
app = app.slice(0, actionStart) + 'refresh();\n';
await writeFile(join(output, 'app.js'), app);
const css = await readFile('web/style.css', 'utf8');
await writeFile(join(output, 'style.css'), css + '\n.submission-nav{display:flex;justify-content:center;flex-wrap:wrap;gap:24px;padding:16px 5%;background:#fff;border-bottom:1px solid #dce3e6}.submission-nav a{font-size:12px;color:#254e69;text-underline-offset:4px}[hidden]{display:none!important}\n');
await copyFile('evidence/preprod/live-flow.json', join(output, 'evidence/live-flow.json'));
await copyFile('evidence/preprod/dashboard-run.json', join(output, 'evidence/dashboard-run.json'));
await writeFile(join(output, '.nojekyll'), '');
console.log(JSON.stringify({ output, mode: 'historical read-only evidence', chainRun: evidence.completedAt }));
