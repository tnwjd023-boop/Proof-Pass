import { spawn } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createDemoServer } from '../src/demo-server.mjs';
import { prepareJobBinding } from '../src/demo-binding.mjs';
import { loadJson } from '../src/xrpl/lifecycle.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
async function runJob({ resume, progress, job, persist }) {
  await mkdir(join(project, '.local/demo/logs'), { recursive: true });
  const log = await open(join(project, '.local/demo/logs', Date.now() + '.log'), 'ax', 0o600);
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
    const bindingName = await prepareJobBinding({ job, resume, persist,
      isReady: async name => (await loadJson(join(project, '.local/gate1', name, 'binding-ready.json')))?.status === 'passed',
      prepare: async name => {
        progress('identity');
        await execute(process.execPath, ['scripts/gate1/binding-demo.mjs'], { PROOFPASS_BINDING_NAME: name });
      } });
    progress(resume ? 'reconciliation' : 'xrpl-and-mandate');
    if (process.platform === 'win32') {
      const wslProject = '/mnt/' + project[0].toLowerCase() + project.slice(2).replaceAll('\\', '/').replace(/\/$/, '');
      await execute('wsl.exe', ['-d', 'Ubuntu', '--', 'bash', wslProject + '/scripts/gate1/run-live-midnight.sh', 'run', bindingName]);
    } else await execute('bash', [join(project, 'scripts/gate1/run-live-midnight.sh'), 'run', bindingName]);
  } finally { await log.close(); }
}
const server = await createDemoServer({ project, runJob });
server.listen(4173, '127.0.0.1', () => console.log('ProofPass demo: http://127.0.0.1:4173'));
