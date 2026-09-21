import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { runtime, project, loadPrivate, savePrivate, digest, fromHex, config, evidenceDirectory } from './live-runtime.mjs';

const { Connection, SystemProgram } = await import(pathToFileURL(project + '/node_modules/@solana/web3.js/lib/index.cjs.js')).then(m => m.default ?? m);
const solana = await import(pathToFileURL(project + '/scripts/gate1/solana-client.mjs'));
const codecModule = await import(pathToFileURL(project + '/node_modules/ripple-address-codec/dist/index.js'));
const codec = codecModule.default ?? codecModule;
const connection = new Connection('https://api.devnet.solana.com', 'finalized');
const genesis = await connection.getGenesisHash();
assert.equal(genesis, 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
let policy = await loadPrivate('policy');
if (!policy) {
  policy = { scope: new Uint8Array(randomBytes(32)), policyId: digest('PROOFPASS:AGENT_PAYMENT_AUTH:V1'), policyVersion: 1n,
    issuerPolicyId: digest('proofpass:test-issuer:age19:v1'), schemaVersion: 1n, xrplNetwork: 1n,
    xrplIssuer: new Uint8Array(codec.decodeAccountID('rQJjt1J4PuUzgAsCXuCKfRaynEeEJ1kMd')),
    credentialType: digest('PROOFPASS_ELIGIBLE_V1'), destinationCluster: fromHex(solana.hex(genesis)),
    programId: fromHex(solana.hex(solana.PROGRAM_ID)), assetId: new Uint8Array(32) };
  await savePrivate('policy', policy);
}
const rt = await runtime();
try {
  const saved = await loadPrivate('deployment');
  if (saved) await rt.join(); else await rt.deploy(policy);
  const deployment = await loadPrivate('deployment');
  const report = { status: 'deployed', mode: config.networkId + '-Midnight-live-adapter-policy',
    network: config.networkId, contractAddress: deployment.address, genesis: deployment.genesisHash,
    txId: deployment.receipt.txId, blockHeight: String(deployment.receipt.blockHeight),
    distinctRandomRoleKeys: true, fullGate1Complete: false, checkedAt: new Date().toISOString() };
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(evidenceDirectory + '/midnight-live-deployment.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await rt.close(); }
