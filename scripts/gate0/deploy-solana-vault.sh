#!/usr/bin/env bash
set -euo pipefail
project="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
toolroot="$HOME/.local/share/proofpass/tools"
export PATH="$toolroot/solana-2.3.0/solana-release/bin:$PATH"
binary="$HOME/proofpass-gate0/solana-vault/target/deploy/gate0_vault.so"
keys="$project/.local/solana-gate0"
test -f "$binary"
test "$(solana genesis-hash --url devnet)" = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'
test "$(solana-keygen pubkey "$keys/program.json")" = 'BvFezGdFzEgKwGKntXK1acyv9tzcKowRJXy5EjFt14i8'
solana balance --keypair "$keys/payer.json" --url devnet
sha256sum "$binary"
if [ "${1:-}" != '--execute' ]; then
  echo 'Preflight only. Use --execute after funding the dedicated Devnet payer.'
  exit 0
fi
# Explicit buffer key avoids a generated recovery mnemonic appearing in CLI output.
if [ ! -f "$keys/buffer.json" ]; then
  solana-keygen new --no-bip39-passphrase --silent --outfile "$keys/buffer.json" > /dev/null
fi
# Reconcile any interrupted deployment with `solana program show` before re-running.
"$toolroot/node-v22.23.2-linux-x64/bin/node" "$project/scripts/gate0/solana-deployment-check.mjs" "$binary"
solana program deploy "$binary" --url devnet --keypair "$keys/payer.json" \
  --program-id "$keys/program.json" --buffer "$keys/buffer.json" --max-len "$(stat -c %s "$binary")" --output json \
  > "$keys/deployment.json" 2> "$keys/deployment-errors.txt"
echo 'Deployment command succeeded; run solana-payout.mjs preflight, then --execute.'
