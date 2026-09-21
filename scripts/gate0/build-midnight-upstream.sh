#!/usr/bin/env bash
set -euo pipefail
if [ "$(id -u)" -eq 0 ]; then
  printf '%s\n' 'Run as the normal Ubuntu user, not root.' >&2
  exit 1
fi
project="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
mkdir -p "$project/.local/setup"
toolroot=${HOME}/.local/share/proofpass/tools
export PATH="$toolroot/node-v22.23.2-linux-x64/bin:$toolroot/compact-cli-0.5.0/compact-x86_64-unknown-linux-musl:$PATH"
export COMPACT_DIRECTORY="$toolroot/compact-artifacts"
commit=eff9030d509f98938914c1b2b721acb88fc1e42c
destination="${HOME}/proofpass-gate0/example-zkloan-$commit"
exec > "$project/.local/setup/midnight-linux-build.log" 2>&1
date -u --iso-8601=seconds
node --version
npm --version
compact --version
compact update 0.31.1
compact compile --version
if [ ! -d "$destination" ]; then
  mkdir -p "$destination"
  git -c safe.directory="$project/.external/example-zkloan" -C "$project/.external/example-zkloan" archive "$commit" | tar -x -C "$destination"
fi
cd "$destination"
npm ci --no-audit --no-fund
cd contract
npm run compact
npm run build
npm test -- --reporter=verbose
