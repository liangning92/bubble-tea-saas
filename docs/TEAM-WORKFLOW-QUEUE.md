# 员工沟通处理队列：隔离开发批次

本批基于 master a10d812e3dbc6fb4a5463fa50d58161be51723af；该基准与线上 1d51c4b54f2e947d23847f48fb6720f0c01ad5b7 源码树一致。保留现有图片、聊天和管理权限边界。未部署、未启用真实员工自动发信，没有数据库迁移。

## 当前实现

员工消息保存时，在同一频道事务内写入持久处理记录与状态事件。默认无策略即不处理；只接收管理员明确授权的频道和员工。管理员消息及标注为 AI 的消息不再触发处理。

复用 Config 的门店隔离、频道事务锁、现有 MiniMax 加密凭据与费用网关。模型只收到该员工选定单条文字，不含附件和其他频道消息。结构化结果包含印尼文回复草稿、带消息引用的中文员工陈述、限定类别的任务建议和异常；没有工具或业务写入接口。

持久状态包括排队、处理中、等待安全重试、待人工处理、草稿已人工处理、结果不明、阻断、人工关闭。租约 120 秒，并发消费者只能领取一次；30 秒起指数退避、最多三次尝试。证明没有建立模型调用记录的限流/预算失败可以自动重试；pending/uncertain 不自动重新调用。人工 `reconcile` 只检查已保存结果，不再次外呼；新尝试必须同时确认批准和可能重复计费。`billingStatus` 区分尚未调用、可能计费和已有用量记录，实际扣费仍以供应商为准。

处理前、取得 AI 预算锁后、结果落队列时再次检查真实管理员、有效员工、频道可见范围、成员列表、策略和模型配置。暂停后生成的结果阻断待复核。员工已停用、频道已归档或 AI 已关闭时仍允许管理员暂停或禁用；恢复必须重新满足所有执行条件。

回复发布、任务下达、审批状态、幂等和审计在同一事务提交。任务只可分配给原消息员工，由当前审批管理员验收，截止时间及标准由人工提供。员工接收、本人证据、退回、补交、主管明确核对标准等继续使用原接口。`reviewed` 仅指草稿已由人处理，不能解释为任务完成。公共记录为已批准的频道消息和既有任务；AI 私有草稿不开放给员工。

退款、财务、工资、处分不自动决定。模型提出相关内容或异常时只能等待人工处理；不能把员工口述或 AI 草稿当作已核实证据。

## HTTP 接口与父对话接入断点

统一前缀 `/api/team/channels/:id/workflow`。均使用现有应用认证，真实系统管理员、当前频道成员且员工身份有效才可调用；处理记录进一步限于原策略管理员。员工客户端、仅有审计权限或店长模板均不能绕过此限制。

| 方法、路径 | 内容 |
| --- | --- |
| GET `/policy` | 策略；不存在时 enabled=false、paused=true |
| PUT `/policy` | expectedVersion、enabled、paused、employeeIds、consent=true、automaticSend=false；操作者由服务端身份确定 |
| GET `/jobs?after=0` | 每页最多 100 条，cursor 为源消息序号，hasMore 表示继续拉取 |
| GET `/events?after=0` | 每页最多 100 条状态事件，无员工正文；cursor 为独立事件序号 |
| POST `/jobs/:seq/actions` | requestId、expectedVersion、action、note；审批需 approved=true |
| GET `/export?after=0` | 每页最多 50 个处理记录及关联任务中文汇总，cursor/hasMore；AI 草稿与员工陈述、证据、人工结论分列 |

action 支持 `approve_reply`、`approve_task`、`reconcile`、`retry`、`dismiss`。回复可带人工修订后的 replyText。任务批准需 content，沿用 `team.operations.plan.v1`，只允许一个原员工任务、reviewerId 必须为当前管理员。retry 额外需 acknowledgePossibleCharge=true。重复 requestId 相同内容返回现有结果，内容变化拒绝；旧版本拒绝。

父对话仍需一个经过平台授权的鉴权桥，负责把事件游标保存为消费进度、读取最新 jobs/export、展示人工批准请求并携带幂等 requestId 提交。当前 `events` 是拉取游标接口，尚无 SSE/WebSocket、Webhook 或向父对话投递回调；不能宣称已经自动回到聊天对话，也不能通过复制用户 token 充当接入。

所有 AI 配置仍归“设置 → AI设置”，未新增一级导航；本批没有新增后台管理页面或调整既有页面。后续策略与审批页面应归该设置入口并复用团队沟通使用页。

## 独立消费者

入口 `server/src/workers/teamWorkflow.ts` 编译为 `dist/workers/teamWorkflow.js`。API 主入口不导入、不自动启动它。只有显式设置 TEAM_WORKFLOW_RUN=1 和唯一 TEAM_WORKFLOW_STORE_ID 后，独立进程才会每两秒消费持久队列；不是客户端即时推送。消费者必须复用现有加密密钥所在的私有卷及相同配置，不应创建或复制新生产凭据。

本批不增加生产 Compose 服务、不运行消费者、不保存生产策略。后续需审查独立进程资源、日志告警、Config 队列/事件保留与归档规则、大量待处理记录的容量及处理时延；本次合成验证不代表生产负载验收。自动发送字段严格固定 false，启用策略也只生成草稿。

## 验证

`npm run build:server`；通过 `scripts/with-docker-test.py` 和 `scripts/test-team-communication.py` 运行完整团队 HTTP 回归。新增夹具 `tests/stoploss/team-workflow-queue-check.cjs` 使用临时 PostgreSQL、合成账号及注入模型，网络守卫禁止真实外呼。64 组（原有 47、新增 17）通过，包括事务回滚、并发租约、未知计费、人工核对、三次上限、分页、暂停与完整证据验收闭环；配置变化阻断崩溃恢复时，仍保留可能计费的标记。范围单元 96 项、审计 26 组共 203 项通过；最终固定 SHA 的 CI 另行记录。

CI 范围识别覆盖队列、服务、消费者和夹具；单独改夹具也会安装服务端依赖并执行沟通 HTTP 检查，不选择无关 POS 回归。真实模型连通性是独立验收，不能把这些模拟结果当作已经接通供应商。
