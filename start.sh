#!/bin/bash
# ==========================================
# 🧋 Bubble Tea POS System - 一键启动脚本
# ==========================================

set -e

echo "============================================"
echo "🧋 Bubble Tea POS 系统启动中..."
echo "============================================"

command_exists() { command -v "$1" >/dev/null 2>&1; }

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_info() { echo -e "${YELLOW}→${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
DB_PATH="$PROJECT_DIR/server/prisma/dev.db"
DB_HEALTH="$PROJECT_DIR/scripts/db-health-check.sh"

# ==========================================
# 数据库健康检查
# ==========================================
run_db_check() {
    echo ""
    echo "============================================"
    echo "🔍 数据库健康检查..."
    echo "============================================"

    # 检查数据库文件是否存在
    if [ ! -f "$DB_PATH" ]; then
        log_error "数据库文件不存在: $DB_PATH"
        exit 1
    fi
    log_success "数据库文件存在: $DB_PATH ($(ls -lh "$DB_PATH" | awk '{print $5}'))"

    # 检查表是否存在
    TABLES=$(sqlite3 "$DB_PATH" ".tables" 2>/dev/null)
    for TABLE in Product Inventory User Store; do
        if echo "$TABLES" | grep -q "$TABLE"; then
            log_success "表 $TABLE 存在"
        else
            log_error "表 $TABLE 缺失"
            exit 1
        fi
    done

    # 检查数据量
    PRODUCTS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM Product" 2>/dev/null || echo "0")
    INVENTORY=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM Inventory" 2>/dev/null || echo "0")
    USERS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM User" 2>/dev/null || echo "0")
    STORES=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM Store" 2>/dev/null || echo "0")

    echo "  产品: $PRODUCTS | 库存: $INVENTORY | 用户: $USERS | 门店: $STORES"

    if [ "$PRODUCTS" -eq 0 ] || [ "$USERS" -eq 0 ]; then
        log_error "数据库数据异常，请先运行 seed"
        exit 1
    fi
    log_success "数据库数据正常"
}

# ==========================================
# 检查并修复 .env DATABASE_URL
# ==========================================
fix_env() {
    ENV_FILE="$PROJECT_DIR/server/.env"
    if [ -f "$ENV_FILE" ]; then
        if grep -q 'DATABASE_URL="file:\./' "$ENV_FILE"; then
            log_info "检测到 .env 使用相对路径，修复为绝对路径..."
            sed -i '' 's|DATABASE_URL="file:\./prisma/dev\.db"|DATABASE_URL="file:'"$DB_PATH"'"|g' "$ENV_FILE"
            log_success ".env DATABASE_URL 已修复为绝对路径"
        elif grep -q 'DATABASE_URL="file:/' "$ENV_FILE"; then
            log_success ".env DATABASE_URL 已是绝对路径"
        fi
    fi
}

# ==========================================
# PM2 管理服务
# ==========================================
start_with_pm2() {
    if ! command_exists pm2; then
        log_error "PM2 未安装，请运行: npm install -g pm2"
        exit 1
    fi

    log_info "使用 PM2 启动服务..."

    # 确保 ecosystem.config.js 存在
    if [ ! -f "$PROJECT_DIR/ecosystem.config.js" ]; then
        log_error "ecosystem.config.js 不存在"
        exit 1
    fi

    cd "$PROJECT_DIR"

    # 停止旧进程（保留配置）
    pm2 stop all 2>/dev/null || true
    log_info "PM2 重启所有服务..."

    # 启动服务
    pm2 start ecosystem.config.js

    # 等待服务启动
    sleep 3

    # 验证端口
    for PORT in 7072 5173 6063; do
        if lsof -i :$PORT > /dev/null 2>&1; then
            PID=$(lsof -ti :$PORT)
            log_success "Port $PORT (PID: $PID) ✅"
        else
            log_error "Port $PORT 未启动 ❌"
        fi
    done

    # 保存 PM2 配置（开机自启）
    pm2 save
    log_success "PM2 配置已保存（开机自启）"
}

# ==========================================
# 启动选项
# ==========================================
if ! command_exists node; then
    log_error "Node.js 未安装，请先安装 Node.js 18+"
    exit 1
fi
log_success "Node.js: $(node --version)"

# 自动检查数据库（不带参数时执行）
if [ $# -eq 0 ]; then
    run_db_check
    echo ""
    echo "请选择启动模式:"
    echo "1) PM2 模式 (推荐 - 自动管理进程，开机自启)"
    echo "2) PM2 重启所有服务"
    echo "3) 仅检查数据库状态"
    echo "4) 退出"
    echo ""
    read -p "请输入选项 [1-4]: " choice
else
    choice=$1
fi

case $choice in
    1|2)
        fix_env
        run_db_check
        start_with_pm2
        echo ""
        echo "🎉 服务已启动!"
        echo "📱 管理后台: http://localhost:5173"
        echo "💻 API: http://localhost:7072"
        echo "🖥️  POS收银台: http://localhost:6063"
        echo "测试账号: 081234567890 / admin123"
        echo ""
        echo "查看状态: pm2 status"
        echo "查看日志: pm2 logs"
        ;;
    3)
        run_db_check
        ;;
    4|*)
        echo "再见!"
        exit 0
        ;;
esac
