# BUGS

所有 bug 必须先登记 ID 再进入修复流程。

格式：
```markdown
## BUG-011
Title: 首次设置弹窗在服务器 DATABASE_URL 配置错误时出现，无法进入登录页
Severity: P1
Status: FIXED
Reproductions:
  - 服务器 DATABASE_URL 配置无效（格式错误或缺失）
  - 用户打开 POS 客户端
  - checkSyncStatus() 失败 → needsSetup=true → 弹出 SetupWizard
  - SetupWizard 也调用 syncConnect，同样失败
Expected: 即使服务器有问题，用户也能进入 LoginPage；auto-sync 在登录后处理
Actual: SetupWizard 阻断，用户无法进入主界面
Root Cause: App.tsx 在 checkSyncStatus() 失败时强制跳转 SetupWizard，绕过了 LoginPage 的 auto-sync 逻辑
Changed Files:
  - client-pos/src/App.tsx: 删除 SetupWizard，永远直接显示 LoginPage
Regression Test: 服务器配置错误时，POS 仍能打开 LoginPage，auto-sync 在登录后失败时给出友好提示
Commit: 243c016

## BUG-010
Title: 打印模块(electron-pos-printer)加载失败
Severity: P1
Status: IN_PROGRESS
Reproductions:
  - 用户启动 POS 客户端
  - 弹出错误提示："打印模块(electron-pos-printer)未能成功加载"
Expected: electron-pos-printer 模块正常加载，票据打印和钱箱功能可用
Actual: 模块加载失败，打印和钱箱功能不可用
Root Cause: @electron/rebuild 未装，native module 未针对 Electron 版本重建
Changed Files:
  - package.json: 加 @electron/rebuild
  - .github/workflows/build-windows.yml: 加 rebuild 步骤 + DEBUG
Regression Test: 启动 POS 后无错误弹窗，打印功能正常
Commit: b207622

## BUG-008
Title: 打印机选择后无法保存
Severity: P1
Status: FIXED
Reproductions:
  - 进入 POS 设置 -> 打印机设置
  - 选择一个打印机
  - 确认保存
  - 重新进入打印机设置，检查选中的打印机
Expected: 选中的打印机应该被保存，再次进入时仍然选中
Actual: 打印机选择后无法保存，重启后恢复默认
Root Cause: POST /api/config 需要 admin/manager 权限，staff/cashier 角色调用返回 403 但被静默忽略
Changed Files:
  - server/src/routes/config.ts: 新增 PUT /api/config/hardware-settings（允许 staff 保存硬件设置）
  - client-pos/src/services/api.ts: 新增 setHardwareSettings 方法
  - client-pos/src/pages/POSPage.tsx: handleSetupReceiptPrinter 改用 setHardwareSettings
Regression Test: 用 staff 账号登录 POS -> 检测打印机 -> 选择 -> 保存 -> 重新进入确认仍选中
Commit: pending
```

---

## 已知 Bug

> 2026-09-18 之前的历史问题需要逐一整理到本文件
> 当前状态：待整理

### 待整理项目（来自 session logs）

- [ ] sync/connect 返回 401（2026-09-04 日志）
- [ ] 登录后卡在 #/setup（2026-09-04 日志）
- [ ] 数据库每次启动被覆盖（已修复，2026-09-18）

---

## 新 Bug 登记模板

发现新 bug 时，先在下方添加记录，再进入修复流程：

```markdown
## BUG-001
Title:
Severity:
Status: OPEN
Reproductions:
  -
Expected:
Actual:
Root Cause:
Changed Files:
Regression Test:
Commit:
```

---

## BUG-001
Title: PM2 服务反复 EADDRINUSE 无法正确守护进程
Severity: P0
Status: OPEN
Reproductions:
  - 启动 `pm2 start ecosystem.config.js`
  - tea-server 启动后立即报 `EADDRINUSE: address already in use 0.0.0.0:7072`
  - PM2 日志显示持续尝试重启（多次 `restartProcessId`）
Expected: tea-server 应正常监听 7072 端口
Actual: PM2 日志: "HTTP server error: listen EADDRINUSE: address already in use 0.0.0.0:7072"
Root Cause: ecosystem.config.js 使用 `script: 'npm', args: 'run dev'` 启动方式，PM2 守护的是 npm wrapper 而非实际 node 进程，导致 PM2 无法正确监控子进程死亡/端口状态
Changed Files:
Regression Test:
Commit:

## BUG-002
Title: Admin/POS/Staff App 三个 PM2 服务全部未启动
Severity: P0
Status: OPEN
Reproductions:
  - `pm2 list` 显示所有服务状态 online，但实际 `lsof -i :6063/5173/5175` 无监听
  - `curl http://localhost:6063` → 000 connection refused
  - `curl https://staff.aicube.online` → 502
Expected: Admin(5173) / POS(6063) / Staff App(5175) 均应正常监听
Actual: 仅 tea-server (7072) 实际在跑，Admin/POS/StaffApp 三者均无进程监听
Root Cause: PM2 ecosystem.config.js 的 `script: path/to/vite args: '--port XXX'` 方式启动 Vite，Vite 启动后监听端口被 PM2 误判为已退出，导致服务实际未运行
Changed Files:
Regression Test:
Commit:

## BUG-003
Title: 数据库 seed 需手动运行，账户丢失
Severity: P1
Status: OPEN
Reproductions:
  - Prisma schema push 或数据库文件被覆盖后
  - 登录 `081234567890/admin123` 返回 401
  - 需手动 `cd server && npx prisma db seed` 恢复账户
Expected: 数据库损坏后应可自恢复，或有初始化机制
Actual: 无自动初始化，User 表为空，所有登录失败
Root Cause: 数据库为 SQLite 文件，PM2 进程崩溃/重启后数据可能丢失（dev.db 被 seed.db 覆盖）
Changed Files:
Regression Test:
Commit:

## BUG-004
Title: 登录限流过于严格（10次/15分钟即封禁）
Severity: P1
Status: OPEN
Reproductions:
  - 开发测试阶段频繁登录约10次后
  - 任何账户（081234567890/081234567891等）均返回 401 并提示 "Too many login attempts, please try again after 15 minutes"
  - 15分钟内所有账户无法登录
Expected: 合理的登录限流策略（生产环境应允许更多尝试）
Actual: `server/src/routes/auth.ts` - `max: 10` attempts per 15min，测试环境过于严格
Root Cause: authLimiter 限流配置 max=10 未区分环境，生产/开发采用相同限制
Changed Files:
Regression Test:
Commit:

## BUG-005
Title: Staff App 端口 5175 未配置/未启动
Severity: P1
Status: OPEN
Reproductions:
  - cloudflare: `staff.aicube.online → http://localhost:5175`
  - `curl https://staff.aicube.online` → 502 Bad Gateway
  - `lsof -i :5175` → 无监听
Expected: Staff App 应在 5175 端口正常提供访问
Actual: Staff App 服务未在 ecosystem.config.js 中配置，或配置了但未成功启动
Root Cause: ecosystem.config.js 中无 tea-staff PM2 应用定义；cloudflare 指向了不存在的本地端口
Changed Files:
Regression Test:
Commit:

## BUG-006
Title: Cloud API 测试账户不存在（本地/云端账户隔离）
Severity: P1
Status: OPEN
Reproductions:
  - `POST https://api.aicube.online/api/auth/login` with `081234567890/admin123` → 401 Invalid credentials
  - Cloud 数据库和本地 SQLite 数据库账户完全独立
  - cloud 仅有 storeId 但无对应 User 记录
Expected: 同一套账户体系（门店在云端有对应账户）
Actual: Cloud DB (PostgreSQL) 和本地 SQLite 完全独立，云端无 store 对应账户，sync/connect 流程在云端会失败
Root Cause: Cloud 部署使用了不同的用户数据库（PostgreSQL），而本地测试账户只存在于 SQLite
Changed Files:
Regression Test:
Commit:

## BUG-007
Title: sync/full 不同步订单（订单数据孤岛）
Severity: P1
Status: OPEN
Reproductions:
  - POS 创建订单后，Admin 远程访问 `api.aicube.online/api/orders` 看不到订单
  - sync/full 仅同步商品/分类/加料/渠道，订单无上传通道
Expected: POS 订单应同步到 Cloud DB，Admin 远程可见
Actual: 订单仅存在于 POS 本地 SQLite，Cloud Admin 无法访问
Root Cause: sync 机制是单向的（cloud → local），本地 SQLite 无向 cloud push 订单的逻辑
Changed Files:
Regression Test:
Commit:

## BUG-009
Title: 已安装 POS 不会自动从云端增量同步数据
Severity: P2
Status: OPEN
Reproductions:
  - 后台管理新增产品
  - 已安装的 POS 重新打开
  - POS 看不到新产品
Expected: 已安装 POS 应定期从云端同步最新产品/分类/会员数据
Actual: 已安装 POS 只在首次安装（本地 DB 为空）时同步一次，之后永不更新
Root Cause: SyncManager.startSync() 只调用 syncPendingOrders()（只上传订单），无拉取数据的逻辑。syncFull() 仅在 LoginPage 本地 DB 为空时触发
Changed Files:
Regression Test:
Commit:
