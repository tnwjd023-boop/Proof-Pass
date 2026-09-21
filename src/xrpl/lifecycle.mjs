import assert from 'node:assert/strict';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { credentialLookup, validatedReceipt, resumeAction } from '../../scripts/gate0/xrpl-validation.mjs';
export async function loadJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function saveJson(path, value) {
  await writeFile(path + '.tmp', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(path + '.tmp', path);
}
export async function recordObservation(journal, name, status, observe, path) {
  journal.observations ??= {};
  if (!journal.observations[name]) {
    const current = await observe();
    assert.equal(current.status, status, 'Required live stage not observed');
    journal.observations[name] = current;
    await saveJson(path, journal);
  }
  assert.equal(journal.observations[name].status, status);
  return journal.observations[name];
}
export async function republishCompletedReport(journal, privatePath, publicPath) {
  assert.equal(journal.completed, true);
  const report = await loadJson(privatePath);
  assert.equal(report?.status, 'passed', 'Completed report missing');
  await saveJson(publicPath, report);
}
export async function cleanupExpired(observe, remove) {
  const before = await observe();
  if (before.status !== 'absent') {
    assert.equal(before.status, 'expired', 'Cleanup only permits expired credentials');
    await remove();
    assert.equal((await observe()).status, 'absent', 'Cleanup not confirmed');
  }
  return { status: 'absent', lifecyclePassed: false };
}
export async function snapshot(client) {
  const { result: { info } } = await client.request({ command: 'server_info' });
  assert.equal(info.network_id, 1, 'Testnet required');
  assert.ok(Number.isFinite(info.validated_ledger?.age) && info.validated_ledger.age <= 30, 'Stale server');
  const { result } = await client.request({ command: 'ledger', ledger_index: 'validated', transactions: false });
  assert.equal(result.validated, true);
  const ledger = { index: Number(result.ledger_index), hash: result.ledger_hash.toLowerCase(), closeTime: result.ledger.close_time + 946684800 };
  const now = Math.floor(Date.now() / 1000);
  assert.ok(Number.isSafeInteger(ledger.index) && now - ledger.closeTime <= 30 && ledger.closeTime <= now + 5);
  return ledger;
}
export async function lookupCredential(client, binding, ledger) {
  try {
    const { result } = await client.request({ command: 'ledger_entry', ledger_hash: ledger.hash.toUpperCase(), credential: credentialLookup(binding) });
    assert.equal(result.validated, true);
    assert.equal(result.ledger_hash.toLowerCase(), ledger.hash);
    return result.node;
  } catch (error) {
    if (['entryNotFound', 'objectNotFound'].includes(error.data?.error)) return null;
    throw error;
  }
}
async function findTransaction(client, hash) {
  try { return (await client.request({ command: 'tx', transaction: hash, binary: false })).result; }
  catch (error) { if (error.data?.error === 'txnNotFound') return null; throw error; }
}
export async function submitStage(client, wallet, transaction, name, journal, path, beforeNew) {
  if (!journal.steps[name]) {
    await beforeNew();
    const prepared = await client.autofill(transaction);
    const signed = wallet.sign(prepared);
    journal.steps[name] = { hash: signed.hash, blob: signed.tx_blob, lastLedgerSequence: prepared.LastLedgerSequence, transaction };
    await saveJson(path, journal);
  }
  const intent = journal.steps[name];
  assert.deepEqual(intent.transaction, transaction, 'Changed durable transaction request');
  let result = await findTransaction(client, intent.hash);
  if (!result?.validated) {
    const action = resumeAction(result, (await snapshot(client)).index, intent.lastLedgerSequence);
    assert.notEqual(action, 'expired-stop', 'Expired unresolved intent; manual reconciliation required');
    if (action === 'resubmit-same-blob') {
      const { result: sent } = await client.submit(intent.blob);
      assert.ok(['tesSUCCESS','terQUEUED','tefALREADY','tefPAST_SEQ'].includes(sent.engine_result), 'Submission rejected');
    }
    for (let n = 0; n < 30 && !result?.validated; n++) { await delay(2000); result = await findTransaction(client, intent.hash); }
  }
  const receipt = validatedReceipt(result, intent.hash);
  return { ...receipt, explorer: `https://testnet.xrpl.org/transactions/${intent.hash}` };
}
