# 🧋 Bubble Tea SaaS POS System

> Indonesia Market Edition - 印尼奶茶店智能经营平台

## 项目概述

一个专为印尼奶茶店设计的SaaS POS系统，支持：
- 📱 管理后台 (React + TypeScript)
- 🖥️ POS收银台 (支持离线)
- 👨‍💼 员工端
- 🤖 AI智能预测
- 📊 完整的数据分析

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + Vite + TypeScript + Tailwind CSS |
| 后端 | Node.js + Express + TypeScript |
| 数据库 | PostgreSQL 16 + Redis 7 |
| ORM | Prisma |
| 状态管理 | Zustand + React Query |
| 离线存储 | Dexie (IndexedDB) |
| 部署 | Docker + Docker Compose |

## 快速开始

### 前置要求
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16 (或使用 Docker)

### 安装步骤

```bash
# 1. 克隆代码
git clone https://github.com/your-org/bubble-tea-saas.git
cd bubble-tea-saas

# 2. 安装后端依赖
cd server
npm install
npx prisma generate
npx prisma db push
npm run db:seed  # 初始化测试数据

# 3. 安装前端依赖 (新开终端)
cd client-admin
npm install

# 4. 安装POS收银台依赖 (新开终端)
cd client-pos
npm install

# 5. 启动开发服务器
cd server && npm run dev          # 后端: http://localhost:3000
cd client-admin && npm run dev     # 管理后台: http://localhost:5173
cd client-pos && npm run dev       # POS收银台: http://localhost:6063
```

### Docker 快速启动

```bash
# 启动完整开发环境
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止
docker-compose down
```

## 测试账号

| 角色 | 手机号 | 密码 |
|------|--------|------|
| 管理员 | 081234567890 | admin123 |
| 经理 | 081234567891 | admin123 |
| 收银员 | 081234567892 | admin123 |
| 店员 | 081234567893 | admin123 |

## 项目结构

```
bubble-tea-saas/
├── server/                 # 后端 API
│   ├── src/
│   │   ├── routes/        # API 路由
│   │   ├── services/      # 业务逻辑
│   │   ├── repositories/  # 数据访问
│   │   ├── middlewares/   # 中间件
│   │   └── utils/         # 工具函数
│   ├── prisma/
│   │   └── schema.prisma  # 数据模型
│   └── Dockerfile
│
├── client-admin/           # 管理后台
│   └── src/
│       ├── pages/         # 页面组件
│       ├── components/    # 公共组件
│       ├── services/      # API 调用
│       ├── stores/        # Zustand 状态
│       └── hooks/         # 自定义 Hooks
│
├── client-pos/            # POS 收银台
│   └── src/
│       ├── pages/         # POS 页面
│       ├── db/            # IndexedDB (离线)
│       └── services/      # 同步服务
│
├── docker-compose.yml     # Docker 配置
└── README.md
```

## API 文档

启动服务器后访问: `http://localhost:3000/api/docs`

或查看 [API 文档](./docs/api.md)

## 核心功能

### ✅ 已完成
- [x] 用户认证 (JWT + RBAC)
- [x] 商品管理 (支持规格/加料/BOM)
- [x] 订单处理 (含印尼税务 PPN 11%)
- [x] 库存管理 (入库/出库/盘点)
- [x] 员工管理 (考勤/排班/薪资)
- [x] 会员系统 (积分/等级)
- [x] 报表分析 (营收/成本/利润)
- [x] POS 收银台 (支持多支付)
- [x] 离线模式 (Dexie + 自动同步)

### 🔄 进行中
- [ ] AI 销售预测
- [ ] 智能补货建议
- [ ] 外卖平台聚合 (GrabFood/GoFood/ShopeeFood)

### 📋 计划中
- [ ] KDS 厨房显示系统
- [ ] 供应商门户
- [ ] 顾客小程序/公众号

## 印尼本地化

- 🇮🇩 货币: IDR (印尼盾)
- 📋 税务: PPN 11% 自动计算
- 💳 支付: GoPay / OVO / DANA / ShopeePay / Dana / BCA VA
- 🕐 时区: Asia/Jakarta (WIB)
- 🌐 语言: 印尼语 / 英语 / 中文

## 部署 (印尼)

### 推荐的印尼云服务商

| 服务 | 用途 | 位置 |
|------|------|------|
| **DigitalOcean** | 主服务器 (Singapore SGP) | 新加坡 |
| **Biznet Gio** | 印尼本地备份 | 雅加达 |
| **AWS Jakarta** | CDN + 边缘节点 | 雅加达 |

### 环境变量

```bash
# Server
DATABASE_URL=postgresql://user:pass@host:5432/bubble_tea
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=7d
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://admin.bubbletea-id.com
PPN_RATE=0.11

# Indonesia Settings
DEFAULT_TIMEZONE=Asia/Jakarta
DEFAULT_CURRENCY=IDR
DEFAULT_LOCALE=id
```

### Docker 生产部署

```bash
# 复制生产配置
cp .github/workflows/docker-compose.production.yml docker-compose.yml

# 设置环境变量
export DB_PASSWORD=your-secure-password
export JWT_SECRET=your-jwt-secret
export CORS_ORIGIN=https://admin.yourdomain.com

# 启动
docker-compose up -d

# 检查状态
docker-compose ps
docker-compose logs -f api
```

## CI/CD

GitHub Actions 自动部署:
- **develop 分支** → Staging 环境 (新加坡)
- **main 分支** → Production 环境 (雅加达)

详见 [.github/workflows/ci.yml](./.github/workflows/ci.yml)

## 监控

- **Grafana**: http://your-server:3001
- **Prometheus**: http://your-server:9090
- **Health**: http://your-server:3000/health

## 贡献

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 许可证

MIT License - see [LICENSE](./LICENSE) for details.

---

**🧋 Made with love for Indonesia's bubble tea shops**