#!/usr/bin/env bash
set -euo pipefail
export PROOFPASS_PROJECT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ -n "${2:-}" ]]; then
  [[ "$2" =~ ^binding-[0-9a-f]{16}$ ]] || exit 2
  export PROOFPASS_BINDING_NAME="$2"
fi
export PROOFPASS_MIDNIGHT_UPSTREAM="$HOME/proofpass-gate0/example-zkloan-eff9030d509f98938914c1b2b721acb88fc1e42c"
export PATH="$HOME/.local/share/proofpass/tools/node-v22.23.2-linux-x64/bin:$PATH"
destination="$HOME/proofpass-gate1/midnight-policy"
cp "$PROOFPASS_PROJECT/midnight/contract/src/"*.mjs "$destination/src/"
cd "$destination"
if [[ "${PROOFPASS_MIDNIGHT_NETWORK:-undeployed}" == preprod && "${1:-}" != wallet-status && "${1:-}" != wallet-audit ]]; then
  mkdir -p private/preprod-live
  chmod 700 private/preprod-live
  exec 9>private/preprod-live/wallet.lock
  flock -n 9 || { printf '%s\n' 'Preprod wallet is in use; wait for the active process to finish.' >&2; exit 1; }
fi
case "${1:-}" in
  wallet) exec node --import tsx src/preprod-wallet.mjs ;;
  wallet-status) exec node --import tsx src/preprod-status.mjs ;;
  wallet-audit) exec node --import tsx src/preprod-audit.mjs ;;
  setup) exec node --import tsx src/live-setup.mjs ;;
  run) exec node --import tsx src/live-flow.mjs ;;
  run-fresh)
    [[ "${PROOFPASS_MIDNIGHT_NETWORK:-undeployed}" == preprod && -n "${PROOFPASS_BINDING_NAME:-}" ]] || exit 2
    export PROOFPASS_CREATE_BINDING=1
    exec node --import tsx src/live-flow.mjs ;;
  *) printf '%s\n' 'Expected wallet, wallet-status, wallet-audit, setup, run or run-fresh' >&2; exit 2 ;;
esac
