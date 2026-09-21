#!/usr/bin/env bash
set -euo pipefail
if [ "$(id -u)" -eq 0 ]; then
  printf '%s\n' 'Run as the normal Ubuntu user, not root.' >&2
  exit 1
fi
project="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
toolroot=${HOME}/.local/share/proofpass/tools
mkdir -p "$project/.tools/downloads" "$toolroot/compact-cli-0.5.0"
cd "$project/.tools/downloads"
curl -fsSL --retry 2 -o node-v22.23.2-linux-x64.tar.xz https://nodejs.org/dist/v22.23.2/node-v22.23.2-linux-x64.tar.xz
printf '%s\n' 'd60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307  node-v22.23.2-linux-x64.tar.xz' | sha256sum -c -
tar -xJf node-v22.23.2-linux-x64.tar.xz -C "$toolroot"
curl -fsSL --retry 2 -o compact-x86_64-unknown-linux-musl.tar.xz https://github.com/midnightntwrk/compact/releases/download/compact-v0.5.0/compact-x86_64-unknown-linux-musl.tar.xz
printf '%s\n' '3a4b91fa7e286d5c68bda513dca249534d738770ced0177bc8f7a855113b4fec  compact-x86_64-unknown-linux-musl.tar.xz' | sha256sum -c -
tar -xJf compact-x86_64-unknown-linux-musl.tar.xz -C "$toolroot/compact-cli-0.5.0"
"$toolroot/node-v22.23.2-linux-x64/bin/node" --version
find "$toolroot/compact-cli-0.5.0" -maxdepth 3 -type f
