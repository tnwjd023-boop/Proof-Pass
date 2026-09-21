#!/usr/bin/env bash
set -euo pipefail
export PROOFPASS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
export PROOFPASS_ISSUER_ROOT="$HOME/proofpass-gate0/did-zkp-sdk-server-d1ba7410f7bebff7b743f94f6547306301e8dce7/source/did-zkp-sdk-server"
fixture="$HOME/proofpass-gate0/opendid-roundtrip"
mkdir -p "$fixture/src/main/java" "$PROOFPASS_ROOT/.local/setup"
cp "$PROOFPASS_ROOT/test/opendid/build.gradle" "$PROOFPASS_ROOT/test/opendid/settings.gradle" "$fixture/"
cp "$PROOFPASS_ROOT/test/opendid/src/main/java/OpenDidRoundTrip.java" "$fixture/src/main/java/"
cd "$PROOFPASS_ISSUER_ROOT"
bash gradlew -p "$fixture" run --no-daemon > "$PROOFPASS_ROOT/.local/setup/opendid-roundtrip.log" 2>&1
