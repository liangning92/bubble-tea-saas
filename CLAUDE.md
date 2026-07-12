# Bubble Tea SaaS 项目规范

## 项目概述
- **项目名称**: 珍珠奶茶 SaaS 系统 (Bubble Tea POS)
- **位置**: `~/Desktop/Claude_Work/bubble-tea-saas`
- **技术栈**: Next.js (前端), Node.js/Express (后端), Prisma (数据库), SQLite
- **包管理**: npm

## 应用端口
- **Server API**: `http://localhost:7072`
- **Admin 管理端**: `http://localhost:5173`
- **POS 收银端**: `http://localhost:6063`

## 语言规范 (i18n) ⚠️ 关键规则

### 必须遵守的翻译规则

**所有新增的页面、组件、功能，必须同步添加翻译：**

1. **翻译文件位置**:
   - Admin 端: `client-admin/src/i18n/index.ts`
   - POS 端: `client-pos/src/i18n/index.ts`

2. **翻译命名空间结构**:
   ```typescript
   const resources = {
     id: { translation: { ... } },  // 印尼语
     en: { translation: { ... } },  // 英语
     zh: { translation: { ... } }    // 中文
   }
   ```

3. **添加新翻译的步骤**:
   - 在 `en` (英语) 中添加 key 和英文值
   - 在 `zh` (中文) 中添加对应的中文翻译
   - 在 `id` (印尼语) 中添加对应的印尼语翻译
   - **三者必须同步添加，key 必须完全一致**

4. **翻译 key 命名规范**:
   - 格式: `section.specificKey` (如 `orders.orderNumber`)
   - 使用小写字母和点号分隔
   - section 使用单数形式 (如 `order` 而非 `orders`)

5. **禁止的行为**:
   - ❌ 只添加英语翻译，不添加中文
   - ❌ 使用硬编码字符串而不使用翻译 key
   - ❌ 在一个语言中添加 key 而在其他语言中留空

### 示例

```typescript
// 正确示例
orders: {
  title: '订单',      // zh
  title: 'Orders',    // en
  title: 'Pesanan',    // id
  orderNumber: '订单号',
  orderNumber: 'Order Number',
  orderNumber: 'Nomor Pesanan',
}

// 错误示例 - 不要这样做！
orders: {
  title: '订单',      // zh ✓
  // en 和 id 缺失 ✗
}
```

## 开发命令

```bash
cd ~/Desktop/Claude_Work/bubble-tea-saas

# 后端
cd server && npm run dev

# Admin 管理端
cd client-admin && npm run dev

# POS 收银端
cd client-pos && npm run dev
```

## 代码风格

- 使用 TypeScript
- 使用 zustand 管理状态
- 使用 @tanstack/react-query 管理数据获取
- 使用 Tailwind CSS 样式
- 使用 lucide-react 图标

## 数据库

- 使用 Prisma ORM
- SQLite 数据库
- Schema 文件: `server/prisma/schema.prisma`

## ⚠️ 数据一致性规则（强制执行）⚠️

### 禁止临时补丁
所有修改必须符合长期架构设计。禁止：
- 发送聚合值让服务端忽略后再计算
- 前后端各自计算同一数据
- `as any` 绕过类型检查作为 workaround
- 硬编码绕过业务逻辑

### 前后端职责分离

| 层级 | 职责 | 示例 |
|------|------|------|
| **客户端** | UI计算、用户输入验证、离线缓存 | 计算 subtotal、discount、pointsRedeemed |
| **服务端** | 业务规则、数据验证、权威计算 | 渠道调价、库存扣减、积分计算、税费计算 |

**规则**：
- 客户端发送**原始数据**（items, discountAmount, pointsRedeemed, channelId）
- 服务端**统一计算**所有聚合值（totalAmount, finalAmount, ppnAmount）
- 服务端**必须使用**客户端发送的值，或拒绝请求并报错

### 数据一致性检查清单（每次修改必须验证）

```
□ 客户端发送的字段，服务端是否使用？
□ 服务端计算的字段，客户端是否正确显示？
□ 前后端计算公式是否一致？（税费=基数×税率，积分=金额/100）
□ 离线存储与在线数据格式是否一致？
□ 历史订单金额与结账时是否一致？
```

### 修复Bug的正确姿势

**错误方式（临时补丁）**：
```typescript
// POS 发送 finalAmount 已含税，服务端又加税
const total = subtotal + tax
posApi.createOrder({ finalAmount: total })  // 服务端重复加税
```

**正确方式（长期架构）**：
```typescript
// POS 发送原始数据
posApi.createOrder({ subtotal, discountAmount, pointsRedeemed })

// 服务端统一计算
const finalAmount = subtotal - discountAmount - pointsDiscount
const ppnAmount = finalAmount * ppnRate
const grandTotal = finalAmount + ppnAmount
```

---

## ⚠️ 危险操作必须备份

### 执行前必须备份的操作

| 操作 | 风险 | 备份要求 |
|------|------|----------|
| `prisma db push --accept-data-loss` | 重建数据库，数据全丢失 | 必须备份 .db 文件 |
| `prisma db seed` | 覆盖现有数据 | 必须备份 .db 文件 |
| `rm -rf` | 删除文件无法恢复 | 必须 git commit |
| `DROP TABLE` / `DELETE` (无WHERE) | 删除所有数据 | 必须备份数据库 |

### 备份命令

```bash
# 备份数据库
cp server/prisma/dev.db server/prisma/dev.db.backup-$(date +%Y%m%d%H%M%S)

# 备份整个项目
git add -A && git commit -m "backup before [操作描述]"
```

## 🚀 推送前自检清单 ⚠️ 强制执行

**每次推送到GitHub触发CI构建前，必须完成以下检查：**

### 必须完成的检查

| 检查项 | 命令 | 失败怎么办 |
|--------|------|-----------|
| TypeScript 类型检查 | `cd server && npx tsc --noEmit` | 修复类型错误，直到通过 |
| 服务端构建 | `cd server && npm run build` | 修复构建错误，直到通过 |
| Admin 构建 | `cd client-admin && npm run build` | 修复构建错误，直到通过 |
| POS 构建 | `cd client-pos && npm run build` | 修复构建错误，直到通过 |

### 检查流程

```
1. 修改代码
2. 本地 TypeScript 类型检查 (tsc --noEmit)
3. 本地完整构建 (npm run build)
4. 构建通过后 → git add → git commit → git push
```

### ⚠️ 禁止的行为

- ❌ **没完成自检就推送**
- ❌ **构建失败后不修复就反复推送**
- ❌ **本地还没通过就依赖GitHub CI来"调试"**

### 为什么这样做

- GitHub CI 额度有限
- 本地调试比CI快速反馈更快
- 减少"发现问题→修复→推送→又发现问题"循环

---

## 开发规范（8阶段流程）

### 第一阶段：业务流程自检
- 用户是谁？（总部管理员/店长/收银员/会员）
- 用户要完成什么？
- 业务闭环检查

### 第二阶段：功能完整性检查
- 新增/编辑/删除/查询/分页/筛选/详情/异常处理/权限控制

### 第三阶段：UI可用性检查
- 入口/按钮/弹窗/表单/刷新/多端/错误提示

### 第四阶段：数据流检查
- 前端→API→后端→数据库→返回→展示

### 第五阶段：跨模块联调检查
- POS/库存/订单等

### 第六阶段：异常场景测试
- 空数据/大数据/非法输入/网络异常

### 第七阶段：权限测试
- 总部管理员/店长/店员/财务/仓库管理员

### 第八阶段：最终验收
- 功能/页面/API/联调/测试完成率 → 100%

## 测试框架

### Playwright 自动化测试

```bash
# 运行所有测试
npm run test:playwright

# 运行冒烟测试（每次修改后必须运行）
npm run test:playwright:smoke

# 运行 i18n 测试
npm run test:playwright:i18n

# 运行 POS 测试
npm run test:playwright:pos

# UI 模式（可视化调试）
npm run test:playwright:ui
```

### 测试分层

| 层级 | 内容 | 执行者 | 频率 |
|------|------|--------|------|
| L1 | npm run build + TypeScript 检查 | Claude | 每次修改 |
| L2 | Playwright 冒烟测试 | Claude + CI | 每次 PR |
| L3 | Playwright 完整测试 + i18n | Claude + CI | 每次 PR |
| L4 | 人工探索性测试 | 人工 | 上线前 |

### 测试文件位置

- 测试配置: `playwright.config.ts`
- 测试用例: `tests/*.spec.ts`
- 测试文档: `tests/README.md`

## 工作流 (Workflow)

对于代码库级别的扫荡型任务，使用 Dynamic Workflow：

```bash
# 在 prompt 中写 "workflow" 触发轻量模式
Run a workflow to audit all finance module files

# 或使用 ultracode 模式（自动决定何时启动工作流）
/effort ultracode
```

### 工作流场景

**适合用工作流**：
- 代码库级别的扫荡型任务（整个 repo 的 bug 扫描）
- 大规模迁移/改造
- 需要交叉验证的研究问题
- 关键决策需要"对抗式审查"

**不适合用工作流**：
- 一轮对话能搞定的事
- 不需要并行/交叉验证的简单逻辑
- token 预算敏感的场景

## 备注

- Admin 管理端支持 3 种语言: 印尼语 (id)、英语 (en)、中文 (zh)
- 默认语言是印尼语 (id)
- 用户可以在设置中切换语言，设置保存在浏览器 localStorage
- fallback 语言是英语 (en)
- 大拿1号负责【营销管理】模块

---

## 自动化检查机制

### 本地检查脚本

```bash
# TypeScript 类型检查（所有客户端）
npm run typecheck

# i18n 检查（检测缺失的翻译 key 和硬编码）
node scripts/i18n-check.js client-pos
node scripts/i18n-check.js client-admin
node scripts/i18n-check.js client-staff
```

### pre-commit Hook

项目配置了 `.husky/pre-commit` hook，提交前自动运行：
1. TypeScript 类型检查
2. 确保构建通过

### ESLint 规则

项目根目录配置了 `.eslintrc.js`，规则包括：
- `react-hooks/exhaustive-deps`: 检查 useEffect 依赖
- `@typescript-eslint/no-explicit-any`: 警告 any 类型
- `no-console`: 生产环境禁止 console.log
- localStorage 敏感数据限制

### 新问题预防

**提交前必须确保：**
1. ✅ `npm run typecheck` 通过
2. ✅ `npm run build` 通过
3. ✅ 没有新增的 `any` 类型（除非必要）
4. ✅ 没有硬编码的字符串（使用 i18n）
5. ✅ useEffect 依赖完整

### CI/CD 检查

每次 PR 必须通过：
1. TypeScript 类型检查
2. 构建检查
3. Playwright 冒烟测试
