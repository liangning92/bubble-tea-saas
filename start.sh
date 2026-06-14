#!/bin/bash

# ==========================================
# 🧋 Bubble Tea POS System - 一键启动脚本
# ==========================================

set -e

echo "============================================"
echo "🧋 Bubble Tea POS 系统启动中..."
echo "============================================"

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_info() { echo -e "${YELLOW}→${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

if ! command_exists node; then
    log_error "Node.js 未安装，请先安装 Node.js 18+"
    exit 1
fi
log_success "Node.js: $(node --version)"

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo ""
echo "请选择启动模式:"
echo "1) Docker 模式 (推荐)"
echo "2) 本地开发模式"
echo "3) 仅启动后端"
echo "4) 退出"
echo ""
read -p "请输入选项 [1-4]: " choice

case $choice in
    1)
        if command_exists docker && command_exists docker-compose; then
            log_info "启动 Docker 模式..."
            docker-compose up -d
            sleep 3
            echo ""
            echo "🎉 服务已启动!"
            echo "📱 管理后台: http://localhost:5173"
            echo "💻 API: http://localhost:3000"
            echo "🖥️  POS收银台: http://localhost:6063"
            echo "测试账号: 081234567890 / admin123"
        else
            log_error "Docker 未安装，请选择本地开发模式"
        fi
        ;;
    2)
        log_info "启动本地开发模式..."
        cd "$PROJECT_DIR/server"
        npm install
        npx prisma generate
        npx prisma db push
        npx tsx prisma/seed.ts
        npm run dev &
        sleep 2
        cd "$PROJECT_DIR/client-admin"
        npm install
        npm run dev &
        cd "$PROJECT_DIR/client-pos"
        npm install
        npm run dev &
        echo ""
        echo "🎉 所有服务已启动!"
        echo "📱 管理后台: http://localhost:5173"
        echo "💻 API: http://localhost:3000"
        echo "🖥️  POS收银台: http://localhost:6063"
        echo "测试账号: 081234567890 / admin123"
        ;;
    3)
        cd "$PROJECT_DIR/server"
        npm install
        npx prisma generate
        npx prisma db push
        npx tsx prisma/seed.ts
        npm run dev
        ;;
    4)
        echo "再见!"
        exit 0
        ;;
esac