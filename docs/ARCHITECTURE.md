# ARCHITECTURE

Bubble Tea POS 系统架构文档。

---

## 系统概览

```
┌─────────────────────────────────────────────────────────────┐
│                      Windows PC                              │
│                                                             │
│  ┌──────────────┐     ┌──────────────┐                  │
│  │  POS 界面    │     │  顾客副屏     │                  │
│  │  localhost    │     │  localhost    │                  │
│  │  :6063       │     │  :6063/cust  │                  │
│  └──────┬───────┘     └──────┬───────┘                  │
│         │                       │                          │
│  ┌──────▼──────────────────────▼───────┐                  │
│  │         Electron Main Process         │                  │
│  │  • 窗口管理                          │                  │
│  │  • IPC handlers（打印/钱箱/打印机）    │                  │
│  │  • 本地服务器启动（fork）             │                  │
│  │  • WebView2 检查                      │                  │
│  └──────┬───────────────────────┬───────┘                  │
│         │                       │                          │
│  ┌──────▼───────┐     ┌────────▼────────┐                │
│  │  本地 API      │     │  electron-pos-  │                │
│  │  Server       │     │  printer        │                │
│  │  :7072        │     │  (Windows 打印) │                │
│  └──────┬───────┘     └─────────────────┘                │
│         │                                                  │
│  ┌──────▼───────┐                                        │
│  │  SQLite DB   │                                        │
│  │  (Prisma)    │                                        │
│  └──────────────┘                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 项目结构

```
bubble-tea-saas/
├── client-pos/               # Electron 主应用
│   ├── electron/
│   │   ├── main.ts         # Electron 主进程（窗口/IPC/服务器管理）
│   │   ├── preload.ts       # IPC 暴露到渲染进程
│   │   ├── updater.ts      # 自动更新管理
│   │   └── installer.nsh   # NSIS 安装脚本
│   └── src/
│       ├── pages/
│       │   ├── POSPage.tsx  # 收银主界面
│       │   └── ...
│       └── ...
│
├── client-admin/            # Admin 管理端（Next.js）
│
├── server/                  # Express API
│   ├── src/
│   │   ├── index.ts        # API 主入口（40+ 路由）
│   │   ├── routes/          # 路由
│   │   └── services/        # 业务逻辑
│   └── prisma/
│       └── schema.prisma    # 数据模型
│
├── shared/                  # 共享类型/常量
│
└── .github/workflows/       # CI/CD
    └── build-windows.yml   # Windows 构建
```

---

## IPC 通信（Main ↔ Renderer）

| 方向 | IPC 名称 | 功能 |
|---|---|---|
| invoke | `print-receipt` | 打印小票 |
| invoke | `open-cash-drawer` | 打开钱箱 |
| invoke | `list-printers` | 枚举打印机 |
| invoke | `send-kitchen-order` | 厨房打印 |
| send | `order-update` | 更新副屏 |
| send | `order-clear` | 清空副屏 |
| send | `order-complete` | 订单完成副屏 |

---

## 数据库

- **引擎**: SQLite via Prisma
- **位置**: `%APPDATA%/BubbleTeaPOS/data/dev.db`
- **迁移**: `prisma db push`（开发/打包时）
- **初始化**: 首次安装时从 `seed.db` 复制，**不再每次启动覆盖**

### 主要模型
- `Store` — 店铺
- `Product` / `Category` — 产品/分类
- `Order` / `OrderItem` — 订单
- `Payment` — 支付记录
- `Inventory` — 库存
- `Member` — 会员
- `Staff` — 员工

---

## 打包机制

- **asar**: `client-pos/dist-electron/**/*` + `server/dist/**/*`
- **asarUnpack**: electron-pos-printer、Prisma 引擎、node_modules
- **extraResources**: server/node_modules、server/prisma
- **入口**: `app.asar.unpacked/server/dist/index.js`（fork 启动 API）

---

## 端口配置

| 服务 | 端口 | 说明 |
|---|---|---|
| POS 界面 | 6063 | Electron 加载 |
| Admin 界面 | 5173 | Next.js dev |
| 本地 API | 7072 | Electron fork 的 Node 进程 |

---

## 构建 Workflow

1. `npm run build:server` — 编译 Express API
2. `npm run build:admin` — 编译 Admin
3. `npm run build:pos` — 编译 POS 前端
4. `cd client-pos && npm run build:electron:main` — 编译 Electron main.ts
5. `npx electron-builder` — 打包 NSIS 安装包

---

## 已知架构风险

1. **离线模式**: sync/connect 曾返回 401，需验证
2. **多实例**: `app.requestSingleInstanceLock()` 只允许一个实例
3. **数据备份**: 需建立独立的数据库备份机制
