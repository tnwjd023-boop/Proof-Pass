// Gate 0 only: fresh Testnet accounts, no production identity data.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Client, Wallet, convertStringToHex } from 'xrpl';
import { validateCredential, validatedReceipt, resumeAction, credentialLookup } from './xrpl-validation.mjs';

const root = new URL('../../', import.meta.url);
const privateDir = new URL('.local/xrpl-gate0/', root);
const evidencePath = new URL('evidence/gate0/xrpl-lifecycle.json', root);
const journalPath = new URL('journal.json', privateDir);
const keysPath = new URL('keys.json', privateDir);
const endpoint = 'wss://s.altnet.rippletest.net:51233';
const amendment = '1CB67D082CF7D9102412D34258CEDB400E659352D3B207348889297A6D90F5EF';
const amendmentIndex = '7DB0788C020F02780A673DC74757F23823FA3014C1866E72CC4CD8B226CD6EF4';
const credentialType = convertStringToHex('PROOFPASS_ELIGIBLE_V1');
const client = new Client(endpoint, { connectionTimeout: 15000, timeout: 15000, maxFeeXRP: '0.01' });
client.on('error', (code) => console.error(`XRPL connection: ${code}`));

async function load(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function save(path, value) {
  const temporary = new URL(`${path.pathname.split('/').at(-1)}.tmp`, path);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}
async function network() {
  const { result: { info } } = await client.request({ command: 'server_info' });
  assert.equal(info.network_id, 1, 'Refusing a network other than XRPL Testnet');
  assert.ok(Number.isFinite(info.validated_ledger?.age) && info.validated_ledger.age <= 30, 'Stale ledger');
  return info;
}
async function ledger(index = 'validated') {
  const { result } = await client.request({ command: 'ledger', ledger_index: index, transactions: false });
  assert.equal(result.validated, true, 'Ledger is not validated');
  return { index: Number(result.ledger_index), hash: result.ledger_hash, closeTime: result.ledger.close_time,
    closeTimeIso: new Date((result.ledger.close_time + 946684800) * 1000).toISOString() };
}
async function credential(binding, snapshot) {
  try {
    const { result } = await client.request({ command: 'ledger_entry', ledger_hash: snapshot.hash,
      credential: credentialLookup(binding) });
    assert.equal(result.validated, true);
    return result.node;
  } catch (error) {
    if (error.data?.error === 'entryNotFound' || error.data?.error === 'objectNotFound') return null;
    throw error;
  }
}
async function tx(hash) {
  try { return (await client.request({ command: 'tx', transaction: hash, binary: false })).result; }
  catch (error) { if (error.data?.error === 'txnNotFound') return null; throw error; }
}

async function main() {
  await client.connect();
  const info = await network();
  const preflightLedger = await ledger();
  const { result: amendments } = await client.request({ command: 'ledger_entry', index: amendmentIndex,
    ledger_hash: preflightLedger.hash });
  assert.equal(amendments.validated, true);
  assert.ok(amendments.node.Amendments.includes(amendment), 'Credentials amendment is disabled');
  console.log(`Testnet ${info.build_version}: Credentials enabled at ledger ${preflightLedger.index}`);
  if (!process.argv.includes('--execute')) return;

  let keys = await load(keysPath);
  if (!keys) {
    const issuer = Wallet.generate();
    const subject = Wallet.generate();
    keys = { issuer: issuer.seed, subject: subject.seed };
    await save(keysPath, keys); // Persist before requesting funds; never print seeds.
  }
  const wallets = { issuer: Wallet.fromSeed(keys.issuer), subject: Wallet.fromSeed(keys.subject) };
  const binding = { issuer: wallets.issuer.classicAddress, subject: wallets.subject.classicAddress, type: credentialType };
  assert.notEqual(binding.issuer, binding.subject);
  let journal = await load(journalPath);
  if (!journal) journal = { schemaVersion: 1, binding, steps: {} };
  assert.deepEqual(journal.binding, binding, 'Journal belongs to different wallets');
  const report = await load(evidencePath) ?? { schemaVersion: 1, kind: 'gate0-xrpl-lifecycle',
    network: 'XRPL Testnet', networkId: 1, endpoint, sdkVersion: '5.3.0',
    credentialType: 'PROOFPASS_ELIGIBLE_V1', binding, preflight: { ledger: preflightLedger, amendment, enabled: true },
    fundedAccounts: {}, stages: {}, status: 'incomplete' };
  assert.deepEqual(report.binding, binding);

  for (const [role, wallet] of Object.entries(wallets)) {
    try {
      const { result } = await client.request({ command: 'account_info', account: wallet.classicAddress, ledger_index: 'validated' });
      assert.equal(result.validated, true);
      report.fundedAccounts[role] = { address: wallet.classicAddress, balanceDrops: result.account_data.Balance };
    } catch (error) {
      if (error.data?.error !== 'actNotFound') throw error;
      console.log(`Funding new Testnet ${role}: ${wallet.classicAddress}`);
      await client.fundWallet(wallet);
      const { result } = await client.request({ command: 'account_info', account: wallet.classicAddress, ledger_index: 'validated' });
      assert.equal(result.validated, true);
      report.fundedAccounts[role] = { address: wallet.classicAddress, balanceDrops: result.account_data.Balance };
    }
    await save(evidencePath, report);
  }

  const steps = [
    ['created', wallets.issuer, { TransactionType: 'CredentialCreate', Account: binding.issuer, Subject: binding.subject, CredentialType: binding.type }],
    ['accepted', wallets.subject, { TransactionType: 'CredentialAccept', Account: binding.subject, Issuer: binding.issuer, CredentialType: binding.type }],
    ['deleted', wallets.issuer, { TransactionType: 'CredentialDelete', Account: binding.issuer, Subject: binding.subject, CredentialType: binding.type }],
  ];
  for (const [stage, wallet, transaction] of steps) {
    await network();
    if (!journal.steps[stage]) {
      const beforeLedger = await ledger();
      const before = await credential(binding, beforeLedger);
      validateCredential(before, binding, stage === 'created' ? 'deleted' : stage === 'accepted' ? 'created' : 'accepted');
      const prepared = await client.autofill(transaction);
      const signed = wallet.sign(prepared);
      journal.steps[stage] = { hash: signed.hash, blob: signed.tx_blob, lastLedgerSequence: prepared.LastLedgerSequence,
        preparedAt: new Date().toISOString(), beforeLedger };
      await save(journalPath, journal); // Durable transaction intent BEFORE any submit.
    }
    const intent = journal.steps[stage];
    let result = await tx(intent.hash);
    if (!result?.validated) {
      const action = resumeAction(result, (await ledger()).index, intent.lastLedgerSequence);
      assert.notEqual(action, 'expired-stop', `Expired unresolved ${stage} transaction ${intent.hash}; no replacement signed`);
      if (action === 'resubmit-same-blob') {
        console.log(`Submitting ${stage}: ${intent.hash}`);
        const submission = await client.submit(intent.blob);
        intent.submissionResult = submission.result.engine_result;
        await save(journalPath, journal);
        assert.ok(['tesSUCCESS', 'terQUEUED', 'tefALREADY', 'tefPAST_SEQ'].includes(intent.submissionResult),
          `Submission stopped: ${intent.submissionResult}`);
      }
      for (let attempt = 0; attempt < 30 && !result?.validated; attempt++) {
        await delay(2000);
        result = await tx(intent.hash);
      }
    }
    const receipt = validatedReceipt(result, intent.hash);
    const snapshot = await ledger(receipt.ledgerIndex);
    const node = await credential(binding, snapshot);
    validateCredential(node, binding, stage);
    report.stages[stage] = { ...receipt, ledger: snapshot, observedAt: new Date().toISOString(),
      credentialExists: node !== null, accepted: node ? Boolean(node.Flags & 65536) : null,
      credential: node, explorer: `https://testnet.xrpl.org/transactions/${receipt.hash}` };
    await save(evidencePath, report);
    console.log(`${stage}: validated tesSUCCESS, ledger ${snapshot.index}, exists=${node !== null}`);
  }
  const finalLedger = await ledger();
  validateCredential(await credential(binding, finalLedger), binding, 'deleted');
  report.status = 'passed';
  report.finalObservation = { ledger: finalLedger, credentialExists: false };
  report.completedAt = new Date().toISOString();
  await save(evidencePath, report);
  console.log('XRPL lifecycle passed. Evidence: evidence/gate0/xrpl-lifecycle.json');
}

await mkdir(privateDir, { recursive: true, mode: 0o700 });
await mkdir(new URL('evidence/gate0/', root), { recursive: true });
const lockPath = new URL('run.lock', privateDir);
const lock = await open(lockPath, 'wx', 0o600);
await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
try { await main(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await client.disconnect(); await lock.close(); await unlink(lockPath); }
