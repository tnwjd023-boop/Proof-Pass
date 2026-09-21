#!/usr/bin/env bash
set -euo pipefail
umask 077
export PROOFPASS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
export PROOFPASS_ISSUER_ROOT="$HOME/proofpass-gate0/did-zkp-sdk-server-d1ba7410f7bebff7b743f94f6547306301e8dce7/source/did-zkp-sdk-server"
fixture="$HOME/proofpass-gate1/opendid-binding"
if [ "${1:-}" = build ]; then
  mkdir -p "$fixture/src/main/java" "$PROOFPASS_ROOT/.local/gate1"
  cp "$PROOFPASS_ROOT/test/opendid/build.gradle" "$PROOFPASS_ROOT/test/opendid/settings.gradle" "$fixture/"
  cp "$PROOFPASS_ROOT/test/opendid/src/main/java/"*.java "$fixture/src/main/java/"
  cd "$PROOFPASS_ISSUER_ROOT"
  bash gradlew -p "$fixture" installDist --no-daemon > "$PROOFPASS_ROOT/.local/gate1/opendid-build.log" 2>&1
  echo 'OpenDID binding CLI built.'
else
  library="$(find "$fixture/build/install" -type d -name lib -print -quit)"
  test -n "$library"
  exec java -cp "$library/*" OpenDidBinding "$@"
fi
