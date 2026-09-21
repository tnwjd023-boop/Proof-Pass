# Midnight Preprod transition

Approved by the user after the local demo; continue autonomously. Baseline is GitHub main commit 083a20a. Work on feat/midnight-preprod.

Design: retain the tested local path and add a strictly selected Preprod profile. Use a new random project-only wallet, separate private state, deployment keys and public evidence. Pin genesis and deployed policy before relay use. Keep the proof server local. Do not broaden the 60-second source freshness rule to accommodate network latency; measure and fail closed if it cannot fit.

- [x] Verify official compatibility and live RPC/indexer/proof endpoints; derive an isolated wallet and obtain test funds.
- [x] RED/GREEN profile isolation and wrong-network rejection; adapt runtime, deployment and evidence paths without modifying local results.
- [ ] Deploy policy to Preprod with durable intent; confirm configuration, roles and genesis.
- [ ] Re-run the actual OpenDID/XRPL/Solana flow with Preprod authorization, including payment/replay/revocation and receipt-only recovery.
- [ ] Update dashboard/evidence for the verified network, review once, fix Important findings in one regression pass, push the feature branch.

Faucet funding may require direct user browser interaction. Never expose seed material. A wallet address and faucet link are sufficient. Existing local and public-testnet journals must not be overwritten by the new network. No mainnet operations.

References checked 2026-09-21: https://docs.midnight.network/relnotes/support-matrix and https://docs.midnight.network/relnotes/network. Preprod compiler 0.31.1, proof server 8.1.0, indexer v4; SDK compatibility is additionally verified against installed packages and live service responses.

Progress: first full wallet sync completed 2026-09-21T04:56Z with 5,000,000,000 NIGHT base units. Restoring the SDK DUST snapshot is CPU-intensive and still takes several minutes, but avoids re-reading all 1.54 million events. Read-only restored-wallet fee query passed at 06:11Z. The initial upstream DUST registration helper stalled before contract deployment; after its one-hour transaction lifetime elapsed, the process was stopped, the snapshot backed up privately, and unshielded state rebuilt with the SDK from the public account history. No contract or Solana payment had been submitted by that setup run. Added durable DUST submission intent and stage diagnostics before the next attempt.

Verification so far: wrong-profile/account snapshot tests; Preprod dashboard separation; mismatched evidence cannot show PASS; browser desktop/mobile rendering without false completion; live wallet mutual exclusion; DUST uncertain retry regression RED→GREEN; warm wallet before identity and same-binding resume regression RED→GREEN. Preserve historical baseline evidence.

RPC diagnosis: SDK PolkadotNodeClient.make → disconnect → getGenesis reconnect reproduced Normal Closure failure at 08:48Z. Keeping the initial ApiPromise connection with the same SDK client completed the same read-only query. Added fresh per-submission connection, genesis assertion, bounded initialization/confirmation and closure. Regression RED→GREEN; the prior exact registration was absent by every identifier after its one-hour TTL, archived privately, and public unshielded account replay restored the 5,000,000,000 balance before the next attempt.

## Review Focus

Check uncertain RPC submission and restart preserve intents; cold wallet restoration precedes fresh identity; local and Preprod wallet/evidence/intent paths cannot mix; runtime pins both query and submission genesis; the unchanged 60-second source/approval lease fails closed on public network delays. Distinguish dashboard-rendering evidence from completed on-chain execution. Shared XRPL/Solana actors still require the existing project flow lock.
