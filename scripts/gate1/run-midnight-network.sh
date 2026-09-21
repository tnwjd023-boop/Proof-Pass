#!/usr/bin/env bash
set -euo pipefail
project="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
docker compose -f "$project/midnight/compose.yml" up -d --wait --wait-timeout 240
printf '%s\n' 'ProofPass Midnight services started. This foreground monitor keeps WSL alive.'
# WSL can shut down after the last interactive/user process exits even while
# systemd owns Docker. Keep a real foreground process; never change global WSL
# idle settings or silently destroy/recreate chain state.
exec docker events --filter label=com.docker.compose.project=proofpass-gate1 \
  --filter event=start --filter event=stop --filter event=die --filter event=oom \
  --format '{{.Time}} {{.Action}} {{.Actor.Attributes.name}}'
