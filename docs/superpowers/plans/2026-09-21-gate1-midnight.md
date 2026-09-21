# Gate 1 Midnight policy and confirmed local chain

Continue the approved v2 design autonomously. This is a local Midnight development network, not a public testnet deployment. XRPL Testnet and Solana Devnet remain separate networks.

## Design and scope

Use the exact node 1.0.0 / indexer 4.3.3 / proof-server 8.1.0 combination from the pinned upstream example. Bind ports to loopback only. Isolate Compose resources under `proofpass-gate1`. Preserve containers and evidence across restarts; do not recreate a chain behind an existing deployment record.

Policy authorization must bind the canonical payment request, private subject, owner mandate, issuer policy, destination, source epoch, expiry and role-specific signatures. A trusted time attestation or supported on-chain clock is required; a caller's clock is insufficient. The existing Ed25519 envelopes are not Compact proofs. Separate adapter, source observer, mandate verifier and clock keys will attest bounded typed messages using the pinned Jubjub verifier. The relay must check the actual confirmed state and exact mapping between Compact commitment and SHA-256 destination request.

## Tasks

- [x] Start the pinned local node, indexer and proof server, verify readiness and record image digests.
- [x] Build a project-owned Compact contract and policy tests with explicit negative cases, using the already pinned compiler/runtime.
- [ ] Connect bound credentials and owner-signed mandates to separate attestation roles; no arbitrary client-provided trust keys.
- [x] Prove and submit a synthetic-fixture authorization on the real local chain and query confirmed state; replay/expiry rejection tested in the compiled circuit. Live adapter evidence remains pending.
- [x] One independent final review for the bounded policy/runtime subproject; canonical Schnorr reduction fixed RED→GREEN, final Compact9/9 and Node24/24, final sources redeployed and proved.

Dependency ruling: live mandate attestations require the new Solana mandate registration first. Continue that destination subproject before live integration; this plan does not claim the unchecked adapter task complete.

Full Gate 1 remains incomplete until the new Solana authorization consumer and real relay are implemented and verified. Gate0 owner-only payouts do not satisfy that requirement.
