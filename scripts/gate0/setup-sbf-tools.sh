#!/usr/bin/env bash
set -euo pipefail
toolroot="$HOME/.local/share/proofpass/tools"
mkdir -p "$toolroot/downloads" "$HOME/.cache/solana/v1.53/platform-tools"
cd "$toolroot/downloads"
curl -fsSL --retry 2 -o platform-tools-v1.53.tar.bz2 https://github.com/anza-xyz/platform-tools/releases/download/v1.53/platform-tools-linux-x86_64.tar.bz2
printf '%s\n' '876b5c294a38d41d40bed4592911091e92cc3f399dd17a0f9cac87b1df9ab120  platform-tools-v1.53.tar.bz2' | sha256sum -c -
tar -xjf platform-tools-v1.53.tar.bz2 -C "$HOME/.cache/solana/v1.53/platform-tools"
"$HOME/.cache/solana/v1.53/platform-tools/rust/bin/rustc" --version
