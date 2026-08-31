
## 2026-08-31: BTPS v2026.8.208 exe 深度检查

### 检查方法
下载 v2026.8.208 exe → NSIS 解压 → app-64.7z 解压 → asar + asar.unpacked 分析

### 已确认问题（v2026.8.208，commit 7976ba9）
1. schema.prisma 缺失 → ensureSchemaUpToDate() 跳过 → 用户DB缺 executionTimes
2. get-app-version IPC handler 重复注册 → 启动崩溃
3. 无 requestSingleInstanceLock() → 多进程 + EADDRINUSE

### 已修复（1feedba + d1e6b4c）
- asarUnpack 添加 "server/prisma/schema.prisma"
- 添加 requestSingleInstanceLock() + second-instance 处理器
- 移除 updater.ts 中的重复 get-app-version

### 打包结构验证（v2026.8.208）
- server/dist: ✅ app.asar.unpacked/server/dist/
- express/cors: ✅ app.asar.unpacked/node_modules/
- query_engine-windows.dll: ✅ app.asar.unpacked/node_modules/@prisma/engines/
- seed.db: ✅ app.asar.unpacked/server/prisma/ (有 executionTimes)
- schema.prisma: ❌ 缺失（仅在 asar 内部，未解压）

### 下一步
等梁宁授权 → 触发 build-windows.yml → 构建 v2026.8.209
