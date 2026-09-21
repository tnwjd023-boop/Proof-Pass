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
case "${1:-}" in
  setup) exec node --import tsx src/live-setup.mjs ;;
  run) exec node --import tsx src/live-flow.mjs ;;
  *) printf '%s\n' 'Expected setup or run' >&2; exit 2 ;;
esac
