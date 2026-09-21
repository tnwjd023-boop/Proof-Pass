#!/usr/bin/env bash
set -euo pipefail
if [ "$(id -u)" -eq 0 ]; then
  printf '%s\n' 'Run as the normal Ubuntu user, not root.' >&2
  exit 1
fi
project="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
mkdir -p "$project/.local/setup"
buildroot=${HOME}/proofpass-gate0
commit=d1ba7410f7bebff7b743f94f6547306301e8dce7
destination="$buildroot/did-zkp-sdk-server-$commit"
mkdir -p "$buildroot"
if [ ! -d "$destination" ]; then
  mkdir "$destination"
  git -c safe.directory="$project/.external/did-zkp-sdk-server" -C "$project/.external/did-zkp-sdk-server" archive "$commit" | tar -x -C "$destination"
fi
cd "$destination/source/did-zkp-sdk-server"
bash ./gradlew --version > "$project/.local/setup/opendid-linux-wrapper-version.log" 2>&1
set +e
bash ./gradlew clean build --no-daemon > "$project/.local/setup/opendid-linux-build.log" 2>&1
result=$?
set -e
tail -n 35 "$project/.local/setup/opendid-linux-build.log"
exit "$result"
