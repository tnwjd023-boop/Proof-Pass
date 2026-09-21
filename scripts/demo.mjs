import { spawn } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createDemoServer } from '../src/demo-server.mjs';
import { runBoundJob } from '../src/demo-binding.mjs';
import { loadJson } from '../src/xrpl/lifecycle.mjs';
import { networkProfile } from '../src/midnight/network.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const profile = networkProfile(process.env.PROOFPASS_MIDNIGHT_NETWORK ?? 'undeployed');
const logDirectory = join(project, profile.networkId === 'undeployed' ? '.local/demo/logs' : '.local/demo-preprod/logs');
const runner = profile.networkId === 'undeployed' ? 'run-live-midnight.sh' : 'run-preprod-midnight.sh';
async function runJob({ resume, progress, job, persist }) {
  await mkdir(logDirectory, { recursive: true });
  const log = await open(join(logDirectory, Date.now() + '.log'), 'ax', 0o600);
  const execute = (command, args, environment = {}) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: project, env: { ...process.env, ...environment }, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const output = bytes => {
      log.write(bytes).catch(() => {});
      const text = bytes.toString();
      if (text.includes('Proving live policy request: payment')) progress('midnight-payment');
      if (text.includes('Live 0.05 SOL payment')) progress('payment-confirmed');
      if (text.includes('pending-mandate')) progress('mandate-revocation');
      if (text.includes('pending-source')) progress('source-revocation');
    };
    child.stdout.on('data', output); child.stderr.on('data', output);
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(Error('Fixed demo command failed')));
  });
  try {
    await runBoundJob({ job, resume, persist, network: profile.networkId,
      isReady: async name => (await loadJson(join(project, '.local/gate1', name, 'binding-ready.json')))?.status === 'passed',
      prepare: async name => {
        progress('identity');
        await execute(process.execPath, ['scripts/gate1/binding-demo.mjs'], { PROOFPASS_BINDING_NAME: name });
      }, execute: async (bindingName, fresh) => {
        progress(resume ? 'reconciliation' : fresh ? 'wallet-warmup' : 'xrpl-and-mandate');
        const mode = fresh ? 'run-fresh' : 'run';
        if (process.platform === 'win32') {
          const wslProject = '/mnt/' + project[0].toLowerCase() + project.slice(2).replaceAll('\\', '/').replace(/\/$/, '');
          await execute('wsl.exe', ['-d', 'Ubuntu', '--', 'bash', wslProject + '/scripts/gate1/' + runner, mode, bindingName]);
        } else await execute('bash', [join(project, 'scripts/gate1', runner), mode, bindingName]);
      } });
  } finally { await log.close(); }
}
const server = await createDemoServer({ project, runJob, network: profile.networkId });
const port = profile.networkId === 'undeployed' ? 4173 : 4174;
server.listen(port, '127.0.0.1', () => console.log('ProofPass ' + profile.networkId + ' demo: http://127.0.0.1:' + port));
