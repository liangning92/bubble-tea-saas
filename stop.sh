#!/bin/bash
echo "停止 Bubble Tea POS..."
docker-compose down 2>/dev/null
pkill -f "tsx.*src/index.ts" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
echo "所有服务已停止!"