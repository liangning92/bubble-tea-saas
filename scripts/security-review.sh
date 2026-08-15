#!/bin/bash
# ============================================================
# Bubble Tea POS - 安全审查脚本
# ============================================================
# 对应文档：docs/SECURITY-REVIEW-CHECKLIST.md
# 每次修改安全相关代码后必须运行
# ============================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

ok()   { echo -e "${GREEN}[PASS]${NC} $1"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}[FAIL]${NC} $1"; FAIL=$((FAIL+1)); }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; WARN=$((WARN+1)); }

echo ""
echo "================================================"
echo "  🔒 Bubble Tea POS - 安全审查"
echo "================================================"
echo ""

# ─────────────────────────────────────────
# 1.1 密码安全
# ─────────────────────────────────────────
echo "━━━ 1.1 密码安全 ━━━"

# 检查 passwordHash 是否泄露
if grep -rn "passwordHash.*user\|user.*passwordHash\|passwordHash:.*user" \
    server/src/routes/auth.ts \
    server/src/services/AuthService.ts \
    2>/dev/null | grep -v "//\|^\s*//\|console"; then
    fail "发现 passwordHash 泄露！"
    grep -rn "passwordHash.*user\|user.*passwordHash\|passwordHash:.*user" \
        server/src/routes/auth.ts server/src/services/AuthService.ts 2>/dev/null
else
    ok "auth.ts / AuthService.ts 无 passwordHash 泄露"
fi

# 检查 res.json 响应中是否包含 passwordHash（真正的泄露）
PASSWORD_LEAK=$(grep -rn "passwordHash" server/src/routes/ 2>/dev/null | grep -v ".map\|//\|^\s*//" | grep "res\.json\|return.*{.*passwordHash\|send.*passwordHash" || echo "")
if [ -n "$PASSWORD_LEAK" ]; then
    fail "发现 passwordHash 在 API 响应中！"
    echo "$PASSWORD_LEAK"
else
    ok "API 响应无 passwordHash"
fi

# bcrypt rounds
if grep -rn "bcrypt.*hash\|bcryptjs" server/src/ 2>/dev/null | grep -v node_modules | head -3 | grep -q "10\|12"; then
    ok "bcrypt 使用合理 rounds"
fi

echo ""

# ─────────────────────────────────────────
# 1.2 JWT 配置
# ─────────────────────────────────────────
echo "━━━ 1.2 JWT 配置 ━━━"

if grep -q "dev-only-secret" server/src/config/env.ts; then
    warn "JWT secret 使用了弱 fallback"
else
    ok "JWT secret 配置正常"
fi

if grep -q "JWT_SECRET" server/src/config/env.ts; then
    ok "JWT_SECRET 从环境变量读取"
else
    warn "未找到 JWT_SECRET 环境变量引用"
fi

echo ""

# ─────────────────────────────────────────
# 1.3 权限控制 - requireStoreAccess
# ─────────────────────────────────────────
echo "━━━ 1.3 门店数据隔离 ━━━"

# 检查 requireStoreAccess 是否在路由中使用
STORE_ACCESS_USE=$(grep -rln "requireStoreAccess" server/src/routes/ 2>/dev/null | grep -v ".map" || echo "")
if [ -n "$STORE_ACCESS_USE" ]; then
    ok "requireStoreAccess 已在路由中使用: $STORE_ACCESS_USE"
else
    warn "requireStoreAccess 中间件未在路由中使用"
fi

# 检查是否有手动 storeId 拼接但无校验的模式
MANUAL_STORE_ID=$(grep -rn "req.query.storeId.*req.user" server/src/routes/ 2>/dev/null | grep -v ".map\|requireStoreAccess" || echo "")
if [ -n "$MANUAL_STORE_ID" ]; then
    warn "发现手动 storeId 拼接，可能绕过门店隔离"
    echo "    $MANUAL_STORE_ID"
else
    ok "未发现危险的 storeId 手动拼接"
fi

echo ""

# ─────────────────────────────────────────
# 1.4 注册角色控制
# ─────────────────────────────────────────
echo "━━━ 1.4 注册与角色分配 ━━━"

# 检查 register 接口是否有角色限制
if grep -A 20 "auth/register" server/src/routes/auth.ts 2>/dev/null | grep -q "admin\|manager.*role\|role.*admin"; then
    ok "register 可能有角色控制"
else
    warn "register 接口可能缺少角色限制"
fi

# 检查 role 枚举一致性
AUTH_MIDDLEWARE_ROLES=$(grep -A 3 "type Role\|Role =" server/src/middlewares/auth.ts 2>/dev/null | head -5)
AUTH_ROUTE_ROLES=$(grep "z\.enum" server/src/routes/auth.ts 2>/dev/null | head -3)
if [ -n "$AUTH_MIDDLEWARE_ROLES" ]; then
    echo "    middleware Role: $AUTH_MIDDLEWARE_ROLES"
fi

echo ""

# ─────────────────────────────────────────
# 2.1 敏感字段过滤
# ─────────────────────────────────────────
echo "━━━ 2.1 敏感字段过滤 ━━━"

# 检查 filterSensitiveFields 或 bomCost 过滤
if grep -q "bomCost" server/src/middlewares/auth.ts; then
    ok "bomCost 在 filterSensitiveFields 中处理"
else
    warn "未找到 bomCost 过滤逻辑"
fi

# 检查订单路由是否返回 bomCost
BOM_IN_ORDERS=$(grep -rn "bomCost" server/src/routes/order.ts 2>/dev/null | grep -v ".map\|//\|select\|include" | head -5)
if [ -n "$BOM_IN_ORDERS" ]; then
    warn "订单路由中发现 bomCost 引用:"
    echo "    $BOM_IN_ORDERS"
else
    ok "订单路由无明显 bomCost 泄露"
fi

echo ""

# ─────────────────────────────────────────
# 3.2 SQL 注入
# ─────────────────────────────────────────
echo "━━━ 3.2 SQL 注入 ━━━"

if grep -rn "eval\|new Function\|executeSql\|query.*\+" server/src/routes/ server/src/services/ 2>/dev/null | grep -v ".map\|node_modules\|//"; then
    fail "发现潜在 SQL 注入或动态代码执行！"
else
    ok "未发现 eval/new Function/字符串拼接 SQL"
fi

echo ""

# ─────────────────────────────────────────
# 3.3 文件上传
# ─────────────────────────────────────────
echo "━━━ 3.3 文件上传 ━━━"

if [ -f "server/src/routes/upload.ts" ]; then
    if grep -q "fileFilter\|mimetype\|allowedMimes" server/src/routes/upload.ts; then
        ok "upload.ts 有文件类型过滤"
    else
        warn "upload.ts 可能缺少文件类型过滤"
    fi

    if grep -q "uuidv4\|filename.*random\|unique" server/src/routes/upload.ts; then
        ok "上传文件使用随机文件名"
    else
        warn "上传文件可能未随机化命名"
    fi
else
    warn "upload.ts 不存在"
fi

echo ""

# ─────────────────────────────────────────
# 4.1 速率限制
# ─────────────────────────────────────────
echo "━━━ 4.1 速率限制 ━━━"

if grep -q "rateLimit\|express-rate-limit" server/src/routes/auth.ts; then
    ok "auth 路由有 rateLimit"
else
    warn "auth 路由可能缺少 rateLimit"
fi

echo ""

# ─────────────────────────────────────────
# 4.2 CORS
# ─────────────────────────────────────────
echo "━━━ 4.2 CORS ━━━"

if grep -q "origin.*\*\|cors.*\*" server/src/index.ts 2>/dev/null; then
    fail "CORS 配置使用了通配符 *"
else
    ok "CORS 未使用通配符"
fi

if grep -q "CORS_ORIGIN" server/src/config/env.ts; then
    ok "CORS origin 从环境变量读取"
else
    warn "CORS_ORIGIN 可能未配置"
fi

echo ""

# ─────────────────────────────────────────
# 5.1 Electron 安全
# ─────────────────────────────────────────
echo "━━━ 5.1 Electron 安全 ━━━"

if [ -f "client-pos/electron/main.ts" ]; then
    if grep -q "contextIsolation.*true" client-pos/electron/main.ts; then
        ok "contextIsolation: true"
    else
        warn "contextIsolation 未设置"
    fi

    if grep -q "nodeIntegration.*false" client-pos/electron/main.ts; then
        ok "nodeIntegration: false"
    else
        warn "nodeIntegration 未设置为 false"
    fi
fi

echo ""

# ─────────────────────────────────────────
# 5.2 XSS
# ─────────────────────────────────────────
echo "━━━ 5.2 XSS ━━━"

if grep -rn "innerHTML\|dangerouslySetInnerHTML" \
    client-admin/src client-pos/src client-staff/src \
    2>/dev/null | grep -v node_modules | grep -v "//.*innerHTML"; then
    warn "发现 innerHTML 使用，请确认无用户数据注入"
else
    ok "未发现危险的 innerHTML 使用"
fi

echo ""

# ─────────────────────────────────────────
# 8.1 数据库密钥
# ─────────────────────────────────────────
echo "━━━ 8.1 密钥管理 ━━━"

if [ -f ".env" ] && grep -q "JWT_SECRET\|DATABASE_URL" .env; then
    if grep -q "\.gitignore" .env 2>/dev/null || git check-ignore .env 2>/dev/null; then
        ok ".env 已被 .gitignore 排除"
    else
        warn ".env 可能未被 .gitignore 排除"
    fi
fi

if grep -rn "JWT_SECRET.*=\|secret.*=.*'" server/src/ 2>/dev/null | grep -v ".map\|//\|node_modules" | grep -q "'dev\|secret-don"; then
    warn "发现可能的硬编码密钥"
fi

echo ""

# ─────────────────────────────────────────
# 总结
# ─────────────────────────────────────────
echo "================================================"
echo "  🔒 安全审查结果"
echo "================================================"
echo -e "  ${GREEN}通过: $PASS${NC}"
echo -e "  ${RED}失败: $FAIL${NC}"
echo -e "  ${YELLOW}警告: $WARN${NC}"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}❌ 必须修复 $FAIL 个安全问题${NC}"
    echo "   对应清单：docs/SECURITY-REVIEW-CHECKLIST.md"
    exit 1
elif [ "$WARN" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  有 $WARN 个警告，建议处理${NC}"
    exit 0
else
    echo -e "${GREEN}✅ 安全审查通过${NC}"
    exit 0
fi
