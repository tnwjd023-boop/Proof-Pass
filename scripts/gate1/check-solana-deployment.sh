#!/usr/bin/env bash
set -euo pipefail
project="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
exec "$HOME/.local/share/proofpass/tools/node-v22.23.2-linux-x64/bin/node" \
  "$project/scripts/gate1/solana-deployment-preflight.mjs" \
  "$HOME/proofpass-gate1/solana-authorization/build/target/deploy/proofpass_authorization.so"
