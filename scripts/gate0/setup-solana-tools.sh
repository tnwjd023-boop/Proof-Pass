#!/usr/bin/env bash
set -euo pipefail
project="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
toolroot="$HOME/.local/share/proofpass/tools"
mkdir -p "$toolroot/downloads" "$toolroot/solana-2.3.0" "$toolroot/anchor-0.32.1" "$project/.local/setup"
exec > "$project/.local/setup/solana-tools-install.log" 2>&1
cd "$toolroot/downloads"
curl -fsSL --retry 2 -o solana-v2.3.0.tar.bz2 https://github.com/anza-xyz/agave/releases/download/v2.3.0/solana-release-x86_64-unknown-linux-gnu.tar.bz2
printf '%s\n' '56241fbe862495ff01b2b875195e44f94c22e9f2a504591a3ade1b9d82862730  solana-v2.3.0.tar.bz2' | sha256sum -c -
tar -xjf solana-v2.3.0.tar.bz2 -C "$toolroot/solana-2.3.0"
curl -fsSL --retry 2 -o anchor-0.32.1 https://github.com/otter-sec/anchor/releases/download/v0.32.1/anchor-0.32.1-x86_64-unknown-linux-gnu
printf '%s\n' '5f25b850ce80278507a98947833fcd48423391f6d145046ffb0c5fd130dec436  anchor-0.32.1' | sha256sum -c -
install -m 755 anchor-0.32.1 "$toolroot/anchor-0.32.1/anchor"
curl -fsSL --retry 2 -o rustup-init https://static.rust-lang.org/rustup/archive/1.28.2/x86_64-unknown-linux-gnu/rustup-init
printf '%s\n' '20a06e644b0d9bd2fbdbfd52d42540bdde820ea7df86e92e533c073da0cdd43c  rustup-init' | sha256sum -c -
chmod 755 rustup-init
export CARGO_HOME="$toolroot/cargo"
export RUSTUP_HOME="$toolroot/rustup"
./rustup-init -y --no-modify-path --profile minimal --default-toolchain 1.90.0
"$toolroot/solana-2.3.0/solana-release/bin/solana" --version
"$toolroot/anchor-0.32.1/anchor" --version
"$CARGO_HOME/bin/rustc" --version
"$CARGO_HOME/bin/cargo" --version
