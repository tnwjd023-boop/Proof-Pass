# Gate 1 Solana mandate and one-time authorization

Continue the approved P0 design automatically. Keep the Gate0 owner-only vault and its evidence unchanged; deploy a separate program.

## Fixed design

- A singleton Config is initialized only by the existing ProofPass test deployer public key. It pins the relay, source observer, policy, destination cluster and native-SOL asset. It is immutable in this MVP.
- Each owner signs initialization of a persistent Mandate and program-owned Vault. Mandate stores agent, private-detail commitment, source handle, epoch, validity and active state. Revocation and renewal monotonically increase epoch; no account close/reinitialize path exists. Owner withdrawal is separate from agent payment and preserves rent.
- SourceStatus is a persistent opaque-handle PDA. Only the configured observer updates monotone epoch and ledger observations. Same-epoch status changes, conflicting ledger hashes, rollback and leases exceeding 60 seconds are rejected.
- Only the configured relay records a request authorization. Its PDA uses owner + requestId, so the same request ID cannot be reissued with altered fields. Store exact canonical request SHA-256, mandate/source references and expiry. The program checks the full request again at execution.
- Agent signature, current mandate/source epochs, program ownership, PDA seeds, destination, Clock, positive amount, rent and balance are checked before atomically marking consumed and transferring lamports. No account closure can erase consumed history.

## Tasks

- [x] Add meaningful Rust validation tests and a separate Anchor program with the strict request codec (2/2 Rust tests).
- [x] Build SBF with the already pinned Anchor/Solana toolchain and run a real local-validator suite (50 operations/checks): 0.05 SOL success; replay, wrong signer/recipient/network/amount, stale source, revocation, reissue and rollback rejection with balances unchanged.
- [x] Deploy and verify the new Devnet program. Existing test funds sufficed; finalized receipt, loader ownership, retained upgrade authority, program-data PDA and downloaded byte hash all checked.
- [ ] Register a user-approved mandate, integrate actual Compact attestations and the confirmed Midnight relay, then verify real testnet payment and invalidation.
- [x] Final independent review of the bounded destination component: no actionable findings. Live integration review follows separately.

Native SOL test funds only. Do not label trusted relay operations a trustless bridge. Local fixture tests and public-chain integration evidence remain explicitly separate.
