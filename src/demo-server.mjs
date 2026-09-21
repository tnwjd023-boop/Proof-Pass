import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { loadJson, saveJson } from './xrpl/lifecycle.mjs';
import { networkProfile } from './midnight/network.mjs';

export async function createDemoServer({ project, runJob, readOnly = false, network = 'undeployed' }) {
  const profile = networkProfile(network);
  const token = randomBytes(32).toString('hex');
  const directory = join(project, network === 'undeployed' ? '.local/demo' : '.local/demo-preprod');
  if (!readOnly) await mkdir(directory, { recursive: true });
  const jobPath = join(directory, 'job.json');
  const lockPath = join(directory, 'run.lock');
  let job = await loadJson(jobPath) ?? { status: 'idle', stage: 'ready' };
  if (!readOnly && job.status === 'running' && !await loadJson(lockPath)) {
    job = { ...job, status: 'interrupted', stage: 'resume-required' };
    await saveJson(jobPath, job);
  }
  let busy = false;
  let activeJob = Promise.resolve();
  const assets = new Map([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']]]);
  const server = createServer(async (req, res) => {
    const send = (status, data, type = 'application/json') => {
      res.writeHead(status, { 'content-type': type + '; charset=utf-8', 'cache-control': 'no-store',
        'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
      res.end(type === 'application/json' ? JSON.stringify(data) : data);
    };
    try {
      const port = server.address().port;
      if (!['127.0.0.1:' + port, 'localhost:' + port].includes(req.headers.host)) return send(403, { error: 'Invalid host' });
      const route = new URL(req.url, 'http://' + req.headers.host).pathname;
      if (req.method === 'GET' && route === '/api/status') {
        const evidence = await loadJson(join(project, profile.evidenceDirectory, 'live-flow.json'));
        const externalBusy = !!await loadJson(join(project, '.local/gate1/credential-demo.lock')) || (!busy && !!await loadJson(lockPath));
        const latest = await loadJson(join(project, '.local/gate1/latest-binding.json'));
        const base = latest?.directory?.replaceAll('\\', '/').split('/').at(-1);
        let operatorPolicy = null;
        if (/^binding-[a-f0-9]{16}$/.test(base)) {
          const view = await loadJson(join(project, '.local/gate1', base, profile.intentDirectory, 'operator-view.json'));
          if (/^[0-9]{1,20}$/.test(view?.maxPerTxLamports)) operatorPolicy = { maxPerTxLamports: view.maxPerTxLamports };
        }
        const publicJob = Object.fromEntries(['status', 'stage', 'startedAt', 'completedAt'].filter(k => job[k] !== undefined).map(k => [k, job[k]]));
        return send(200, { token, job: publicJob, readOnly, network, evidence, operatorPolicy, externalBusy, now: new Date().toISOString(),
          observation: { kind: 'historical', currentStatus: 'unknown', last: evidence?.lastSourceObservation ?? null } });
      }
      if (req.method === 'GET' && assets.has(route)) {
        const [file, type] = assets.get(route);
        return send(200, await readFile(join(project, 'web', file)), type);
      }
      if (req.method !== 'POST' || !['/api/run', '/api/resume'].includes(route)) return send(404, { error: 'Not found' });
      if (readOnly) return send(403, { error: 'Read-only evidence view' });
      if (req.headers.origin !== 'http://' + req.headers.host || req.headers['x-proofpass-token'] !== token
        || req.headers['content-type'] !== 'application/json') return send(403, { error: 'Invalid action origin or token' });
      if (route === '/api/resume' && job.status === 'idle') return send(409, { error: 'No dashboard job to resume' });
      if (busy || (route === '/api/run' && ['failed', 'interrupted'].includes(job.status))) return send(409, { error: 'Reconcile the previous run first' });
      if (await loadJson(join(project, '.local/gate1/credential-demo.lock'))) return send(409, { error: 'External flow holds the project lock' });
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 1024) return send(413, { error: 'Body too large' }); }
      if (body !== '{}') return send(400, { error: 'This action accepts no parameters' });
      // Set synchronously before any persistence await to exclude overlapping POSTs.
      if (busy) return send(409, { error: 'Already running' });
      busy = true;
      let lock;
      try { lock = await open(lockPath, 'wx', 0o600); await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })); }
      catch (error) { busy = false; if (error.code === 'EEXIST') return send(409, { error: 'Another operator job holds the lock' }); throw error; }
      const release = async () => { try { await lock.close(); await unlink(lockPath); } catch {} finally { busy = false; } };
      const resume = route === '/api/resume';
      job = { ...(resume ? job : {}), status: 'running', stage: resume ? 'reconciliation' : 'identity', startedAt: resume ? job.startedAt ?? new Date().toISOString() : new Date().toISOString() };
      try { await saveJson(jobPath, job); }
      catch {
        job = { ...job, status: 'failed', stage: 'resume-required' };
        await release();
        return send(500, { error: 'Journal unavailable; no job started' });
      }
      activeJob = (async () => {
        try {
          await runJob({ resume, job, persist: () => saveJson(jobPath, job), progress: stage => { job.stage = stage; } });
          job = { ...job, status: 'passed', stage: 'complete', completedAt: new Date().toISOString() };
        } catch {
          job = { ...job, status: 'failed', stage: 'resume-required', completedAt: new Date().toISOString() };
        } finally {
          try { await saveJson(jobPath, job); }
          catch { job = { ...job, status: 'failed', stage: 'resume-required' }; }
          await release();
        }
      })();
      return send(202, { status: 'running' });
    } catch { return send(500, { error: 'Local service unavailable; evidence is not a current credential check' }); }
  });
  server.waitForJob = () => activeJob;
  return server;
}
