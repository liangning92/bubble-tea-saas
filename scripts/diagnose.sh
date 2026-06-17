#!/bin/bash
# Bubble Tea SaaS - 诊断脚本
# 使用: ./scripts/diagnose.sh

echo "============================================================"
echo "🥤 Bubble Tea SaaS 诊断报告 - $(date)"
echo "============================================================"

echo ""
echo "【服务状态】"
pm2 status

echo ""
echo "【服务端口】"
lsof -i :7072 -i :5173 -i :6063 2>/dev/null | grep LISTEN || echo "所有端口空闲"

echo ""
echo "【数据库备份】"
ls -lh /Users/liangning/Desktop/Claude_Work/bubble-tea-saas/backups/bubble-tea-db-*.db 2>/dev/null | tail -3

echo ""
echo "【最新错误日志 (tea-server)】"
tail -5 /Users/liangning/Desktop/Claude_Work/bubble-tea-saas/logs/tea-server-err.log 2>/dev/null

echo ""
echo "【API 健康检查】"
curl -s http://localhost:7072/health | python3 -m json.tool 2>/dev/null || echo "Server 无响应"

echo ""
echo "【Dashboard】"
curl -s -o /dev/null -w "Admin: %{http_code}\n" http://localhost:5173
curl -s -o /dev/null -w "POS: %{http_code}\n" http://localhost:6063

echo ""
echo "【磁盘空间】"
df -h / | tail -1

echo ""
echo "【PM2 内存使用】"
pm2 top -o mem -s 1 --nostream 2>/dev/null | head -10 || pm2 status

echo "============================================================"
