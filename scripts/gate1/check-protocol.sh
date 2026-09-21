#!/usr/bin/env bash
set -euo pipefail
project="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
toolroot="$HOME/.local/share/proofpass/tools"
export RUSTUP_HOME="$toolroot/rustup" CARGO_HOME="$toolroot/cargo"
mkdir -p "$HOME/proofpass-gate1" "$project/.local/gate1"
"$CARGO_HOME/bin/rustc" "$project/test/protocol-vector.rs" -o "$HOME/proofpass-gate1/protocol-vector"
"$HOME/proofpass-gate1/protocol-vector" > "$project/.local/gate1/rust-vector.hex"
cd "$project"
"$toolroot/node-v22.23.2-linux-x64/bin/node" scripts/gate1/check-protocol.mjs
