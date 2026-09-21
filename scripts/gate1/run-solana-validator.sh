#!/usr/bin/env bash
set -euo pipefail
project="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
toolroot="$HOME/.local/share/proofpass/tools"
export PATH="$toolroot/solana-2.3.0/solana-release/bin:$PATH"
build="$HOME/proofpass-gate1/solana-authorization/build"
ledger="$HOME/proofpass-gate1/solana-authorization/validator-$(date -u +%Y%m%dT%H%M%SZ)"
test -f "$build/target/deploy/proofpass_authorization.so"
printf '%s\n' "Starting isolated local validator: $ledger"
exec solana-test-validator --ledger "$ledger" --rpc-port 18899 --bind-address 127.0.0.1 \
  --faucet-port 18902 --dynamic-port-range 19000-19020 \
  --bpf-program 3983maEGpsg2M5tTqBqMtLm5rRmZsYKTDDUZAnrPuBAJ "$build/target/deploy/proofpass_authorization.so" \
  --quiet > "$project/.local/setup/solana-auth-validator.log" 2>&1
