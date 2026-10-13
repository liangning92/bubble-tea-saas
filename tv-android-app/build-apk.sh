#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/sync-tv-player.cjs
cd tv-android-app
: "${TV_KEYSTORE_FILE:?Set persistent release keystore}"
: "${TV_VERSION_CODE:?Set monotonic Android version code}"
: "${TV_VERSION_NAME:?Set release version}"
: "${SOURCE_SHA:?Set exact verified source SHA}"
./gradlew --no-daemon assembleRelease
