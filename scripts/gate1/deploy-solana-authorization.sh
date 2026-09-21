#!/usr/bin/env bash
set -euo pipefail
project="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
toolroot="$HOME/.local/share/proofpass/tools"
export PATH="$toolroot/solana-2.3.0/solana-release/bin:$PATH"
node="$toolroot/node-v22.23.2-linux-x64/bin/node"
binary="$HOME/proofpass-gate1/solana-authorization/build/target/deploy/proofpass_authorization.so"
keys="$project/.local/solana-gate1"
payer="$project/.local/solana-gate0/payer.json"
test "$(solana genesis-hash --url devnet)" = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'
test "$(solana-keygen pubkey "$keys/program.json")" = '3983maEGpsg2M5tTqBqMtLm5rRmZsYKTDDUZAnrPuBAJ'
if [ -f "$keys/deployment-started.json" ]; then
  printf '%s\n' 'Deployment has a prior intent; reconcile chain/buffer before retry.' >&2
  exit 1
fi
"$node" "$project/scripts/gate1/solana-deployment-preflight.mjs" "$binary" --require-ready
if [ ! -f "$keys/buffer.json" ]; then
  solana-keygen new --no-bip39-passphrase --silent --outfile "$keys/buffer.json" > /dev/null
fi
cp "$project/evidence/gate1/solana-deployment-preflight.json" "$keys/deployment-started.json"
solana program deploy "$binary" --url devnet --keypair "$payer" \
  --program-id "$keys/program.json" --buffer "$keys/buffer.json" \
  --max-len "$(stat -c %s "$binary")" --output json \
  > "$keys/deployment.json" 2> "$keys/deployment-errors.txt"
printf '%s\n' 'Deployment submitted; verifying finalized receipt and program bytes.'
"$node" "$project/scripts/gate1/verify-solana-deployment.mjs"
