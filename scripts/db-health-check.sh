#!/bin/bash
# ==========================================
# 🧋 数据库健康检查脚本
# ==========================================

set -e

DB_PATH="/Users/liangning/Desktop/Claude_Work/bubble-tea-saas/server/prisma/dev.db"
SERVER_PORT=7072

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; }

echo "=========================================="
echo "🧋 数据库健康检查"
echo "=========================================="

# 1. 检查数据库文件是否存在
echo ""
echo "[1/5] 检查数据库文件..."
if [ -f "$DB_PATH" ]; then
    SIZE=$(ls -lh "$DB_PATH" | awk '{print $5}')
    ok "数据库文件存在 ($SIZE): $DB_PATH"
else
    fail "数据库文件不存在: $DB_PATH"
    exit 1
fi

# 2. 检查数据库是否可读
echo ""
echo "[2/5] 检查数据库可读性..."
if sqlite3 "$DB_PATH" "SELECT 1" > /dev/null 2>&1; then
    ok "数据库可读"
else
    fail "数据库无法读取（权限问题或损坏）"
    exit 1
fi

# 3. 检查必要的表是否存在
echo ""
echo "[3/5] 检查数据表..."
TABLES=$(sqlite3 "$DB_PATH" ".tables" 2>/dev/null)
for TABLE in Product Inventory User Store; do
    if echo "$TABLES" | grep -q "$TABLE"; then
        ok "表 $TABLE 存在"
    else
        fail "表 $TABLE 缺失"
    fi
done

# 4. 检查数据量
echo ""
echo "[4/5] 检查数据量..."
PRODUCTS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM Product" 2>/dev/null || echo "0")
INVENTORY=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM Inventory" 2>/dev/null || echo "0")
USERS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM User" 2>/dev/null || echo "0")
STORES=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM Store" 2>/dev/null || echo "0")

echo "  产品: $PRODUCTS"
[ "$PRODUCTS" -gt 0 ] && ok "产品数据正常" || warn "产品数据为空"
echo "  库存: $INVENTORY"
[ "$INVENTORY" -gt 0 ] && ok "库存数据正常" || warn "库存数据为空"
echo "  用户: $USERS"
[ "$USERS" -gt 0 ] && ok "用户数据正常" || fail "用户数据为空"
echo "  门店: $STORES"
[ "$STORES" -gt 0 ] && ok "门店数据正常" || fail "门店数据为空"

# 5. 检查后端服务是否运行
echo ""
echo "[5/5] 检查后端服务..."
if lsof -i :$SERVER_PORT > /dev/null 2>&1; then
    PID=$(lsof -ti :$SERVER_PORT)
    ok "后端服务运行中 (PID: $PID, Port: $SERVER_PORT)"
else
    warn "后端服务未运行在 Port $SERVER_PORT"
fi

echo ""
echo "=========================================="
echo "✅ 健康检查完成"
echo "=========================================="
