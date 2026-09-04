# Windows 打包检查清单

> 每次发现问题后更新此文件

---

## 📋 问题历史记录

| 日期 | 问题 | 严重度 | 状态 |
|------|------|--------|------|
| 2026-09-03 | Prisma CLI 路径错误 (.bin/prisma 是 shell 脚本) | 🔴 高 | ✅ 已修复 |
| 2026-09-03 | Prisma CLI 用 shell 执行，Windows 不兼容 | 🔴 高 | ✅ 已修复 |
| 2026-09-03 | fork() 未指定 execPath | 🔴 高 | ✅ 已修复 |
| 2026-09-03 | NODE_PATH 只有 server/node_modules，缺少根目录 node_modules | 🔴 高 | ✅ 已修复 |
| 2026-09-03 | dist-electron 未在 asarUnpack，sandbox 下 preload 失败 | 🔴 高 | ✅ 已修复 |
| 2026-09-03 | getResourcePath 对 dist-electron 返回 asar 路径 | 🔴 高 | ✅ 已修复 |
| 2026-09-03 | InventoryService storeId 未过滤（安全漏洞） | 🔴 高 | ✅ 已修复 |
| 2026-09-04 | 检查清单创建 | - | 文档 |

---

## 一、打包前 - 配置文件审查

### 1.1 electron-builder.json 必须包含的配置

```bash
# files[] - 打包进 asar (压缩只读)
✅ server/uploads/**/*
✅ server/prisma/schema.prisma
✅ server/prisma/seed.db
✅ server/node_modules/**/*        # 必须包含
✅ client-pos/dist/**/*
✅ client-pos/dist-electron/**/*
✅ client-admin/dist/**/*
✅ shared/**/*

# asarUnpack - 解压到 app.asar.unpacked (可写)
✅ **/*.node                       # 原生模块
✅ node_modules/.prisma/client/**/*  # Prisma 引擎
✅ node_modules/@prisma/client/**/*  # Prisma Client
✅ server/node_modules/**/*          # 服务器依赖
✅ server/prisma/seed.db
✅ server/prisma/schema.prisma
✅ dist-electron/**/*                # 必须包含！sandbox 需要

# extraResources - 额外资源复制
✅ server/dist → app.asar.unpacked/server/dist
✅ server/node_modules → app.asar.unpacked/server/node_modules
✅ server/uploads → app.asar.unpacked/server/uploads
✅ node_modules/.prisma → app.asar.unpacked/node_modules/.prisma
✅ node_modules/@prisma/client → app.asar.unpacked/node_modules/@prisma/client
```

### 1.2 验证命令

```bash
# 检查 files[]
grep "server/node_modules" electron-builder.json

# 检查 asarUnpack
grep -A20 "asarUnpack" electron-builder.json

# 检查 extraResources
grep -A30 "extraResources" electron-builder.json
```

---

## 二、打包前 - 代码审查（关键函数）

### 2.1 getResourcePath()

```typescript
// ✅ 正确实现
function getResourcePath(relativePath: string): string {
  if (app.isPackaged) {
    // dist-electron 在 asarUnpack 中，必须返回 unpacked 路径
    if (relativePath.startsWith('dist-electron')) {
      return path.join(process.resourcesPath, 'app.asar.unpacked', 'client-pos', relativePath)
    }
    return path.join(app.getAppPath(), 'client-pos', relativePath)
  } else {
    return path.join(__dirname, '..', '..', relativePath)
  }
}
```

### 2.2 fork() 服务器进程

```typescript
// ✅ 正确实现
const nodeExecPath = process.execPath  // 必须指定
const nodePath = `${serverModulesPath}${path.delimiter}${prismaModulesPath}`

serverProcess = fork(serverEntry, [], {
  execPath: nodeExecPath,  // 必须指定，不能省略
  env: {
    NODE_PATH: nodePath,  // 必须同时包含两个路径
    DATABASE_URL: `file:${userDbPath}`,
    PORT: '7072',
    NODE_ENV: 'production'
  }
})
```

### 2.3 Prisma CLI 调用

```typescript
// ✅ 正确实现
const serverModulesPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'node_modules')

// 路径必须是 .pnpm 下的实际 JS 文件，不是 .bin 下的 shell 脚本
const prismaCliPath = path.join(serverModulesPath, '.pnpm', 'prisma@5.22.0', 'node_modules', 'prisma', 'build', 'index.js')

// 必须用 node 直接执行，不能通过 shell
spawn(process.execPath, [prismaCliPath, 'db', 'push', ...])
```

### 2.4 NODE_PATH 必须包含两个路径

```typescript
// ✅ 正确实现
const unpackedRoot = path.join(process.resourcesPath, 'app.asar.unpacked')
const serverModulesPath = path.join(unpackedRoot, 'server', 'node_modules')
const prismaModulesPath = path.join(unpackedRoot, 'node_modules')
const nodePath = `${serverModulesPath}${path.delimiter}${prismaModulesPath}`
// 效果: "app.asar.unpacked/server/node_modules:app.asar.unpacked/node_modules"
```

---

## 三、打包后 - 文件结构验证

### 3.1 解压 asar

```bash
npx asar extract release/win-unpacked/resources/app.asar /tmp/app-check
```

### 3.2 文件位置预期

| 文件/目录 | 预期位置 | 说明 |
|-----------|----------|------|
| server/dist | asar.unpacked | 服务器代码在 unpacked |
| server/prisma | asar 内 + unpacked | schema 在 asar，seed 在两者 |
| client-pos/dist | asar 内 | 前端代码在 asar |
| client-pos/dist-electron | asar.unpacked | electron 代码在 unpacked |
| preload.js | asar.unpacked | sandbox 模式必须 |
| node_modules | asar 内 + unpacked | 按 asarUnpack 配置 |

### 3.3 验证脚本

```bash
#!/bin/bash
set -e

echo "=== 1. 解压 asar ==="
npx asar extract release/win-unpacked/resources/app.asar /tmp/app-check
echo "✅ asar 解压成功"

echo ""
echo "=== 2. 检查 asar 内容 ==="
ASAR_FILES=(
  "/tmp/app-check/client-pos/dist/index.html"
  "/tmp/app-check/client-pos/dist-electron/electron/main.js"
  "/tmp/app-check/client-pos/dist-electron/electron/preload.js"
  "/tmp/app-check/shared/**/*"
)
for f in "${ASAR_FILES[@]}"; do
  if ls $f &>/dev/null; then
    echo "✅ $f"
  else
    echo "❌ 缺失: $f"
  fi
done

echo ""
echo "=== 3. 检查 asar.unpacked 内容 ==="
UNPACKED="release/win-unpacked/resources/app.asar.unpacked"
UNPACKED_DIRS=(
  "$UNPACKED/server/dist"
  "$UNPACKED/server/node_modules"
  "$UNPACKED/server/prisma"
  "$UNPACKED/node_modules/.prisma"
  "$UNPACKED/node_modules/@prisma"
  "$UNPACKED/client-pos/dist-electron"
)
for d in "${UNPACKED_DIRS[@]}"; do
  if [ -d "$d" ]; then
    echo "✅ $(basename $d)"
  else
    echo "❌ 缺失: $d"
  fi
done

echo ""
echo "=== 4. 检查原生模块 ==="
WINDOWS_ENGINES=$(find $UNPACKED -name "query_engine-windows.dll.node" 2>/dev/null)
if [ -n "$WINDOWS_ENGINES" ]; then
  echo "✅ Windows 引擎存在"
  echo "$WINDOWS_ENGINES" | head -3
else
  echo "❌ 未找到 Windows 引擎"
fi

echo ""
echo "=== 5. 检查 server/dist ==="
if [ -f "$UNPACKED/server/dist/index.js" ]; then
  echo "✅ server/dist/index.js 存在"
else
  echo "❌ 缺失: server/dist/index.js"
fi
```

---

## 四、运行验证

### 4.1 预期日志输出

```
[Server] App version: 2026.x.x, userData: C:\Users\...\AppData\Roaming\BTPS
[Server] User database already exists: ...\dev.db
[Server] NODE_PATH: ...\app.asar.unpacked\server\node_modules;...\app.asar.unpacked\node_modules
[Server] Server path: ...\app.asar.unpacked\server\dist\index.js
[Server] Starting local API server...
[Server] Local API server started (PID: xxxx)
[Server] Port 7072 is ready
```

### 4.2 常见错误识别

| 错误日志 | 原因 | 检查项 |
|---------|------|--------|
| `spawn prisma ENOENT` | prisma 路径错误 | 检查 asarUnpack server/node_modules |
| `Cannot find module 'express'` | NODE_PATH 错误 | NODE_PATH 必须包含两个路径 |
| `preload failed: sandbox` | preload 在 asar 内 | dist-electron 必须在 asarUnpack |
| `Port 7072 timeout` | 服务器启动失败 | 检查 stderr 日志 |
| `[warn] JWT_SECRET not set` | 正常 fallback | 仅警告，非致命 |

### 4.3 验证命令 (Windows PowerShell)

```powershell
# 检查 Node 进程
Get-Process -Name node

# 检查端口
netstat -an | Select-String "7072"

# 查看日志
Get-Content "$env:APPDATA\BubbleTeaPOS\logs\main.log" -Tail 100
```

---

## 五、安全检查

### 5.1 服务端 storeId 过滤

```bash
# 检查 InventoryService 是否正确过滤 storeId
grep -n "where:.*storeId" server/src/services/InventoryService.ts
```

必须包含的函数：
- getStockInLogs(storeId) - `where: { storeId }`
- getStockOutLogs(storeId) - `where: { storeId }`
- getBatches(storeId) - `where: { storeId }`

---

## 六、完整检查流程

```
□ 1. [打包前] 审查 electron-builder.json 配置
□ 2. [打包前] 审查 getResourcePath() 实现
□ 3. [打包前] 审查 fork() execPath 和 NODE_PATH
□ 4. [打包前] 审查 Prisma CLI 调用方式
□ 5. [打包后] 运行验证脚本解压检查
□ 6. [打包后] 检查 asar.unpacked 内容完整性
□ 7. [打包后] 检查原生模块是否存在
□ 8. [运行]   启动应用检查日志输出
□ 9. [运行]   验证服务器进程和端口
□ 10. [安全]   检查 storeId 过滤
```

**每一步都必须通过才能继续下一步。**
