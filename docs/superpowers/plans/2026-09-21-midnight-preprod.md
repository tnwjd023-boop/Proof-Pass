# Midnight Preprod transition

Approved by the user after the local demo; continue autonomously. Baseline is GitHub main commit 083a20a. Work on feat/midnight-preprod.

Design: retain the tested local path and add a strictly selected Preprod profile. Use a new random project-only wallet, separate private state, deployment keys and public evidence. Pin genesis and deployed policy before relay use. Keep the proof server local. Do not broaden the 60-second source freshness rule to accommodate network latency; measure and fail closed if it cannot fit.

- [x] Verify official compatibility and live RPC/indexer/proof endpoints; derive an isolated wallet and obtain test funds.
- [x] RED/GREEN profile isolation and wrong-network rejection; adapt runtime, deployment and evidence paths without modifying local results.
- [x] Deploy policy to Preprod with durable intent; confirm configuration, roles and genesis.
- [x] Re-run the actual OpenDID/XRPL/Solana flow with Preprod authorization, including payment/replay/revocation and receipt-only recovery.
- [x] Update dashboard/evidence for the verified network, review once, fix Important findings in one regression pass, push the feature branch.

Faucet funding may require direct user browser interaction. Never expose seed material. A wallet address and faucet link are sufficient. Existing local and public-testnet journals must not be overwritten by the new network. No mainnet operations.

References checked 2026-09-21: https://docs.midnight.network/relnotes/support-matrix and https://docs.midnight.network/relnotes/network. Preprod compiler 0.31.1, proof server 8.1.0, indexer v4; SDK compatibility is additionally verified against installed packages and live service responses.

Progress: first full wallet sync completed 2026-09-21T04:56Z with 5,000,000,000 NIGHT base units. Restoring the SDK DUST snapshot is CPU-intensive and still takes several minutes, but avoids re-reading all 1.54 million events. Read-only restored-wallet fee query passed at 06:11Z. The initial upstream DUST registration helper stalled before contract deployment; after its one-hour transaction lifetime elapsed, the process was stopped, the snapshot backed up privately, and unshielded state rebuilt with the SDK from the public account history. No contract or Solana payment had been submitted by that setup run. Added durable DUST submission intent and stage diagnostics before the next attempt.

Verification so far: wrong-profile/account snapshot tests; Preprod dashboard separation; mismatched evidence cannot show PASS; browser desktop/mobile rendering without false completion; live wallet mutual exclusion; DUST uncertain retry regression RED→GREEN; warm wallet before identity and same-binding resume regression RED→GREEN. Preserve historical baseline evidence.

RPC diagnosis: SDK PolkadotNodeClient.make → disconnect → getGenesis reconnect reproduced Normal Closure failure at 08:48Z. Keeping the initial ApiPromise connection with the same SDK client completed the same read-only query. Added fresh per-submission connection, genesis assertion, bounded initialization/confirmation and closure. Regression RED→GREEN; the prior exact registration was absent by every identifier after its one-hour TTL, archived privately, and public unshielded account replay restored the 5,000,000,000 balance before the next attempt.

## Review Focus

Check uncertain RPC submission and restart preserve intents; cold wallet restoration precedes fresh identity; local and Preprod wallet/evidence/intent paths cannot mix; runtime pins both query and submission genesis; the unchanged 60-second source/approval lease fails closed on public network delays. Distinguish dashboard-rendering evidence from completed on-chain execution. Shared XRPL/Solana actors still require the existing project flow lock.

Final code review (083a20a..d9d8164): one Important finding, no Critical or Minor findings. Final: fixed completed DUST registration wrongly blocking a later faucet top-up — `a faucet top-up does not block a wallet with a completed registration and usable DUST` RED→GREEN; full suite 45/45 passed. No re-review requested.

Final: Ruling: actual Preprod integration was set aside by the code reviewer — keep it as a separate acceptance gate; deployment confirmed at block 2644713, whole flow passed 09:04:08Z and expired-binding receipt-only recovery passed 09:08:21Z with 18 Solana receipts, 3 Midnight authorizations and no new payments — cost if not verified: code review alone cannot establish public-network demo success.
Final: Ruling: installed SDK internals were not inspected by the reviewer because WSL read access was denied — retain pinned dependencies and direct executor SDK inspection plus actual RPC/DUST/deployment verification — cost if wrong: unexercised SDK behavior may remain.
Final: Ruling: production wallet hardening and broader cross-chain trust redesign remain outside the approved hackathon prototype — preserve the documented adapter/relay trust and test-wallet boundary — cost if ignored: this prototype is not suitable as an audited production wallet.

Acceptance: real Preprod dashboard API run passed all payment/replay/mandate-revocation/source-revocation checks. Payment `4SnYCGG7QwaR4sdCcypVoytk3agMHbY7dteMSoNQ3P67iMxnZ2xrmRMtf24xbruhZLd2ZXDAZL7TvGV9A61oVpia`. All three authorizations registered in ~42 seconds without extending the 60-second lease. Browser desktop/mobile passed with actual completed evidence. User requested README care; README now leads with verified Preprod behavior, wallet model, setup requirements, measured timings and scoped trust assumptions. Keep the baseline and feature branch history when fast-forwarding main under the user's autonomous-completion instruction.
