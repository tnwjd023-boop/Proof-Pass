#!/usr/bin/env bash
set -euo pipefail
project="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
toolroot="$HOME/.local/share/proofpass/tools"
export CARGO_HOME="$toolroot/cargo"
export RUSTUP_HOME="$toolroot/rustup"
export PATH="$CARGO_HOME/bin:$PATH"
destination="$HOME/proofpass-gate1/solana-authorization/request-tests"
mkdir -p "$destination"
cp "$project/solana/programs/authorization/src/"*.rs "$project/solana/programs/authorization/src/payment-v1.hex" "$destination/"
cd "$destination"
rustc --test request_tests.rs -o request-tests
./request-tests
