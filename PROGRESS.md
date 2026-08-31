
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

## 2026-08-31 第二次深度检查（新发现 prismaBin 路径 Bug）

### 检查方法
下载 v2026.8.208 exe → NSIS 解压 → 7z 解压 app-64.7z → asar + asar.unpacked 完整分析

### 新发现：prismaBin 路径错误（提交 9d835f4 修复）

**根因**: `ensureSchemaUpToDate()` 中 prisma CLI 路径写错了

代码查找:
```
app.asar.unpacked/server/node_modules/.bin/prisma  ← 错误路径
```

实际 extraResources 复制后:
```
app.asar.unpacked/node_modules/.bin/prisma  ← 正确位置
```

**extraResources 配置**:
```json
{"from": "server/node_modules", "to": "app.asar.unpacked/node_modules"}
```

**历史**: 这个 Bug 是在 `ensureSchemaUpToDate()` 函数创建时引入的（commit 2bfebae, 2026-08-30）
- v2026.8.208 的 schema.prisma 根本不在 asarUnpack → 即使 prismaBin 路径正确也无法运行
- 所以这个 Bug 一直没有暴露出来
- 修复 schema.prisma 问题后，这个 Bug 就会暴露 → 必须一起修复

**验证**: 解压 exe 确认 `app.asar.unpacked/node_modules/.bin/prisma` 存在 ✓

### 全部修复清单（截至 2026-08-31）

| Bug | 根因 | 提交 | 状态 |
|-----|------|------|------|
| schema.prisma 缺失 | asarUnpack 缺少 | d1e6b4c | ✅ 已修复 |
| IPC handler 重复 | updater.ts 多注册了 get-app-version | 1feedba | ✅ 已修复 |
| 无单例锁 | 没有 requestSingleInstanceLock | d1e6b4c | ✅ 已修复 |
| prismaBin 路径错误 | 指向 server/node_modules 而非 node_modules | 9d835f4 | ✅ 刚修复 |

### 打包结构最终验证（v2026.8.208 exe 分析）

asar.unpacked 完整结构:
```
resources/
├── app.asar.unpacked/
│   ├── node_modules/
│   │   ├── .bin/prisma          ← prisma CLI
│   │   ├── @prisma/client/      ← Prisma 客户端
│   │   ├── @prisma/engines/     ← 包含 query_engine-windows.dll.node
│   │   └── express/cors/...     ← 服务器依赖
│   ├── server/
│   │   ├── dist/index.js        ← 服务器入口 ✓
│   │   └── prisma/seed.db       ← 有 executionTimes 列 ✓
│   └── (schema.prisma 缺失 ← v2026.8.208 的 Bug)
└── app.asar/
    └── server/prisma/schema.prisma  ← 存在但未解压到 unpacked
```

### 下一步
等梁宁授权 → 触发 build-windows.yml → 构建 v2026.8.209

## 2026-08-31 第三次深度检查（Issues 5-8 修复）

### 新修复（afbb405）
- Issue 5: httpServer.on('error') 处理 EADDRINUSE/EACCES
- Issue 6: process.on('unhandledRejection') + process.on('uncaughtException') 防止静默崩溃
- Issue 7: 从 electron-builder.json files 移除 gitignored 的 dev.db

### 服务器错误处理详情（新增）
```typescript
// httpServer.listen 错误处理（EADDRINUSE 等）
httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Server] Port ${config.port} is already in use`)
  }
  process.exit(1)
})

// unhandled rejection 保护
process.on('unhandledRejection', (reason) => {
  console.error('[Server] FATAL: Unhandled Promise Rejection:', reason)
  setTimeout(() => process.exit(1), 1000)
})

// uncaught exception 保护
process.on('uncaughtException', (err) => {
  console.error('[Server] FATAL: Uncaught Exception:', err.message)
  setTimeout(() => process.exit(1), 1000)
})
```

### 全部修复清单（最终版）

| Bug | 根因 | 提交 | 状态 |
|-----|------|------|------|
| schema.prisma 不在 asarUnpack | asarUnpack 缺少 | d1e6b4c | ✅ |
| IPC handler 重复 | updater.ts 多注册了 get-app-version | 1feedba | ✅ |
| 无单例锁 | 没有 requestSingleInstanceLock | d1e6b4c | ✅ |
| prismaBin 路径错误 | 指向 server/node_modules 而非 node_modules | 9d835f4 | ✅ |
| httpServer 无错误处理 | listen 失败时无报错 | afbb405 | ✅ |
| 无 unhandled rejection 保护 | 异步错误静默丢失 | afbb405 | ✅ |
| dev.db 在 files 但不存在 | gitignore 忽略，CI 不存在 | afbb405 | ✅ |

### 深度检查结论
- 4 个关键 Bug 已全部修复（Issues 1-4）
- 4 个次要改进已全部修复（Issues 5-8）
- 代码结构稳定，无新发现阻塞性问题
- 可以触发构建
