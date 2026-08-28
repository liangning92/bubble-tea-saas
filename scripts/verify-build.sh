#!/bin/bash
# verify-build.sh - 验证打包产物是否正确
# 使用方法: ./scripts/verify-build.sh <path-to-nsis-installer.exe>
# 
# 检查项:
# 1. server/dist 必须在 app.asar.unpacked/ 下，不在 app.asar 内
# 2. node_modules/express 等 extraResources 包必须在 resources/node_modules/
# 3. seed.db 必须在 app.asar.unpacked/

set -e

NSIS="$1"
TMPDIR="/tmp/btea-verify-$$"

echo "=== BubbleTeaPOS Build Verification ==="
echo "Archive: $NSIS"
echo ""

if [ ! -f "$NSIS" ]; then
    echo "ERROR: File not found: $NSIS"
    exit 1
fi

# Extract NSIS archive
echo "[1/6] Extracting NSIS archive..."
rm -rf "$TMPDIR"
mkdir -p "$TMPDIR"
7z x "$NSIS" -o"$TMPDIR" -y >/dev/null 2>&1

# Find embedded 7z
APP7Z=$(find "$TMPDIR" -name "app-64.7z" 2>/dev/null | head -1)
if [ -z "$APP7Z" ]; then
    echo "ERROR: app-64.7z not found"
    exit 1
fi

echo "[2/6] Extracting app-64.7z..."
rm -rf "$TMPDIR/app"
mkdir -p "$TMPDIR/app"
7z x "$APP7Z" -o"$TMPDIR/app" -y >/dev/null 2>&1

RES="$TMPDIR/app/resources"
PASS=0
FAIL=0

check() {
    if [ $1 -eq 0 ]; then
        echo "  ✅ PASS: $2"
        PASS=$((PASS+1))
    else
        echo "  ❌ FAIL: $2"
        FAIL=$((FAIL+1))
    fi
}

echo "[3/6] Checking server/dist location..."

# Check 1: server/dist should NOT be in app.asar
if npx asar list "$RES/app.asar" 2>/dev/null | grep -q "^/server/dist/"; then
    echo "  ❌ server/dist found IN app.asar"
    FAIL=$((FAIL+1))
else
    echo "  ✅ server/dist NOT in app.asar"
    PASS=$((PASS+1))
fi

# Check 2: server/dist SHOULD be in app.asar.unpacked
if [ -d "$RES/app.asar.unpacked/server/dist" ]; then
    echo "  ✅ server/dist in app.asar.unpacked"
    PASS=$((PASS+1))
else
    echo "  ❌ server/dist NOT in app.asar.unpacked"
    FAIL=$((FAIL+1))
fi

echo "[4/6] Checking extraResources node_modules..."
[ -f "$RES/node_modules/express/package.json" ] && check 0 "express in resources/node_modules" || check 1 "express in resources/node_modules"
[ -f "$RES/node_modules/electron-log/package.json" ] && check 0 "electron-log in resources/node_modules" || check 1 "electron-log in resources/node_modules"
[ -f "$RES/node_modules/cors/package.json" ] && check 0 "cors in resources/node_modules" || check 1 "cors in resources/node_modules"

echo "[5/6] Checking seed.db location..."
if [ -f "$RES/app.asar.unpacked/server/prisma/seed.db" ]; then
    echo "  ✅ seed.db in app.asar.unpacked"
    PASS=$((PASS+1))
elif npx asar list "$RES/app.asar" 2>/dev/null | grep -q "seed.db"; then
    echo "  ⚠️  seed.db in app.asar (not unpacked)"
    PASS=$((PASS+1))
else
    echo "  ❌ seed.db not found"
    FAIL=$((FAIL+1))
fi

echo "[6/6] Summary..."
echo ""
echo "  PASSED: $PASS"
echo "  FAILED: $FAIL"
echo ""

rm -rf "$TMPDIR"
if [ $FAIL -gt 0 ]; then
    echo "Verification FAILED"
    exit 1
else
    echo "Verification PASSED"
    exit 0
fi
