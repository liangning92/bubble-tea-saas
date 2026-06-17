#!/bin/bash
# ============================================================
# Bubble Tea SaaS - 一键回滚脚本
# 使用方式: ./scripts/rollback.sh [版本标签|备份文件]
#
# 原理:
#   1. 停止当前服务
#   2. 还原代码到指定版本（git reset --hard）
#   3. 恢复数据库到最新备份
#   4. 重启服务
#
# 示例:
#   ./scripts/rollback.sh                    # 回滚到上一个 git 提交
#   ./scripts/rollback.sh v2.0.0             # 回滚到指定标签
#   ./scripts/rollback.sh backup-20260618    # 使用指定备份文件
# ============================================================

set -e

WORKDIR="/Users/liangning/Desktop/Claude_Work/bubble-tea-saas"
BACKUP_DIR="${WORKDIR}/backups"
LOG_FILE="${BACKUP_DIR}/rollback.log"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# 检查参数
if [ $# -eq 0 ]; then
    # 默认：回滚到上一个 git 提交
    TARGET="HEAD~1"
    log "回滚到上一个 git 提交..."
elif [ "$1" == "--latest-backup" ]; then
    # 使用最新数据库备份回滚（不改变代码）
    log "仅回滚数据库到最新备份..."
    
    # 停止服务
    log "停止服务..."
    cd "$WORKDIR" && pm2 stop all 2>/dev/null || true
    
    # 找到最新备份
    LATEST_BACKUP=$(ls -t "${BACKUP_DIR}"/bubble-tea-db-*.db 2>/dev/null | head -1)
    if [ -z "$LATEST_BACKUP" ]; then
        error "没有找到数据库备份！"
    fi
    
    # 恢复数据库
    DB_PATH="${WORKDIR}/server/prisma/dev.db"
    log "恢复数据库: $LATEST_BACKUP → $DB_PATH"
    cp "$LATEST_BACKUP" "$DB_PATH"
    
    # 重启服务
    log "重启服务..."
    cd "$WORKDIR" && pm2 start ecosystem.config.js
    
    log "✅ 数据库回滚完成！"
    exit 0
else
    TARGET="$1"
    log "回滚到: $TARGET"
fi

# ============================================================
# 完整回滚流程（代码 + 数据库）
# ============================================================

# 1. 停止服务
log "停止所有服务..."
cd "$WORKDIR" && pm2 stop all 2>/dev/null || true

# 2. 保存当前代码状态（以防需要恢复）
CURRENT_COMMIT=$(git -C "$WORKDIR" rev-parse HEAD --short 2>/dev/null || echo "unknown")
log "当前版本: $CURRENT_COMMIT"
echo "回滚前版本: $CURRENT_COMMIT" >> "${BACKUP_DIR}/rollback-history.txt"

# 3. 回滚 git 代码
log "执行 git reset --hard $TARGET..."
git -C "$WORKDIR" reset --hard "$TARGET" 2>&1 | tail -3

NEW_COMMIT=$(git -C "$WORKDIR" rev-parse HEAD --short)
log "已回滚到版本: $NEW_COMMIT"

# 4. 找到最新的数据库备份
LATEST_BACKUP=$(ls -t "${BACKUP_DIR}"/bubble-tea-db-*.db 2>/dev/null | head -1)
if [ -z "$LATEST_BACKUP" ]; then
    warn "没有找到数据库备份，跳过数据库恢复"
else
    log "恢复数据库: $LATEST_BACKUP"
    cp "$LATEST_BACKUP" "${WORKDIR}/server/prisma/dev.db"
fi

# 5. 重新安装依赖（如果 package.json 变了）
if [ -f "${WORKDIR}/server/package.json" ]; then
    log "检查 server 依赖..."
    cd "${WORKDIR}/server" && npm install --silent 2>&1 | tail -2
fi

# 6. 重启服务
log "重启 pm2 服务..."
cd "$WORKDIR" && pm2 start ecosystem.config.js
sleep 5

# 7. 验证服务健康
log "验证服务状态..."
HEALTH=$(curl -s http://localhost:7072/health 2>/dev/null | grep -o '"status":"ok"' || echo "")
if [ -n "$HEALTH" ]; then
    log "✅ 回滚完成！服务正常运行"
    pm2 status
else
    error "服务健康检查失败，请手动检查！"
fi

# 8. 记录回滚历史
echo "回滚完成: $(date) | $CURRENT_COMMIT → $NEW_COMMIT | 备份: ${LATEST_BACKUP:-none}" >> "${BACKUP_DIR}/rollback-history.txt"
log "回滚历史已记录"
