import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { bindingNonce } from '../protocol.mjs';
const execute = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
function privatePath(path) {
  const absolute = resolve(path);
  assert.ok(absolute.startsWith(resolve(root, '.local') + sep), 'Private artifact path required');
  return absolute;
}
function linuxPath(path) {
  return process.platform === 'win32' ? '/mnt/' + path[0].toLowerCase() + path.slice(2).replaceAll('\\', '/') : path;
}
async function run(args) {
  const script = linuxPath(resolve(root, 'scripts/gate1/opendid-binding.sh'));
  const command = process.platform === 'win32' ? 'wsl.exe' : 'bash';
  const commandArgs = process.platform === 'win32' ? ['-d', 'Ubuntu', '--', 'bash', script, ...args] : [script, ...args];
  try {
    const { stdout } = await execute(command, commandArgs, { windowsHide: true, timeout: 90_000, maxBuffer: 1_000_000 });
    return JSON.parse(stdout.trim());
  } catch { throw new Error('OpenDID verification or fixture operation rejected'); }
}
// Only test/demo tooling calls issuance. Verification uses an operator-owned registry.
export async function issueFixture(session, directory) {
  return run(['issue', bindingNonce(session), linuxPath(privatePath(directory)), session.issuerPolicyId]);
}
export function createOpenDidVerifier(registryPath) {
  const registry = privatePath(registryPath);
  return async (session, proofPath) => {
    const trusted = JSON.parse(await readFile(registry, 'utf8'));
    assert.equal(trusted.issuerPolicyId, session.issuerPolicyId, 'OpenDID issuer policy mismatch');
    return run(['verify', bindingNonce(session), linuxPath(registry), linuxPath(privatePath(proofPath))]);
  };
}
