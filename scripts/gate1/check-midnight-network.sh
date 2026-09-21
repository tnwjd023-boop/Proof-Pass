#!/usr/bin/env bash
set -euo pipefail
project="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
node=/home/tnwjd/.local/share/proofpass/tools/node-v22.23.2-linux-x64/bin/node
exec "$node" "$project/scripts/gate1/check-midnight-network.mjs"
