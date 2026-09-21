#!/usr/bin/env bash
set -euo pipefail
export PROOFPASS_PROJECT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
export PROOFPASS_MIDNIGHT_UPSTREAM="$HOME/proofpass-gate0/example-zkloan-eff9030d509f98938914c1b2b721acb88fc1e42c"
export PATH="$HOME/.local/share/proofpass/tools/node-v22.23.2-linux-x64/bin:$PATH"
destination="$HOME/proofpass-gate1/midnight-policy"
cp "$PROOFPASS_PROJECT/midnight/contract/test/"*.mjs "$destination/test/"
cd "$destination"
exec node --import tsx test/network.mjs
