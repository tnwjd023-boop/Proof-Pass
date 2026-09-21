#!/usr/bin/env bash
set -euo pipefail
project="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
toolroot="$HOME/.local/share/proofpass/tools"
export CARGO_HOME="$toolroot/cargo"
export RUSTUP_HOME="$toolroot/rustup"
export PATH="$toolroot/solana-2.3.0/solana-release/bin:$toolroot/anchor-0.32.1:$CARGO_HOME/bin:$PATH"
buildroot="$HOME/proofpass-gate0/solana-vault"
mkdir -p "$buildroot/programs/gate0-vault/src" "$project/.local/setup"
cp "$project/solana/Cargo.toml" "$project/solana/Anchor.toml" "$buildroot/"
cp "$project/solana/programs/gate0-vault/Cargo.toml" "$buildroot/programs/gate0-vault/"
cp "$project/solana/programs/gate0-vault/src/"*.rs "$buildroot/programs/gate0-vault/src/"
if [ -f "$project/solana/Cargo.lock" ]; then cp "$project/solana/Cargo.lock" "$buildroot/"; fi
cd "$buildroot"
exec > "$project/.local/setup/solana-vault-build.log" 2>&1
rustc --test programs/gate0-vault/src/payout_math.rs -o payout-math-tests
./payout-math-tests
cargo build-sbf --tools-version v1.53 --arch v0 --manifest-path programs/gate0-vault/Cargo.toml
cp Cargo.lock "$project/solana/Cargo.lock"
sha256sum target/deploy/gate0_vault.so
