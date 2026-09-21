import { createConstructorContext, createCircuitContext, sampleContractAddress, ecMulGenerator } from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger, pureCircuits as p } from '../src/managed/policy/contract/index.js';
import { witnesses, sign } from '../src/signing.mjs';
const b = n => new Uint8Array(32).fill(n);
const account = n => new Uint8Array(20).fill(n);
const keys = [11n, 22n, 33n, 44n];
function fixture(mutator = () => {}) {
  const config = { scope: b(1), policyId: b(2), policyVersion: 1n, issuerPolicyId: b(3),
    schemaVersion: 1n, xrplNetwork: 1n, xrplIssuer: account(4), credentialType: b(5),
    destinationCluster: b(6), programId: b(7), assetId: b(8) };
  const payment = { version: 1n, policyId: b(2), policyVersion: 1n, destinationCluster: b(6), programId: b(7),
    owner: b(9), agentKey: b(10), vault: b(11), recipient: b(12), assetId: b(8), amount: 50000000n,
    requestId: b(13), mandateEpoch: 1n, expiresAt: 1040n };
  const identity = { version: 1n, subject: b(14), issuerPolicyId: b(3), schemaVersion: 1n,
    predicate: 19n, verificationMode: 1n, checkedAt: 990n, expiresAt: 1200n };
  const binding = { version: 1n, subject: b(14), sessionId: b(15), holderSessionDigest: b(16), xrplNetwork: 1n,
    xrplAccount: account(17), solanaCluster: b(6), solanaOwner: b(9), issuedAt: 990n, expiresAt: 1200n };
  const source = { version: 1n, subject: b(14), xrplNetwork: 1n, issuer: account(4), account: account(17),
    credentialType: b(5), credentialId: b(18), accepted: true, ledgerIndex: 100n, ledgerHash: b(19),
    ledgerCloseTime: 995n, observedAt: 1000n, validUntil: 1060n, sourceEpoch: 2n, sourceHandle: b(20) };
  const mandate = { version: 1n, subject: b(14), owner: b(9), agentKey: b(10), destinationCluster: b(6), programId: b(7),
    vault: b(11), recipient: b(12), assetId: b(8), maxPerTx: 50000000n, mandateEpoch: 1n,
    notBefore: 990n, expiresAt: 1200n, salt: b(21) };
  const clock = { version: 1n, requestCommitment: p.paymentCommitment(payment), now: 1000n, expiresAt: 1060n };
  const state = { config, payment, identity, binding, source, mandate, clock };
  mutator(state);
  const messages = [p.identityMessage(config, state.identity), p.bindingMessage(config, state.binding),
    p.sourceMessage(config, state.source), p.mandateMessage(config, state.mandate), p.clockMessage(config, state.clock)];
  state.signatures = messages.map((m, i) => sign(keys[[0, 0, 1, 2, 3][i]], m, p.schnorrChallenge));
  const contract = new Contract(witnesses);
  const initial = contract.initialState(createConstructorContext(state, '00'.repeat(32)), config, keys.map(ecMulGenerator));
  let context = createCircuitContext(sampleContractAddress(), initial.currentZswapLocalState, initial.currentContractState, state);
  return { state, contract, config, authorize() {
    context = contract.impureCircuits.authorize(context).context;
    return ledger(context.currentQueryContext.state);
  } };
}


export { fixture, b, account, keys };
