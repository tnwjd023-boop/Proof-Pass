# ProofPass Midnight development network and policy

`compose.yml` uses the node 1.0.0, indexer 4.3.3 and proof-server 8.1.0 images from the pinned official example (`eff9030d509f98938914c1b2b721acb88fc1e42c`). Resources are isolated under `proofpass-gate1`, and all published ports bind to localhost. Public example indexer credentials and the dev-genesis wallet are **local development defaults only**.

Start from the project directory in Ubuntu as root for Docker:

```bash
bash scripts/gate1/run-midnight-network.sh
```

Keep that foreground process running. On this WSL instance, returning from the last user process allowed WSL to shut down and terminate Docker, even with systemd enabled. The monitor fixes the observed lifetime problem without changing global WSL settings. Closing it does not explicitly delete containers; never use `down`, recreate or prune to recover an existing deployment without accounting for its chain history.

In another Ubuntu process:

```bash
# root: inspect images and real endpoints
bash scripts/gate1/check-midnight-network.sh
# normal Ubuntu user: build and run the project policy tests
bash scripts/gate1/build-midnight-policy.sh
# normal Ubuntu user: real local-chain test with explicitly synthetic claims
bash scripts/gate1/test-midnight-policy-network.sh
```

The build uses Compact CLI 0.5.0 / compiler 0.31.1 and exact dependencies already installed from the Gate0 upstream package lock. Build files and encrypted private state live under `~/proofpass-gate1/midnight-policy`; source and public evidence live in this project. `schnorr.compact` is derived from the pinned example, with an additional canonical field-modulus boundary check found during independent review; see `UPSTREAM-LICENSE`. The boundary regression failed before the fix; no practical signature forgery was demonstrated.

The immutable policy pins four distinct Jubjub keys: identity/binding adapter, XRPL observer, mandate adapter and time observer. Five role-separated signatures bind typed payloads to a deployment scope and policy configuration. The circuit checks matching subjects and accounts, exact payment/mandate destination and epoch, positive amount and private per-transaction limit, accepted credential, source freshness and bounded signed time. Full mandates, account linkage and identity data are not written to public contract state.

Compact `persistentHash` is not assumed to equal SHA-256 over the destination wire encoding. `src/midnight/request.mjs` maps the exact canonical preimage and compares the actual compiled Compact commitment to a confirmed record. Authenticating the network, contract and finality is the caller's separate responsibility. A signed clock bounds proof-time conditions; the destination must still check its own execution clock, current mandate and source epoch.

The network test deploys a separate **synthetic-fixture** contract and proves a request against it. Its deterministic test role keys and synthetic source/mandate assertions must never be used as the live Gate1 trust configuration. This test establishes prover/node/indexer compatibility; it does not establish the OpenDID → XRPL → registered Solana mandate → payment workflow. The local proof server processes private witness material and is inside the user's trusted environment.
