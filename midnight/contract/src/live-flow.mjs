import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runtime, project, loadPrivate, savePrivate, fromHex, digest, config, evidenceDirectory } from './live-runtime.mjs';
import { pureCircuits as p, ledger } from './managed/policy/contract/index.js';
import { sign } from './signing.mjs';

const { services, solana, now, hex } = await import(pathToFileURL(project + '/scripts/gate1/live-services.mjs'));
const { fromCompactPayment, mapConfirmedAuthorization } = await import(pathToFileURL(project + '/src/midnight/request.mjs'));
const { validateRegisteredMandate } = await import(pathToFileURL(project + '/src/midnight/mandate-adapter.mjs'));
const { validateSourceIdentity } = await import(pathToFileURL(project + '/src/midnight/source-adapter.mjs'));
const { checkpoint, verifyPaymentReceipt } = await import(pathToFileURL(project + '/src/flow-recovery.mjs'));
const rt = await runtime();
let service;
let stage = 'binding';
const startedAt = new Date().toISOString();
try {
  if (process.env.PROOFPASS_CREATE_BINDING === '1') {
    assert.equal(config.networkId, 'preprod');
    assert.match(process.env.PROOFPASS_BINDING_NAME ?? '', /^binding-[a-f0-9]{16}$/);
    console.log('Preprod wallet ready; preparing fresh OpenDID binding');
    await promisify(execFile)(process.execPath, [project + '/scripts/gate1/binding-demo.mjs'], { cwd: project, env: process.env, timeout: 120000, maxBuffer: 1000000 });
  }
  await mkdir(evidenceDirectory, { recursive: true });
  service = await services({ network: config.networkId });
  const s = service;
  const deployment = await loadPrivate('deployment');
  const policy = deployment.policy;
  const contract = await rt.join();
  const runKey = 'flow-' + s.session.sessionId;
  const run = await loadPrivate(runKey) ?? { startedAt, solana: [], midnight: [], authorizations: {} };
  run.metrics ??= { authorizations: {} };
  const persist = () => savePrivate(runKey, run);
  const phase = (name, operation) => checkpoint(run, name, operation, persist);
  const submit = async (name, payer, instructions, allowFailure = false, beforeNew) => {
    const value = await s.transaction(name, payer, instructions, allowFailure, beforeNew);
    if (!run.solana.some(x => x.name === name)) run.solana.push({ name, ...value });
    await persist();
    return value;
  };
  const mandateAccount = (commitment = 'finalized') => solana.account(s.connection, solana.mandateAddress(s.owner.publicKey), 'Mandate', commitment);
  async function verifyTransfer(receipt) {
    for (let attempt = 0; attempt < 20; attempt++) {
      let tx;
      try { tx = await s.connection.getTransaction(receipt.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }); }
      catch (error) {
        if (!String(error.message).includes('429') || attempt >= 3) throw error;
        await new Promise(resolve => setTimeout(resolve, 15000));
        continue;
      }
      if (tx) return verifyPaymentReceipt(tx, { signature: receipt.signature,
        vault: solana.vaultAddress(s.owner.publicKey).toBase58(), recipient: s.recipient.publicKey.toBase58(),
        amount: 50_000_000, error: receipt.error });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw Error('Payment receipt unavailable; retain journal');
  }
  function validateBinding() {
    const session = s.binding();
    assert.equal(session.issuerPolicyId, hex(policy.issuerPolicyId));
    assert.equal(session.solanaCluster, hex(policy.destinationCluster));
    return session;
  }
  async function registerMandate(label, sourceHandle) {
    run.mandates ??= {};
    let mandate = run.mandates[label];
    const currentInfo = await s.connection.getAccountInfo(solana.mandateAddress(s.owner.publicKey), 'finalized');
    if (!mandate) {
      validateBinding();
      const current = currentInfo ? await mandateAccount() : null;
      mandate = { version: 1n, subject: fromHex(s.attestation.privateSubjectCommitment), owner: fromHex(s.session.solanaOwner),
        agentKey: fromHex(solana.hex(s.agent.publicKey)), destinationCluster: policy.destinationCluster, programId: policy.programId,
        vault: fromHex(solana.hex(solana.vaultAddress(s.owner.publicKey))), recipient: fromHex(solana.hex(s.recipient.publicKey)),
        assetId: policy.assetId, maxPerTx: 100000000n, mandateEpoch: current ? current.epoch + 1n : 1n,
        notBefore: BigInt(now() - 1), expiresAt: BigInt(now() + 1800), salt: new Uint8Array(randomBytes(32)) };
      run.mandates[label] = mandate;
      run.mandateOperations ??= {};
      run.mandateOperations[label] = current ? 'renew' : 'initialize';
      await persist();
    }
    const commitment = hex(p.mandateCommitment(mandate));
    const args = [s.owner.publicKey, s.agent.publicKey, commitment, sourceHandle, mandate.notBefore, mandate.expiresAt];
    const instruction = run.mandateOperations[label] === 'initialize' ? solana.initializeMandate(...args) : solana.renewMandate(...args);
    const receipt = await submit(label, s.owner, [instruction], false, validateBinding);
    const status = await s.finalized(receipt.signature);
    assert.equal(status.err, null);
    // Current mandate is checked before each new proof. An old registration
    // receipt remains recoverable after an intentional later revoke/renew.
    return mandate;
  }
  async function syncSource(label, observation) {
    run.sourceUpdates ??= {};
    const value = run.sourceUpdates[label] ?? {
      handle: observation.sourceStatusHandle, epoch: observation.sourceEpoch, active: observation.active,
      ledgerIndex: observation.ledger.index, ledgerHash: observation.ledger.hash,
      observedAt: observation.observedAt, validUntil: observation.validUntil };
    run.sourceUpdates[label] = value;
    await persist();
    await submit(label, s.observer, [solana.updateSource(s.observer.publicKey, value)]);
  }
  async function authorize(label, mandate) {
    const authorizationStarted = performance.now();
    stage = 'authorize-' + label;
    let authorization = run.authorizations[label];
    if (!authorization) {
      validateBinding();
      const { state, node } = await s.observe();
      assert.equal(state.status, 'accepted', 'Source inactive');
      assert(state.active && node, 'Source inactive');
      validateRegisteredMandate(mandate, await mandateAccount(), state.sourceStatusHandle, BigInt(now()), p.mandateCommitment);
      await syncSource(label + '-source', state);
      const clockNow = BigInt(now());
      const expiry = BigInt(Math.min(now() + 55, state.validUntil, Number(s.session.expiresAt)));
      assert(expiry - clockNow >= 35n, 'Too little lease remains to start proving');
      const payment = { version: 1n, policyId: policy.policyId, policyVersion: policy.policyVersion,
        destinationCluster: policy.destinationCluster, programId: policy.programId, owner: mandate.owner,
        agentKey: mandate.agentKey, vault: mandate.vault, recipient: mandate.recipient, assetId: policy.assetId,
        amount: 50000000n, requestId: new Uint8Array(randomBytes(32)), mandateEpoch: mandate.mandateEpoch, expiresAt: expiry };
      const identity = { version: 1n, subject: mandate.subject, issuerPolicyId: policy.issuerPolicyId, schemaVersion: 1n,
        predicate: 19n, verificationMode: 1n, checkedAt: BigInt(s.session.issuedAt), expiresAt: BigInt(s.session.expiresAt) };
      const binding = { version: 1n, subject: mandate.subject, sessionId: fromHex(s.session.sessionId),
        holderSessionDigest: fromHex(s.attestation.holderSessionDigest), xrplNetwork: BigInt(s.session.xrplNetwork),
        xrplAccount: fromHex(s.session.xrplAccount), solanaCluster: fromHex(s.session.solanaCluster),
        solanaOwner: fromHex(s.session.solanaOwner), issuedAt: BigInt(s.session.issuedAt), expiresAt: BigInt(s.session.expiresAt) };
      const source = { version: 1n, subject: mandate.subject, ...validateSourceIdentity(node, policy, binding),
        credentialId: fromHex(node.index.toLowerCase()),
        accepted: state.active, ledgerIndex: BigInt(state.ledger.index), ledgerHash: fromHex(state.ledger.hash),
        ledgerCloseTime: BigInt(state.ledger.closeTime), observedAt: BigInt(state.observedAt), validUntil: BigInt(state.validUntil),
        sourceEpoch: BigInt(state.sourceEpoch), sourceHandle: fromHex(state.sourceStatusHandle) };
      const clock = { version: 1n, requestCommitment: p.paymentCommitment(payment), now: clockNow, expiresAt: clockNow + 60n };
      const messages = [p.identityMessage(policy, identity), p.bindingMessage(policy, binding), p.sourceMessage(policy, source),
        p.mandateMessage(policy, mandate), p.clockMessage(policy, clock)];
      const signatures = messages.map((message, i) => sign(rt.secrets[[0, 0, 1, 2, 3][i]], message, p.schnorrChallenge));
      authorization = { payment, referenceVersion: 2, sourceHandle: state.sourceStatusHandle, sourceEpoch: state.sourceEpoch,
        bundle: { payment, identity, binding, source, mandate, clock, signatures } };
      run.authorizations[label] = authorization;
      await persist();
    }
    if (!authorization.receipt) {
      // Confirmation can precede local receipt persistence. The exact immutable
      // commitment is sufficient to recover confirmation, never to re-prove.
      const prior = await rt.providers.publicDataProvider.queryContractState(deployment.address);
      assert(prior);
      const priorLedger = ledger(prior.data);
      assert.deepEqual(priorLedger.configuration, policy);
      if (priorLedger.authorizations.member(p.paymentCommitment(authorization.payment))) {
        authorization.receipt = { txId: null, blockHeight: null, recoveredCommitment: hex(p.paymentCommitment(authorization.payment)) };
        run.midnight.push({ name: label, ...authorization.receipt });
        await persist();
      }
    }
    if (!authorization.receipt) {
      validateBinding();
      assert(BigInt(now()) < authorization.payment.expiresAt, 'Prepared request expired; retain journal');
      if (label === 'payment' && !run.overLimit) {
        const excessive = structuredClone(authorization.bundle);
        excessive.payment.amount = 150000000n;
        excessive.payment.requestId = new Uint8Array(randomBytes(32));
        excessive.clock.requestCommitment = p.paymentCommitment(excessive.payment);
        excessive.signatures[4] = sign(rt.secrets[3], p.clockMessage(policy, excessive.clock), p.schnorrChallenge);
        await rt.providers.privateStateProvider.set('livePolicy', excessive);
        const submissions = rt.timings.submissions.length;
        await assert.rejects(contract.callTx.authorize(), /Amount or epoch invalid/);
        assert.equal(rt.timings.submissions.length, submissions, 'Invalid request submitted to chain');
        run.overLimit = { result: 'approval-generation-rejected', reason: 'amount-over-limit', noSubmission: true, onChainFailureProof: false };
        await persist();
      }
      await rt.providers.privateStateProvider.set('livePolicy', authorization.bundle);
      console.log('Proving live policy request: ' + label);
      const proofCount = rt.timings.proofs.length;
      const callStarted = performance.now();
      const result = await contract.callTx.authorize();
      const finished = performance.now();
      const submitted = rt.timings.submissions.at(-1);
      authorization.timing = { contractProofMs: rt.timings.proofs.slice(proofCount).reduce((sum, item) => sum + item.durationMs, 0),
        proofAndConfirmationMs: Math.round(finished - callStarted),
        submissionToConfirmationMs: submitted ? Math.round(finished - submitted.started) : null,
        confirmedAt: new Date().toISOString() };
      authorization.receipt = result.public;
      run.midnight.push({ name: label, txId: result.public.txId, blockHeight: String(result.public.blockHeight) });
      await persist();
    }
    const confirmed = await rt.providers.publicDataProvider.queryContractState(deployment.address);
    assert(confirmed);
    const contractState = ledger(confirmed.data);
    assert.deepEqual(contractState.configuration, policy);
    const commitment = p.paymentCommitment(authorization.payment);
    assert(contractState.authorizations.member(commitment), 'No confirmed policy authorization');
    const request = fromCompactPayment(authorization.payment);
    const mapped = mapConfirmedAuthorization(request, commitment, contractState.authorizations.lookup(commitment), p.paymentCommitment);
    const result = { request, mapped, sourceHandle: mapped.sourceHandle, expiresAt: Number(request.expiresAt) };
    const reference = authorization.referenceVersion === 2
      ? digest('PROOFPASS:MIDNIGHT:COMMITMENT:V1\0' + deployment.genesisHash + ':' + deployment.address + ':' + hex(commitment))
      : digest('PROOFPASS:MIDNIGHT:REF:V1\0' + deployment.genesisHash + ':' + deployment.address + ':' + authorization.receipt.txId);
    const recordInstruction = solana.recordAuthorization(s.relay.publicKey, request,
      mapped.mandateCommitment, mapped.sourceHandle, mapped.sourceEpoch, reference);
    if (authorization.recorded) return result;
    // Reconcile an existing destination intent without requiring its lease to
    // remain live; beforeNew guards every newly signed relay transaction.
    const relayIntent = await s.readIntent(label + '-record');
    if (relayIntent) {
      await submit(label + '-record', s.relay, [recordInstruction]);
      authorization.recorded = true;
      await persist();
      return result;
    }
    validateBinding();
    const fresh = (await s.observe()).state;
    assert.equal(fresh.status, 'accepted', 'Source changed during proof');
    assert.equal(fresh.sourceEpoch, authorization.sourceEpoch, 'Source epoch changed during proof');
    validateRegisteredMandate(mandate, await mandateAccount(), fresh.sourceStatusHandle, BigInt(now()), p.mandateCommitment);
    assert(Number(request.expiresAt) > now() + 2, 'Authorization expired during proof');
    await syncSource(label + '-relay-source', fresh);
    await submit(label + '-record', s.relay, [recordInstruction], false, validateBinding);
    authorization.recorded = true;
    run.metrics.authorizations[label] = { ...authorization.timing, endToEndAuthorizationMs: Math.round(performance.now() - authorizationStarted) };
    await persist();
    return result;
  }
  async function denied(name, authorization, expectedCode) {
    const existing = run.denials?.find(x => x.name === name);
    if (existing) return existing;
    run.denialAttempts ??= {};
    const attempt = run.denialAttempts[name] ?? { attemptedAt: new Date().toISOString(), remainingLeaseMs: authorization.expiresAt * 1000 - Date.now() };
    run.denialAttempts[name] = attempt;
    await persist();
    const receipt = await submit(name, s.agent, [solana.executePayment(s.agent.publicKey, authorization.request, authorization.sourceHandle)], true,
      () => assert(authorization.expiresAt > now(), 'Approval expired before invalidation demonstration; retained prior payment'));
    await verifyTransfer(receipt);
    assert.equal(receipt.error?.InstructionError?.[1]?.Custom, expectedCode, 'Unexpected rejection reason');
    run.denials ??= [];
    const result = { name, liveAtAttempt: attempt.remainingLeaseMs > 0, ...attempt, balancesUnchanged: true, signature: receipt.signature, programError: expectedCode };
    run.denials.push(result);
    await persist();
    return result;
  }

  if (run.completed) {
    stage = 'completed-reconciliation';
    const paid = run.solana.find(x => x.name === 'execute-payment');
    assert(paid);
    await verifyTransfer(paid);
    await s.finalizedAll(run.solana);
    for (const deniedPayment of run.denials) {
      await new Promise(resolve => setTimeout(resolve, 3500));
      await verifyTransfer(run.solana.find(x => x.name === deniedPayment.name));
    }
    const confirmed = await rt.providers.publicDataProvider.queryContractState(deployment.address);
    const confirmedLedger = ledger(confirmed.data);
    assert.deepEqual(confirmedLedger.configuration, policy);
    for (const authorization of Object.values(run.authorizations)) {
      const commitment = p.paymentCommitment(authorization.payment);
      assert(confirmedLedger.authorizations.member(commitment));
      mapConfirmedAuthorization(fromCompactPayment(authorization.payment), commitment,
        confirmedLedger.authorizations.lookup(commitment), p.paymentCommitment);
    }
    await writeFile(s.runDirectory + '/operator-view.json', JSON.stringify({ maxPerTxLamports: String(run.mandates['initial-mandate'].maxPerTx) }));
    const report = run.report ?? JSON.parse(await readFile(evidenceDirectory + '/live-flow.json', 'utf8'));
    assert.equal(report.payment.signature, paid.signature, 'Historical report belongs to another run');
    await writeFile(evidenceDirectory + '/live-flow.json', JSON.stringify(report, null, 2) + '\n');
    await writeFile(evidenceDirectory + '/live-recovery.json', JSON.stringify({ status: 'passed',
      paymentSignature: paid.signature, newPayments: 0, verifiedSolanaReceipts: run.solana.length,
      verifiedMidnightAuthorizations: Object.keys(run.authorizations).length, bindingWasExpired: now() >= Number(s.session.expiresAt),
      recoveredAt: new Date().toISOString() }, null, 2) + '\n');
    console.log(JSON.stringify({ status: 'reconciled', paymentSignature: paid.signature, newPayments: 0 }));
  } else {
  stage = 'credential';
  run.xrpl ??= await s.prepareCredential();
  await persist();
  const observed = await phase('accepted-source', async () => {
    const state = (await s.observe()).state;
    assert.equal(state.status, 'accepted');
    return state;
  });
  stage = 'mandate';
  let mandate = await phase('initial-mandate', () => registerMandate('initial-mandate', observed.sourceStatusHandle));
  await writeFile(s.runDirectory + '/operator-view.json', JSON.stringify({ maxPerTxLamports: String(mandate.maxPerTx) }));
  if (run.funding === undefined) {
    const info = await s.connection.getAccountInfo(solana.vaultAddress(s.owner.publicKey));
    const rent = await s.connection.getMinimumBalanceForRentExemption(info.data.length);
    run.funding = Math.max(0, rent + 100_000_000 - info.lamports);
    await persist();
  }
  if (run.funding > 0) await submit('fund-vault', s.owner, [solana.fundVault(s.owner.publicKey, run.funding)]);
  const payment = await phase('payment-authorization', () => authorize('payment', mandate));
  const paymentStarted = performance.now();
  const paid = await submit('execute-payment', s.agent, [solana.executePayment(s.agent.publicKey, payment.request, payment.sourceHandle)]);
  await verifyTransfer(paid);
  const consumed = await solana.account(s.connection, solana.authorizationAddress(s.owner.publicKey, payment.request.requestId), 'Authorization');
  assert.equal(consumed.consumed, true);
  run.metrics.destinationExecutionMs ??= Math.round(performance.now() - paymentStarted);
  await denied('consumed-replay', payment, 6007);
  console.log('Live 0.05 SOL payment and consumed replay check passed.');

  const pendingMandate = await phase('pending-mandate-authorization', () => authorize('pending-mandate', mandate));
  await submit('revoke-mandate', s.owner, [solana.revokeMandate(s.owner.publicKey)]);
  await denied('mandate-revoked', pendingMandate, 6001);
  // Wait for the owner revocation to finalize before signing a replacement.
  assert.equal((await s.finalized(run.solana.find(x => x.name === 'revoke-mandate').signature)).err, null);
  mandate = await phase('renewed-mandate', () => registerMandate('renewed-mandate', observed.sourceStatusHandle));
  const pendingSource = await phase('pending-source-authorization', () => authorize('pending-source', mandate));
  stage = 'source-invalidation';
  const removed = await phase('source-invalidation', async () => {
    run.metrics.deleteSubmittedAt ??= new Date().toISOString();
    await persist();
    run.xrpl.delete = await s.deleteCredential();
    run.metrics.deleteValidatedAt ??= new Date().toISOString();
    await persist();
    const state = (await s.observe()).state;
    assert.equal(state.status, 'absent');
    assert(state.sourceEpoch > Number(pendingSource.mapped.sourceEpoch));
    await syncSource('deleted-source', state);
    run.metrics.sourceInvalidationConfirmedAt = new Date().toISOString();
    run.metrics.deletionToDestinationInvalidationMs = Date.now() - Date.parse(run.metrics.deleteValidatedAt);
    run.metrics.deleteSubmissionToInvalidationMs = Date.now() - Date.parse(run.metrics.deleteSubmittedAt);
    return state;
  });
  await denied('source-deleted', pendingSource, 6003);
  if (!run.newRequestAfterDelete) {
    await assert.rejects(authorize('new-request-after-delete', mandate), /Source inactive/);
    run.newRequestAfterDelete = 'rejected-before-proof';
  }
  await persist();
  stage = 'finality';
  await s.finalizedAll(run.solana);
  const finalizedSource = await solana.account(s.connection, solana.sourceAddress(removed.sourceStatusHandle), 'SourceStatus', 'finalized');
  assert.equal(finalizedSource.active, false);
  assert.equal(finalizedSource.epoch, BigInt(removed.sourceEpoch));
  const bindingReport = JSON.parse(await readFile(evidenceDirectory + '/binding.json', 'utf8'));
  run.metrics.identityBindingMs = bindingReport.elapsedMs;
  run.metrics.flowMsExcludingWalletStartup ??= Date.now() - Date.parse(run.startedAt);
  const report = { status: 'passed', mode: 'actual-OpenDID-ZKP-XRPL-Testnet-Midnight-' + config.networkId + '-Solana-Devnet',
    syntheticIdentityIssuer: true, liveAdapters: true, midnightNetwork: config.networkId === 'undeployed' ? 'undeployed-local' : config.networkId,
    midnightContract: deployment.address, solanaProgram: solana.PROGRAM_ID.toBase58(),
    xrpl: run.xrpl, midnight: run.midnight, solana: run.solana.map(({ name, signature, error }) => ({ name, signature, error, finalized: true })),
    payment: { lamports: 50_000_000, signature: paid.signature, vaultDelta: -50_000_000, recipientDelta: 50_000_000, consumed: true },
    rejectedPayments: run.denials, newRequestAfterDelete: run.newRequestAfterDelete, overLimit: run.overLimit, metrics: run.metrics,
    lastSourceObservation: { status: removed.status, active: removed.active, observedAt: removed.observedAt, ledgerIndex: removed.ledger.index },
    successfulPayments: 1, duplicatePayments: 0,
    invalidatedSourceEpoch: removed.sourceEpoch,
    disclosure: 'Local prover and trusted adapters/relay handle private inputs. Public transaction references/timing may correlate activity. Cross-chain revocation is delayed, not atomic.',
    fullGate1Complete: true, productUiComplete: false, startedAt: run.startedAt, completedAt: new Date().toISOString() };
  run.report ??= report;
  run.completed = true;
  await persist();
  await writeFile(evidenceDirectory + '/live-flow.json', JSON.stringify(run.report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, fullGate1Complete: true, paymentLamports: 50_000_000,
    denied: run.denials.map(x => x.name), evidence: config.evidenceDirectory + '/live-flow.json' }));
  }
} catch (error) {
  await savePrivate('last-failure', { stage, name: error.name, message: error.message, stack: error.stack, at: new Date().toISOString() });
  console.error('Live flow stopped at ' + stage + ': ' + error.message);
  process.exitCode = 1;
} finally {
  if (service) await service.close();
  await rt.close();
}
