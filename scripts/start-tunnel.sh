#!/bin/bash
# Cloudflare Tunnel + ngrok 混合方案
# 问题：账号无传统 DNS Zone，无法使用 cloudflared route dns
# 解决方案：ngrok 临时暴露 + 反向代理统一入口

set -e

WORKDIR="/Users/liangning/Desktop/Claude_Work/bubble-tea-saas"
NGROK_LOG="/tmp/ngrok-tunnel.log"
PROXY_PORT=8080

echo "[1/4] 重启 tea-server, tea-admin, tea-pos..."
cd "$WORKDIR"
pm2 restart tea-server tea-admin tea-pos 2>/dev/null || pm2 start ecosystem.config.js

echo "[2/4] 等待服务启动..."
sleep 5

# 检查服务状态
if ! curl -s -o /dev/null -w "%{http_code}" http://localhost:7072/health | grep -q "200"; then
  echo "ERROR: tea-server 未正常启动"
  exit 1
fi

echo "[3/4] 启动反向代理 (端口 $PROXY_PORT)..."
# Kill existing proxy on 8080
lsof -ti :$PROXY_PORT | xargs kill 2>/dev/null || true
sleep 1

# Start reverse proxy
node -e "
const http = require('http');
const routes = {
  '/api': 'http://localhost:7072',
  '/health': 'http://localhost:7072',
  '/admin': 'http://localhost:5173',
  '/pos': 'http://localhost:6063',
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let target = 'http://localhost:7072';
  for (const [prefix, dest] of Object.entries(routes)) {
    if (url.pathname.startsWith(prefix)) { target = dest; break; }
  }
  const opts = { hostname: new URL(target).hostname, port: new URL(target).port || 80, path: url.pathname + url.search, method: req.method, headers: {...req.headers} };
  const p = http.request(opts, (pr) => { res.writeHead(pr.statusCode, pr.headers); pr.pipe(res); });
  req.pipe(p);
});
server.listen($PROXY_PORT, () => console.log('Proxy ready on :$PROXY_PORT'));
" &
PROXY_PID=$!
echo "反向代理 PID: $PROXY_PID"

sleep 2

echo "[4/4] 启动 ngrok..."
# Kill existing ngrok
pkill -f "ngrok http $PROXY_PORT" 2>/dev/null || true
sleep 1

nohup ngrok http $PROXY_PORT --log-format json --log=$NGROK_LOG > /dev/null 2>&1 &
NGROK_PID=$!
echo "ngrok PID: $NGROK_PID"

sleep 8

# 获取 ngrok URL
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$NGROK_URL" ]; then
  echo "ERROR: 无法获取 ngrok URL"
  exit 1
fi

echo ""
echo "=========================================="
echo " Tunnel 启动成功！"
echo "=========================================="
echo " tea-server: ${NGROK_URL}/health"
echo " tea-admin:  ${NGROK_URL}/admin/"
echo " tea-pos:    ${NGROK_URL}/pos/"
echo ""
echo " ngrok URL 会话 ID: $(cat ~/.ngrok/ngrok.yml 2>/dev/null | grep 'session_id' | cut -d: -f2 | tr -d ' ' || echo 'N/A')"
echo "=========================================="

# 保存 URL 到文件
echo "$NGROK_URL" > /tmp/current-ngrok-url.txt
