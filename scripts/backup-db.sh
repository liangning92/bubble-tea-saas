#!/bin/bash
# Bubble Tea SaaS - 数据库备份脚本
# 使用方式: ./scripts/backup-db.sh

DB_PATH="/Users/liangning/Desktop/Claude_Work/bubble-tea-saas/server/prisma/dev.db"
BACKUP_DIR="/Users/liangning/Desktop/Claude_Work/bubble-tea-saas/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/bubble-tea-db-${DATE}.db"

# 检查源数据库
if [ ! -f "$DB_PATH" ]; then
    echo "[$(date)] ❌ 数据库不存在: $DB_PATH" >> "${BACKUP_DIR}/backup.log"
    exit 1
fi

# 创建备份
cp "$DB_PATH" "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "[$(date)] ✅ 备份成功: $BACKUP_FILE (${SIZE})" >> "${BACKUP_DIR}/backup.log"
    
    # 只保留最近 30 个备份
    cd "$BACKUP_DIR" || exit
    ls -t bubble-tea-db-*.db 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null
    echo "[$(date)] 备份完成，已清理旧文件，保留最近30个"
else
    echo "[$(date)] ❌ 备份失败" >> "${BACKUP_DIR}/backup.log"
    exit 1
fi
