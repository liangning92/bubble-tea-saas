# 外部智能体接入：第一阶段契约

本 PR 提供可实际保存的后台接入配置管理、权限和隔离 mock 契约；不是生产 MCP 服务。后台设置 → AI 设置末尾可新增、编辑、读取、校验、撤销或移除外部客户端，查看审计。源代码已挂载管理 API，但尚未部署至生产；无凭据签发、真实连接、事件唤醒、模型调用。现有 MiniMax provider/worker 不变。

## 架构与边界

现有 `TeamCommunicationService.messages/tasks` 校验 TeamActor 门店、真实成员和 fromSeq；`TeamOperationsService`/`TeamWorkflowService` 承担草稿、真实管理员批准与发布。通知线程拥有 NotificationApprovalService 等，不把 MCP 建议变成财务审批或自动员工消息。

新增 `services/externalAccess` 独立 namespace `externalAgent.access.v1`，不复用内部 provider 密钥。配置包含接入名称、`mcp_compatible`/`adapter_required`、启停意图、单门店和频道白名单、工具白名单、强制人工审批。初版工具只定义 `tasks.read`、`messages.read`、`task.suggest`，不开放库存、SQL、shell、直接发消息、任务下达、批准或全库。库存以后需要独立业务资源授权适配，不能用门店权限推导全库存读取。

`enabled=true` 明确返回 409 `EXTERNAL_PRODUCTION_AUTH_NOT_IMPLEMENTED`；保存不会声称连接。无凭据字段，认证生命周期仅 `unconfigured → revoked`，未实现签发/轮换/授权恢复。编辑、更换客户端和撤销均冻结执行并提升版本；尚无恢复执行接口。保存及撤销审计只保留结构化身份、注册ID、版本、动作和时间，不记录配置名称、令牌、输入正文、模型内容或异常详情。

Postgres repository 采用每门店 advisory transaction lock、在事务中重新读取 admin User 与 active Staff、配置与审计同事务写入。读取损坏/跨店状态失败关闭。除 mock 调用形状验证外，临时 Postgres 回归会通过实际 authenticate/访问声明/Express 路由验证配置持久化与并发版本冲突；所有账号和数据库均为隔离合成数据，不能据此宣称生产已验收。状态当前为单门店 JSON aggregate，适合此小范围骨架；正式启用前须补独立不可变审计存储、分页、容量/保留策略与数据库集成回归，不扩为通用智能体平台。

## 管理 API 与后台页面

`externalAccessRouter(service, authenticate)` 已在 index 挂载 `/api/external-access`；七条访问声明均 ownerOnly，服务层还会重查当前管理员及 active Staff。`externalAgent.` 已加入通用配置内部保护，防止 `/api/config` 读取或覆写绕过专用权限与审计。以下为相对路径；未部署，不能当作当前线上已存在：

| Method | Path | 行为 |
| --- | --- | --- |
| GET | / | 当前管理会话门店的接入配置 |
| POST | / | 新建（expectedVersion=0，默认禁用） |
| PUT | /:id | CAS 修改并冻结旧授权 |
| POST | /:id/revoke | CAS 撤销并冻结 |
| POST | /:id/validate | 仅配置契约校验，返回 configuration_validated / authenticated=false / productionEnabled=false |
| POST | /:id/remove | CAS 移除配置，保留审计；注册 ID 不复用 |
| GET | /audits | 当前门店最近200条配置审计 |

页面放在现有 AI 设置页末尾，不新增或调整一级导航，保留原模型和工作流模块。支持中/英/印尼语及桌面/平板/手机；编辑字段不接收秘密、不能切换门店。写请求失败后锁定编辑，必须重新读取系统状态再重试，避免未知结果自动重复写入。此工厂不提供 MCP token 认证，也不把管理登录令牌作为 MCP token。配置校验不运行客户端，不称“连接测试通过”。真正客户端调用测试位于独立 mock gateway 测试，使用合成授权与资源，NODE_ENV 非 test 会拒绝创建。

## 隔离 mock 契约

`isolatedMockGateway` 没有网络、MCP wire protocol 或真实令牌验证，不能挂到 Express。测试注入 mock authenticate/authorize/read/binding。每次调用检查认证、有效期、门店、注册主体、配置/授权/客户端版本、工具与频道白名单、执行冻结；所有读和建议均必须重新校验委托主体的当前频道/业务权限。请求 schema 严格拒绝客户端 storeId 等额外字段。

建议只生成 `pending_human_review / executed=false` 的测试结果；绑定 task/channel/注册主体/处理者版本，相同 requestId 同内容幂等、内容变更拒绝；frozen/uncertain/旧处理者拒绝提交。mock 建议仅在测试内存保存，**没有生产建议实体、审批执行或跨进程幂等保证**。正式适配时须在系统数据库事务中保存调用/建议、任务处理者、授权版本和结果，不把客户端当事实源；先冻结旧处理者，核实未知执行结果，再由明确管理动作完成交接。不能直接将此内存 mock 用于生产或使多个智能体执行同一任务。

## 规范核验与真实启用条件

2026-10-20 查看官方 latest 跳转到 2026-07-28：

- [Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)：HTTP 受保护 MCP 服务作为 OAuth 2.1 resource server；实现 RFC9728 资源元数据/授权服务器发现，资源指示与 audience 校验，每次请求验证 token，有效期与撤销；不得 token passthrough。授权服务器与真实资源拥有者委托尚未选定/实现，须明确批准后接入。
- [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)：当前规范使用 POST MCP endpoint、Origin 校验、JSON/SSE 响应、协议版本及请求元数据；该版本移除 GET stream 与协议会话。真实客户端需明确版本兼容策略，不能照搬旧 session 方案。此 PR 不实现该传输或自创 MCP 协议。

真实启用还需：选定授权服务器、客户端注册/委托身份与有限 scopes；受众/过期/撤销/重放验证；生产建议存储及事务授权；协议SDK与目标客户端兼容、安全限流和故障/恢复验收；生产后台界面真实Web验收；独立复审和用户对真实凭据、持续访问与权限范围的明确确认。Sites 私有适配层只是候选，未建立；MCP 客户端主动调用不代表可通过任意回调唤醒 dot。

## 验证

```
node server/node_modules/typescript/bin/tsc --noEmit -p server/tsconfig.json
node server/node_modules/jest/bin/jest.js --config server/jest.audit.config.cjs --runInBand --runTestsByPath server/audit-tests/external-access.test.ts
```

审计测试的 safety.cjs 禁止网络。新增 `python3 scripts/with-docker-test.py -- python3 scripts/test-external-access.py` 使用唯一批次临时 Postgres、loopback HTTP 与实际后台构建执行保存/重载、客户端替换、通用配置保护、并发 CAS、跨店拒绝、撤销/移除、错误恢复和三语响应式验证，finally 清理临时数据库。覆盖配置拒绝、权限、CAS、撤销、脱敏、未认证/过期/越权、冻结、委托撤销、受限建议、幂等和未知结果。`ci-scope.cjs` 只新增独立 externalAgentAccess 规则，自动选择同域审计测试；不构建POS。未做生产页面/真实外部客户端验收；隔离数据库与页面验收不代表生产 MCP 已连接。
