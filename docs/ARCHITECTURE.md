# Bubble Tea POS 项目架构文档

## 一、项目概述

### 1.1 技术栈
- **前端框架**: React 18 + TypeScript
- **状态管理**: Zustand
- **数据获取**: React Query (TanStack Query)
- **路由**: React Router v6
- **UI**: Tailwind CSS + Lucide React
- **国际化**: i18next + react-i18next
- **桌面打包**: Electron 28 + electron-builder
- **后端**: Node.js + Express + Prisma ORM
- **数据库**: SQLite (开发) / PostgreSQL (生产)

### 1.2 项目结构

```
bubble-tea-saas/
├── server/                 # 后端服务
│   ├── src/
│   │   ├── routes/        # API 路由
│   │   ├── controllers/   # 业务逻辑
│   │   ├── services/     # 服务层
│   │   ├── middleware/   # 中间件
│   │   └── index.ts      # 入口
│   └── prisma/
│       └── schema.prisma  # 数据模型
├── client-pos/            # POS 收银端 (Electron)
│   ├── src/
│   │   ├── pages/        # 页面组件
│   │   ├── components/   # 通用组件
│   │   ├── services/    # API 服务
│   │   ├── stores/      # Zustand 状态
│   │   ├── hooks/       # 自定义 Hooks
│   │   ├── i18n/        # 国际化
│   │   ├── utils/       # 工具函数
│   │   ├── electron/    # Electron 主进程
│   │   │   ├── main.ts  # 主进程入口
│   │   │   └── preload.ts # 预加载脚本
│   │   ├── App.tsx     # 根组件
│   │   └── main.tsx    # React 入口
│   │   └── dist/        # Vite 构建输出
│   └── dist-electron/   # Electron 编译输出
├── client-admin/         # Admin 管理端
├── client-staff/         # Staff 员工端
├── shared/               # 共享类型/常量
└── docs/                 # 文档
```

---

## 二、POS 端数据流

### 2.1 启动流程

```
用户启动 exe
    ↓
Electron main.ts 主进程初始化
    ↓
createMainWindow() 创建主窗口
    ↓
loadFile() 加载 index.html
    ↓
React 渲染 #root
    ↓
App.tsx → Routes → 对应页面
```

### 2.2 状态管理 (Zustand)

| Store | 用途 |
|-------|------|
| `authStore` | 用户认证、登录状态 |
| `cartStore` | 购物车 |
| `productStore` | 产品缓存 |
| `orderStore` | 订单数据 |
| `uiStore` | UI 状态（弹窗等） |

### 2.3 API 调用流程

```
React 组件
    ↓
React Query (缓存+请求)
    ↓
API Service (services/api.ts)
    ↓
fetch / axios
    ↓
API_URL (config.ts)
    ↓
Server: localhost:7072 (开发)
    ↓ 云端: api.aicube.online
```

### 2.4 文件路径配置

```typescript
// 开发模式
__dirname = 项目根目录/dist-electron/electron
相对路径: ../..

// 生产模式 (electron-builder)
app.getAppPath() = resources/app/
files 配置: client-pos/dist/**/*
实际路径: resources/app/client-pos/dist/
```

---

## 三、Electron 打包配置

### 3.1 electron-builder.json

```json
{
  "appId": "com.bubbletea.pos",
  "productName": "BubbleTeaPOS",
  "asar": false,
  "files": [
    "client-pos/dist/**/*",      // React 构建产物
    "client-pos/dist-electron/**/*" // Electron 编译产物
  ],
  "extraMetadata": {
    "main": "client-pos/dist-electron/electron/main.js"
  }
}
```

### 3.2 主进程文件加载

```typescript
// main.ts
function getResourcePath(relativePath: string): string {
  if (app.isPackaged) {
    // 生产模式: resources/app/client-pos/dist/index.html
    return path.join(app.getAppPath(), 'client-pos', relativePath)
  } else {
    // 开发模式
    return path.join(__dirname, '..', '..', relativePath)
  }
}

// 加载 index.html
const indexPath = getResourcePath('dist/index.html')
mainWindow.loadFile(indexPath)
```

### 3.3 打包流程

```
npm run build:pos          # Vite 构建 React
    ↓
npm run build:electron:main  # TypeScript 编译 main.ts
    ↓
electron-builder --win nsis  # 打包成 exe
    ↓
release/BubbleTeaPOS-*.exe
```

---

## 四、API 架构

### 4.1 主要模块

| 模块 | 路径 | 功能 |
|------|------|------|
| 认证 | `/api/auth/*` | 登录、登出 |
| 订单 | `/api/orders/*` | 创建、查询订单 |
| 产品 | `/api/products/*` | 产品 CRUD |
| 员工 | `/api/staff/*` | 员工管理 |
| 班次 | `/api/shifts/*` | 交接班 |
| 配置 | `/api/config/*` | 系统配置 |

### 4.2 API 端点示例

```
POST /api/auth/login          # 登录
GET  /api/products           # 获取产品列表
POST /api/orders            # 创建订单
GET  /api/orders/:id        # 获取订单详情
POST /api/shifts/open       # 开班
POST /api/shifts/close      # 闭班
GET  /api/config/:storeId/pos_api_url  # 获取 POS API URL
```

---

## 五、路由结构

### 5.1 POS 端路由

```typescript
/               → POSPage (收银主页)
/login         → LoginPage (登录页)
/history       → OrderHistoryPage (历史订单)
/cash          → CashManagementPage (现金管理)
/customer-display → CustomerDisplayPage (副屏-顾客显示)
/register-member → RegisterMemberPage (会员注册)
/scan          → ScanPage (扫描)
/tasks         → HygieneTasksPage (卫生任务)
```

### 5.2 受保护路由

除 `/login` 和 `/customer-display` 外，所有路由都需要登录状态。

---

## 六、当前问题点

### 6.1 白屏问题

**可能原因**:
1. 文件路径错误
2. React 渲染崩溃
3. API 请求失败
4. 硬件/驱动不兼容

**诊断方法**:
- 生产模式打开 DevTools (已添加)
- 查看 Console 错误
- 查看 Network 请求

### 6.2 打包问题

**历史问题**:
1. productName 有空格导致文件名问题 → 已修复
2. win-unpacked 上传超时 → 已移除
3. overwrite 参数错误 → 已升级 v2

---

## 七、GitHub Actions 构建

### 7.1 Workflow 触发

- `workflow_dispatch`: 手动触发
- 每次构建自动 commit 版本号

### 7.2 构建流程

```
1. Checkout code
2. Setup Node.js 22
3. Update version
4. Create git tag
5. npm install
6. Build server/admin/pos/staff
7. Compile Electron
8. electron-builder --win nsis
9. action-gh-release (上传 exe)
```

---

## 八、版本历史

| 版本 | 日期 | 问题 |
|------|------|------|
| v2026.7.154 | 2026-07-29 | 最新，诊断功能 |
| v2026.7.153 | 2026-07-29 | 白屏修复 |
| ... | ... | ... |

---

## 九、待解决

- [ ] 白屏问题根因未确定
- [ ] 需要 Windows 环境测试
- [ ] DevTools 诊断功能待验证
