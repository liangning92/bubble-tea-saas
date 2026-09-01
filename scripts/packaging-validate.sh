#!/bin/bash
# ============================================================
# Bubble Tea POS - 打包前全面验证脚本
# ============================================================
# 每次打包前（npm run electron:build）必须运行
# 发现 ❌ 必须修复后才能打包
# ============================================================

set -e

CONFIG="electron-builder.json"
SERVER="server"
CLIENT_POS="client-pos"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

info() { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()   { echo -e "${GREEN}[PASS]${NC} $1"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}[FAIL]${NC} $1"; FAIL=$((FAIL+1)); }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; WARN=$((WARN+1)); }

echo ""
echo "================================================"
echo "  🧋 Bubble Tea POS - 打包前全面验证"
echo "================================================"
echo ""

cd "$PROJECT_ROOT"

# ─────────────────────────────────────────
# 1. electron-builder.json 关键配置检查
# ─────────────────────────────────────────
info "1. 检查 electron-builder.json"

if [ ! -f "$CONFIG" ]; then
    fail "electron-builder.json 不存在"
else
    ok "electron-builder.json 存在"

    # 1a. asarUnpack 无前导 / (glob 模式不能有前导 /)
    UNPACK_PATTERNS=$(cat $CONFIG | python3 -c "import json,sys; d=json.load(sys.stdin); print('\n'.join(d.get('asarUnpack',[])))" 2>/dev/null || echo "")
    if echo "$UNPACK_PATTERNS" | grep -q "^/"; then
        fail "asarUnpack patterns 有前导 / (glob 模式不支持)"
        echo "        当前: $(echo "$UNPACK_PATTERNS" | grep "^/" | head -3)"
    else
        ok "asarUnpack patterns 无前导 / (glob 语法正确)"
    fi

    # 1b. files[] 包含 dist-electron
    if grep -q "client-pos/dist-electron" "$CONFIG"; then
        ok "files[] 包含 client-pos/dist-electron"
    else
        fail "files[] 缺少 client-pos/dist-electron"
    fi

    # 1c. files[] 包含 server/dist
    if grep -q "server/dist" "$CONFIG"; then
        ok "files[] 包含 server/dist"
    else
        fail "files[] 缺少 server/dist"
    fi

    # 1d. 无效的 dist-electron/**/* (根目录不存在)
    if grep -q '"dist-electron/\*\*/\*"' "$CONFIG" && [ ! -d "dist-electron" ]; then
        fail "files[] 包含无效的 dist-electron/**/* (目录不存在)"
    else
        ok "files[] 无死代码 pattern"
    fi

    # 1e. seed.db 在 files 和 asarUnpack 中
    if grep -q "seed.db" <<< "$(cat $CONFIG | python3 -c "import json,sys; d=json.load(sys.stdin); print('\n'.join(d.get('files',[])))")"; then
        ok "seed.db 在 files[] 中"
    else
        fail "seed.db 不在 files[] 中"
    fi
fi

echo ""

# ─────────────────────────────────────────
# 2. Prisma 引擎检查（最关键！）
# ─────────────────────────────────────────
info "2. Prisma 引擎二进制文件"

PRISMA_SCHEMA="$SERVER/prisma/schema.prisma"
if [ -f "$PRISMA_SCHEMA" ]; then
    if grep -q "windows" "$PRISMA_SCHEMA"; then
        ok "schema.prisma binaryTargets 包含 windows"
    else
        fail "schema.prisma binaryTargets 缺少 windows"
    fi
else
    fail "schema.prisma 不存在"
fi

# 检查 .prisma/client 是否包含引擎文件
PRISMA_ENGINE=""
for f in node_modules/.prisma/client/libquery_engine-*.node; do
    if [ -f "$f" ]; then
        PRISMA_ENGINE="$f"
        break
    fi
done

if [ -n "$PRISMA_ENGINE" ]; then
    ok "Prisma 引擎文件存在: $(basename $PRISMA_ENGINE)"
else
    warn "本地未生成 Prisma 引擎（需在 Windows 上生成）"
fi

# 检查 extraResources 是否包含 prisma 相关
if grep -q "\.prisma/client" "$CONFIG" || grep -q "prisma" "$CONFIG"; then
    ok "electron-builder.json 包含 Prisma 相关配置"
else
    fail "electron-builder.json 缺少 Prisma 相关配置"
fi

echo ""

# ─────────────────────────────────────────
# 3. 编译产物检查
# ─────────────────────────────────────────
info "3. 编译产物"

if [ -d "$CLIENT_POS/dist-electron/electron" ]; then
    ELECTRON_MAIN="$CLIENT_POS/dist-electron/electron/main.js"
    if [ -f "$ELECTRON_MAIN" ]; then
        ok "electron/main.js 存在"
    else
        fail "electron/main.js 不存在（需运行 npm run electron:compile）"
    fi
else
    fail "client-pos/dist-electron/electron/ 目录不存在"
fi

if [ -d "$CLIENT_POS/dist" ]; then
    if [ -f "$CLIENT_POS/dist/index.html" ]; then
        ok "client-pos/dist/index.html 存在"
    else
        fail "client-pos/dist/index.html 不存在（需运行 npm run build:pos）"
    fi
else
    fail "client-pos/dist/ 不存在"
fi

if [ -d "$SERVER/dist" ]; then
    if [ -f "$SERVER/dist/index.js" ]; then
        ok "server/dist/index.js 存在"
    else
        fail "server/dist/index.js 不存在（需运行 npm run build:server）"
    fi
else
    fail "server/dist/ 不存在"
fi

echo ""

# ─────────────────────────────────────────
# 4. buildResources 检查
# ─────────────────────────────────────────
info "4. buildResources"

BUILD_DIR=""
for d in "build" "$CLIENT_POS/build" "$PROJECT_ROOT/build"; do
    if [ -d "$d" ]; then BUILD_DIR="$d"; break; fi
done

if [ -n "$BUILD_DIR" ]; then
    ok "buildResources 目录存在: $BUILD_DIR"
else
    warn "buildResources 目录不存在（无自定义图标，使用 Electron 默认）"
fi

echo ""

# ─────────────────────────────────────────
# 5. NSIS installer.nsh 检查
# ─────────────────────────────────────────
info "5. NSIS installer.nsh"

INSTALLER_NSH=""
for f in "client-pos/installer.nsh" "$PROJECT_ROOT/installer.nsh"; do
    if [ -f "$f" ]; then INSTALLER_NSH="$f"; break; fi
done

if [ -n "$INSTALLER_NSH" ]; then
    ok "installer.nsh 存在"

    # 检查快捷方式是否指向正确
    if grep -q 'BubbleTeaPOS\.exe\|BubbleTeaPOS\.lnk' "$INSTALLER_NSH"; then
        ok "installer.nsh 包含应用程序快捷方式"
    else
        warn "installer.nsh 可能缺少应用程序快捷方式（只有日志快捷方式）"
    fi
else
    warn "installer.nsh 不存在（使用默认 NSIS 配置）"
fi

echo ""

# ─────────────────────────────────────────
# 6. server/src 安全问题检查（快速扫描）
# ─────────────────────────────────────────
info "6. server 安全快速扫描"

# 6a. passwordHash 不应返回给客户端
if grep -rn "passwordHash.*user\|user.*passwordHash" "$SERVER/src/routes/auth.ts" 2>/dev/null | grep -v "//\|^\s*//"; then
    fail "auth.ts 仍可能返回 passwordHash 给客户端！"
else
    ok "auth.ts 未发现 passwordHash 泄露"
fi

# 6b. requireStoreAccess 是否被使用
if grep -rn "requireStoreAccess" "$SERVER/src/routes/" 2>/dev/null | grep -v "//\|^\s*//"; then
    ok "requireStoreAccess 已使用"
else
    warn "requireStoreAccess 中间件未在路由中使用"
fi

# 6c. JWT secret fallback
if grep -q "dev-only-secret" "$SERVER/src/config/env.ts"; then
    warn "JWT secret 使用了弱 fallback secret"
else
    ok "JWT secret 配置正常"
fi

echo ""

# ─────────────────────────────────────────
# 7. package.json 检查
# ─────────────────────────────────────────
info "7. package.json"

if [ -f "package.json" ]; then
    MAIN_FIELD=$(cat package.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('main',''))")
    if [ "$MAIN_FIELD" = "client-pos/dist-electron/electron/main.js" ]; then
        ok "main field 正确"
    else
        warn "main field: $MAIN_FIELD (期望 client-pos/dist-electron/electron/main.js)"
    fi

    ELECTRON_BUILD_SCRIPT=$(cat package.json | python3 -c "import json,sys; d=json.load(sys.stdin); scripts=d.get('scripts',{}); print(scripts.get('electron:build',''))")
    if [ -n "$ELECTRON_BUILD_SCRIPT" ]; then
        ok "electron:build script 存在"
    else
        warn "electron:build script 不存在"
    fi
fi

echo ""

# ─────────────────────────────────────────
# 总结
# ─────────────────────────────────────────
echo "================================================"
echo "  验证结果"
echo "================================================"
echo -e "  ${GREEN}通过: $PASS${NC}"
echo -e "  ${RED}失败: $FAIL${NC}"
echo -e "  ${YELLOW}警告: $WARN${NC}"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}❌ 必须修复 $FAIL 个问题后才能打包${NC}"
    exit 1
elif [ "$WARN" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  有 $WARN 个警告，建议修复后再打包${NC}"
    exit 0
else
    echo -e "${GREEN}✅ 可以打包${NC}"
    exit 0
fi
