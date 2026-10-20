# 外部 MCP 只读任务：标准协议隔离验收

依赖 PR270 配置分支 `123afc398990f5fb786771af80a7ccab68790036`。本阶段只增加协议/资源鉴权适配与测试；不修改原 AI/通知链，不部署、不在 index 挂载任何 MCP 地址，也没有生产启用路径。后台配置依然只能保存 disabled。

## 最小方案

- 官方 `@modelcontextprotocol/server@2.3.1` 的 `createMcpHandler` 处理 Streamable HTTP；`@modelcontextprotocol/node@2.1.1` 适配实际 Node HTTP。不手写 JSON-RPC 或 OAuth 流程。
- 当前官方规范是 [2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)。v2 使用每请求协议元数据；同一 SDK 官方 `legacy: stateless` 兼容层接受 2025 客户端的 `initialize`。不使用协议会话作为认证，未实现 SSE 旧传输、通用回调或唤醒 dot。[SDK 兼容说明](https://ts.sdk.modelcontextprotocol.io/v2/serving/legacy-clients)
- 唯一工具 `read_task(channelId, taskId)`，参数严格拒绝额外字段。只有 `tasks.read` scope，无任何写工具、SQL、shell、模型或对外网络能力。
- 每次请求用官方 `requireBearerAuth` 检查 Bearer，并发布 SDK 生成的 RFC9728 资源元数据。没有 `/authorize`、`/token`、refresh 或 client secret 接口。[SDK 资源服务器鉴权](https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization)

## 鉴权和现有权限

成熟 `jsonwebtoken` 校验受信任公钥签名，仅接受 RS256 的 `at+jwt` access token，强制固定 issuer、精确 resource audience、exp/iat、jti/sub/client_id 与有效 scope。拒绝登录 token、HS256/none、错误签名/受众/发行者、过期及未来 iat。密钥由受信任运行配置提供；不访问 token 内 jku/x5u、不转发门店登录 token，不从 token 中接受门店或角色。

服务端绑定 key 是 issuer/client_id/sub 的哈希，唯一记录决定 storeId、委托 user/staff、registration、授权/客户端版本及最多10个任务。绑定属于 `externalAgent.` 内部配置，通用 `/api/config` 已由 PR270 禁止读写。每次实际请求重读绑定/注册及委托员工；token jti 哈希撤销、整绑定撤销、配置授权版本变化及客户端更换均拒绝旧请求。没有 enrollment 管理 API，也不会自动给新客户端授予任何范围。

实际读取在事务内与 PR270 使用同一门店 advisory lock，并重读授权。委托 actor 强制使用普通 staff/employeeApp 身份，不继承管理员能力，不传 auditReason。复用 `TeamCommunicationService.tasks` 的当前真实员工、频道成员、fromSeq 及任务 audience 约束，再只取绑定中指定的单个任务。响应仅 id、version、status、最多1000字任务说明和 dueDate；不返回员工身份、事件、证据、附件、会议、来源消息或整频道任务列表。不存在写入业务任务的路径。

审计独立写入 `externalAgent.mcp.audit.v1.*`：服务器解析的 userId/staffId、主体/客户端哈希、配置/绑定/授权/客户端版本、允许或拒绝的 task.read。请求鉴权拒绝交给必需的结构化 securityAudit sink（仅动作码/HTTP状态）。不记录 token、原始 jti、请求正文或任务说明；SDK schema 拒绝在工具执行前发生，只有请求级鉴权记录，不冒称业务读取成功。绑定校验失败时安全 sink 记录拒绝，不向不可信主体推断门店。

## 双重禁用与测试隔离

默认 `externalMcpHandler` 一律503，甚至不构造数据库连接。只有显式 isolated-test + NODE_ENV=test + 唯一 BT_TEST_RUN + DATABASE_URL 为 loopback/team_test + HTTP resource 为 loopback 才构造连接；连接由验证过的 URL 内部创建，不接受任意 db 对象。绑定还必须标记 isolated-test。此处不把 disabled/frozen 配置改成 active，也不能用测试 enrollment 启用生产。Host/Origin 与资源 origin 受校验，输入上限16KiB。

这不是完整 OAuth 授权服务器或生产连接验收：测试密钥/令牌只在进程内为合成身份生成，经 loopback 请求使用，不写文件/日志；issuer metadata 中的 .invalid 地址只是测试夹具，从未访问。

## 验证方式

```
npm ci --prefix server
npm run db:generate
npm run build:server
node server/node_modules/jest/bin/jest.js --config server/jest.audit.config.cjs --runInBand --runTestsByPath server/audit-tests/external-mcp.test.ts
python3 scripts/with-docker-test.py -- python3 scripts/test-external-mcp.py
```

临时 PostgreSQL 与唯一批次 loopback HTTP 由 finally 清理。官方 v2 Client 与官方仍维护的 v1 `@modelcontextprotocol/sdk@1.32.1` Client 都经实际 HTTP 连接；测试不是直接调用 mock 内部函数。记录 wire 方法以证明 v1 的 initialize、tools/list、tools/call，另验证 v2 协议、401/403及元数据、门店/频道/任务/成员/fromSeq限制、撤销与版本变化、最小化、审计及业务数据不变。单元安全测试另覆盖更多畸形令牌。

## 生产仍需的条件与一个决定

用户需要决定使用哪一个可信 OAuth 2.1 身份/授权提供方（已有 IdP 优先）。不以门店现有 HMAC 登录 JWT 代替，不为省事自建 OAuth。之后才可对接该提供方的 client registration、PKCE/用户同意、可信 JWKS 轮换或标准 introspection/撤销、稳定 HTTPS 资源地址，并验收真实客户端。当前只验证资源服务器的签名 token 适配，没有完成真实提供方登录/同意/刷新流程。

生产 enrollment 还须有数据库全局唯一的 issuer/client/sub 绑定约束及明确管理审批，独立不可变审计存储与容量/保留策略、速率/并发限制、超时和真实代理验收。当前 Config 表只按 store/key 唯一；读取时发现多个门店同绑定会拒绝，但这不构成并发 enrollment 的数据库唯一性保证。本阶段没有生产 enrollment 写路径，不能自动铺开为 Agent 平台。

真实凭据、持续访问、生产挂载/暴露及权限扩展需另行明确确认；均未在本阶段执行。
