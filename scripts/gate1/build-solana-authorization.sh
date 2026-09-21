#!/usr/bin/env bash
set -euo pipefail
project="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
toolroot="$HOME/.local/share/proofpass/tools"
export CARGO_HOME="$toolroot/cargo"
export RUSTUP_HOME="$toolroot/rustup"
export PATH="$toolroot/solana-2.3.0/solana-release/bin:$CARGO_HOME/bin:$PATH"
destination="$HOME/proofpass-gate1/solana-authorization/build"
mkdir -p "$destination/src"
cp "$project/solana/programs/authorization/Cargo.toml" "$destination/"
cp "$project/solana/programs/authorization/src/"* "$destination/src/"
if [ -f "$project/solana/programs/authorization/Cargo.lock" ]; then
  cp "$project/solana/programs/authorization/Cargo.lock" "$destination/Cargo.lock"
elif [ ! -f "$destination/Cargo.lock" ]; then
  cp "$project/solana/Cargo.lock" "$destination/Cargo.lock"
fi
cd "$destination"
rustc --test src/request_tests.rs -o request-tests
./request-tests
cargo build-sbf --tools-version v1.53 --arch v0
cp Cargo.lock "$project/solana/programs/authorization/Cargo.lock"
sha256sum target/deploy/proofpass_authorization.so
