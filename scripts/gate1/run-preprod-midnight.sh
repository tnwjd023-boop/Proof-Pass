#!/usr/bin/env bash
set -euo pipefail
export PROOFPASS_MIDNIGHT_NETWORK=preprod
exec bash "$(dirname -- "${BASH_SOURCE[0]}")/run-live-midnight.sh" "$@"
