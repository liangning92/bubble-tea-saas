# 🔒 Bubble Tea POS - 安全审查清单

> 每次修改安全相关代码后、每次打包前必须执行此清单
> 对应脚本：`scripts/security-review.sh`

---

## 一、认证与授权

### 1.1 密码安全
- [ ] `server/src/routes/auth.ts` - 登录响应中**绝对不能**包含 `passwordHash` 或 `user.password`
- [ ] `server/src/services/AuthService.ts` - 同上
- [ ] 所有 API 响应中检查是否有 `password`、`hash`、`secret` 字段泄露
- [ ] 密码使用 bcrypt 且 salt rounds ≥ 10

### 1.2 JWT 配置
- [ ] `server/src/config/env.ts` - JWT secret 不能是 `dev-only-secret` 或其他弱秘密
- [ ] 生产环境必须从环境变量读取 `JWT_SECRET`
- [ ] JWT expiresIn 不宜过长（建议 ≤ 7d）
- [ ] Token _payload 中不包含敏感信息

### 1.3 权限控制
- [ ] `server/src/middlewares/auth.ts` - `requireStoreAccess` 中间件已在所有需要门店隔离的路由上挂载
- [ ] 所有 `req.query.storeId` / `req.body.storeId` / `req.params.storeId` 都经过 `requireStoreAccess` 校验
- [ ] cashier/staff 角色无法通过手动传 `storeId` 访问其他门店数据
- [ ] `PERMISSIONS` 定义与实际路由使用的中间件一致

### 1.4 注册与角色分配
- [ ] `POST /api/auth/register` 只有管理员或特定邀请码才能注册 admin/manager
- [ ] register 接口的 role 枚举值与 `auth.ts` 中定义的 `Role` 类型一致
- [ ] 禁止普通用户注册 admin 角色

---

## 二、数据保护

### 2.1 敏感字段过滤
- [ ] `server/src/middlewares/auth.ts` - `filterSensitiveFields` 已覆盖所有返回敏感数据的接口
- [ ] 订单 items 中的 `bomCost` 对 cashier/staff 不可见
- [ ] 产品列表/详情的 `bomCost` 对 cashier/staff 不可见
- [ ] 员工薪资数据只对 admin/manager 可见
- [ ] BOM（物料配方）成本对非 admin 不可见

### 2.2 门店数据隔离
- [ ] 所有数据查询都包含 `storeId` 过滤条件
- [ ] admin 角色可以访问所有门店（设计如此）
- [ ] manager/cashier/staff 只能访问自己门店的数据

---

## 三、输入验证

### 3.1 API 请求验证
- [ ] 所有用户输入都经过 Zod/ express-validator 验证
- [ ] 验证 schema 中的类型与 Prisma schema 一致
- [ ] 字符串长度限制合理（phone: 10-15, password: min 6）
- [ ] enum 字段验证输入值是否在允许列表内

### 3.2 SQL 注入
- [ ] 不使用字符串拼接构建 SQL
- [ ] Prisma ORM 的参数化查询已覆盖所有数据库操作
- [ ] 无 `eval()`、`new Function()` 等动态代码执行

### 3.3 文件上传
- [ ] `server/src/routes/upload.ts` - 文件类型白名单验证
- [ ] 文件扩展名检查大小写不敏感
- [ ] 不接受 `../` 路径遍历（源文件名不直接用于存储路径）
- [ ] 上传文件大小限制有效（≤ 5MB）

---

## 四、API 安全

### 4.1 速率限制
- [ ] 认证接口（login/register）有 `rateLimit` 中间件
- [ ] 限制值合理（15分钟内 ≤ 10 次尝试）
- [ ] 其他敏感接口也有适当的速率限制

### 4.2 CORS 配置
- [ ] `server/src/index.ts` - CORS origin 是明确的白名单，不是 `*`
- [ ] 生产环境 `CORS_ORIGIN` 必须配置，不能默认

### 4.3 安全头
- [ ] `helmet()` 中间件已启用
- [ ] 不需要的 HTTP 方法被禁用（TRACE, OPTIONS 等）

### 4.4 错误处理
- [ ] API 不返回详细错误堆栈到客户端
- [ ] 错误日志记录到文件（electron-log）
- [ ] 没有 `console.error` 泄露敏感信息到响应

---

## 五、客户端安全

### 5.1 Electron 安全
- [ ] `contextIsolation: true`
- [ ] `nodeIntegration: false`
- [ ] `preload` 脚本只暴露必要的 IPC 方法
- [ ] 不使用 `eval()` 或 `new Function()`

### 5.2 前端 XSS
- [ ] 无 `innerHTML` 直接插入用户数据
- [ ] 无 `dangerouslySetInnerHTML`
- [ ] React 默认转义

---

## 六、基础设施

### 6.1 日志与监控
- [ ] 重要操作（登录、删除、权限变更）有日志
- [ ] 日志不记录密码或 token 明文
- [ ] electron-log 正确初始化，日志轮转（maxSize 5MB）

### 6.2 自动更新
- [ ] `electron-updater` 配置了正确的 GitHub 仓库
- [ ] 私有仓库配置了 `GITHUB_TOKEN` 环境变量
- [ ] 更新失败有降级处理

---

## 七、Electron 打包专项

### 7.1 asar 配置
- [ ] `asarUnpack` patterns 有 leading `/`
- [ ] `asarUnpack` 包含 `**/*.node` 和 `seed.db`
- [ ] `files[]` 不包含无效的 pattern（如根目录不存在的 `dist-electron/**/*`）

### 7.2 Prisma 引擎
- [ ] `schema.prisma` 的 `binaryTargets` 包含 `windows`
- [ ] `electron-builder.json` 的 `extraResources` 或 `asarUnpack` 包含 Prisma 引擎二进制
- [ ] `.prisma/client/libquery_engine-windows.dll.node` 存在

### 7.3 编译产物
- [ ] `client-pos/dist-electron/electron/main.js` 存在
- [ ] `client-pos/dist/index.html` 存在
- [ ] `server/dist/index.js` 存在
- [ ] `npm run electron:compile` 已执行

---

## 八、数据安全

### 8.1 数据库
- [ ] SQLite 数据库文件权限正确（用户目录，不可公开访问）
- [ ] 不在代码中硬编码数据库路径（在 .env 或运行时决定）
- [ ] seed.db 不包含真实业务数据或测试账号密码

### 8.2 密钥管理
- [ ] `.env` 文件已加入 `.gitignore`
- [ ] 生产密钥不提交到 Git
- [ ] 没有在代码中硬编码密钥（JWT_SECRET、API_KEY 等）

---

## 检查结果记录

| 日期 | 检查人 | 通过项 | 失败项 | 状态 |
|------|--------|--------|--------|------|
|      |        |        |        |      |

---

## 常见错误模式（供快速对照）

| # | 错误模式 | 正确做法 | 对应检查项 |
|---|----------|----------|-----------|
| 1 | `passwordHash: user.password` | 删除该行 | 1.1 |
| 2 | `req.query.storeId \|\| req.user!.storeId` 无校验 | 使用 `requireStoreAccess` 中间件 | 1.3 |
| 3 | `"server/prisma/seed.db"` 在 asarUnpack 无 `/` | `"/server/prisma/seed.db"` | 7.1 |
| 4 | `"dist-electron/**/*"` 目录不存在 | 删除该 pattern | 7.1 |
| 5 | `NODE_ENV !== 'production'` 时 JWT fallback | 严格检查 `NODE_ENV === 'production'` | 1.2 |
