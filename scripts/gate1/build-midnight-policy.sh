#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" -ne 0
project="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
export PROOFPASS_PROJECT="$project"
toolroot="$HOME/.local/share/proofpass/tools"
export PATH="$toolroot/node-v22.23.2-linux-x64/bin:$toolroot/compact-cli-0.5.0/compact-x86_64-unknown-linux-musl:$PATH"
export COMPACT_DIRECTORY="$toolroot/compact-artifacts"
upstream="$HOME/proofpass-gate0/example-zkloan-eff9030d509f98938914c1b2b721acb88fc1e42c"
destination="$HOME/proofpass-gate1/midnight-policy"
mkdir -p "$destination/src" "$destination/test"
cp "$project/midnight/contract/package.json" "$destination/package.json"
cp "$project/midnight/contract/test/"*.mjs "$destination/test/"
if [ ! -e "$destination/node_modules" ]; then
  ln -s "$upstream/node_modules" "$destination/node_modules"
fi
cd "$destination"
if [ "${1:-all}" = test ]; then
  exec node --test test/*.test.mjs
fi
cp "$project/midnight/contract/src/"* "$destination/src/"
compact compile src/policy.compact src/managed/policy
node --test test/*.test.mjs
