# Hermes 通知与员工工作项适配

本线复用原生消息、employee.workspace 提醒/投递记录、员工 TeamTask 和审批感知投影。不创建平行通知库、任务状态机、worker 或模型调用。沟通桥基础提交 `3090beacaf7ca9f3fccd2ba2b03a67d458ce5d71`，必须含后续两项 P2 修复 `78bb84460f474d0b837c3f20ff108e81d6952d8e`（跨频道 requestId 并发锁、创建回放当前成员/归档复验），本候选已纳入。原生员工任务另补同 actor/requestId 锁，先于频道锁，避免两个频道并发重复执行任务请求。本地基线另含 master `783ab68963c1ce95528941c15bab47a94b30bf96`。

## 默认关闭与授权契约

`externalMcp/workItemTools.ts` 只导出注册工厂，未接生产 registry/router。`createWorkItemService(db,deps)` 只有显式 enabled=true 且 withActor、assertApprovalTarget 两端口都存在才可用。工具 JSON 不接受 actor、role、storeId、grantVersion 或 clientRevision。

可信 host 提供：

```ts
withActor: (database, action, context, operation) =>
  createTeamAgentBridge(database, bridgeDependencies)
    .withActor(action, context.task, context.channelId, operation)
```

`context.task={taskId,version}` 是 host 的智能体执行授权任务，和被操作的 `employeeTaskId` 不同。bridgeDependencies.tasks.assert 必须接真实授权任务状态，不能使用测试 allowlist。每次读取/真实写事务重查同门店、active sponsor、scope、grant/client版本、频道成员范围与历史 floor。host 工具 scopes 必须取已认证 token 与当前 grant 的交集，不能从工具 body 取值。新 scopes 未获生产批准，原 STOCK-RO-001 grant 不因此扩大。

保密隔离基础增量为 `bfad226973c67b21f59c101dde06c1d3fefa25eb`。`bridgeDependencies.communication` 必须由可信 host 实现：`assertContext` 证明独立 employee_work 任务、profile/模型及同隔间 memory，返回绑定当前 audience/权限/grant/client 版本的 compartmentKey、memoryNamespace 和 executionId；端口缺失或证明失配即拒绝。五工具仅调用该上下文准入，不接受工具 body 自报 executionId、来源清单或隔间身份。任务 get/assign/review 的原生事务也会重查，旧 receipt 不能绕过。

普通 `send.text`、`create.title` 保留自然语言 schema。仅准备测试频道/源消息时，夹具另实现合成 `admitOutput` 与 `authorizeSource`：出站证明绑定真实 textHash/requestId/executionId/compartmentKey/current audience hash，逐来源返回数据分类。本轮禁止 protected/unknown 数据出站；模板仅敏感拒答兜底。此处两个工作项夹具中的 synthetic public_sop 来源及 runtime proof 仅证明适配契约，不能复用作生产默认 allow。真实 Hermes runtime trace、独立 profile/记忆和 source ACL 尚未接通，生产工具仍未注册/授权。完整契约见 [沟通保密隔离说明](HERMES-COMMUNICATION-CONFIDENTIALITY.md)。

| 工具 | 动作 | 输入目标 | 业务边界 |
|---|---|---|---|
| team_delivery_get | delivery.read | channel/messageId/messageSeq/recipientStaffId | 只读当前可访问消息和当前收件人；不标员工已读、不重发 |
| team_task_get | tasks.read | employeeTaskId | 原生员工任务责任人、版本、期限、证据历史、状态及深链；排除 STOCK agentTask |
| team_task_assign | tasks.assign | requestId/roundId/minuteVersion/actionIndex | 从已确认纪要动作指派，保留既有真实员工责任人和日期；不能凭模型新正文直接任命 |
| team_task_review | tasks.review | employeeTaskId/requestId/expectedVersion/return或complete/note/criteriaConfirmed | 沿用原生状态机、计划 audience、真实 sponsor 管理权与 reviewer、显式验收条件；不能代员工 accept/submit/cancel |
| approval_awareness_get | approvals.read | domain/objectId | 另经必传 assertApprovalTarget 验证对象范围，再复用当前 sponsor 实际权限的精确对象投影；无审批执行 |

原生任务事件的 by 仍为 agent 身份；审计真实 user FK 是 sponsor，独立保留 agentId/grantVersion/clientRevision/task 来源，不冒充员工。任务写、幂等 receipt、提醒及固定 store signal 在同一事务。指派/退回/完成提醒仅给真实责任人；旧版本、解绑/停用、退出频道、历史 floor 或已变化计划均阻断投递。通知已读只影响通知，不能完成任务。

agent 指派/复核返回 `view=operation_receipt`，当前查询返回 `view=current`。复核旧请求先重查真实 sponsor 当前管理权和适用计划 reviewer；命中回执也不跳过。agent 回执保存原操作结果，不读取后续版本的新证据；重复指派或同纪要动作去重仅返回最初指派快照。旧 agent 回执若缺少保存结果则拒绝并要求有权限的当前查询，不能回落到当前 task；普通员工/管理员原生回放语义保留。

## 通知证据语义

- queued：持久提醒待现有消费者处理。
- service_accepted / partial_service_accepted：推送服务已接受请求，不等于手机显示。
- failed：记录到安全失败码（如 HTTP_410），不返回 provider 原文、endpoint、auth 或 key。
- not_confirmed：没有可证实的推送服务接受记录。in_app 不能推导“未曾推送”，需看既有 delivery 记录。
- device 始终 unknown；普通业务消息没有设备展示回执。现有用户主动自检才有 service worker 的 displayed/opened 报告，也不等于人已读。
- read 来自收件人的原生频道阅读游标，诊断读取不会推进它。
- later_message_observed 仅表示该员工后来在同频道发言，attribution=not_proven，不能冒称是对应消息的回复或结果验收。
- subscriptions.ready 仅是后台登记与身份时效符合投递条件，不证明 endpoint 仍有效或手机允许显示。SQL 只返回目标员工 active/issuedAtMs；不把凭据读入诊断进程。

日期型旧纪要没有精确时区/钟点，overdue=null；有原生 deadlineAt 才给精确逾期。evidenceVerification=not_performed 表示适配层没有自动核实图片/正文真实性，验收必须依赖实际证据和原生 reviewer 决定。

## 员工入口与主线接缝

相对深链：`/team?channel=...&message=<seq>`、`&work=1&task=<uuid>`、`&work=1&action=<uuid>`。仅定位当前授权频道真正加载的对象；未知/无权/加载失败有状态提示；换频道清旧目标。保留聊天、报告困难草稿、员工接受/提交和原生验收入口。

InboxService 由主集成线程独占，本线未改。合入时需保留既有 owner pending 投影，并补两个纯投影接缝：

1. chat 项的 adminUrl 使用对应 messageSeq（当前旧实现仅 channel）。
2. r.teamTask 的 adminUrl 使用 `/staff/communication` 加原 r.url 的 query；domain=team_task/objectId=taskId，pending 按当前 assigned/changes_requested，通知已读不得取消它。原生 APP 的 r.url 与状态流转已经可用。

本线没有改消息 MCP、agentTasks runtime、modelRelay/hermesTransport、Events 回调或管理核心状态机。最终 registry/生产发布由主集成线程统一处理，不能把本隔离工厂称作 Hermes 已在生产可调用。

## 验证与真实设备

`python3 scripts/with-docker-test.py -- python3 scripts/test-team-work-items.py --native-regression --bridge-regression` 使用官方 MCP 客户端/临时 HTTP 和单个临时 PG。旧端口基线原20组+2组原生任务受控并发共22组、16组桥（包含两项P2）、5组通知HTTP、67组原生沟通均通过。并发用例真实持有第一 receipt 读取并观察第二频道 PostgreSQL Lock 等待，证明 assign/review 两路径均仅1次变更。保密端口适配新增4组：五工具缺端口拒绝、错误purpose/共享memory/缺execution拒绝、body伪造proof在准入前拒绝、可信actor取得后原生任务读/指派/复核再查context；负例核对无持久状态或审计变更。CI 默认脚本包含工作项及通知5组、回执8组；桥/原生回归由各自既有域选择。另有10组既有设备、17组通知HTTP、7组跨进程/PG停启旧回归通过。均为合成账号/模拟 Push，无真实模型；新组合终态以精确SHA交付证据为准。

本次 bfad2269 端口适配组合在单批次 `bt-test-4ceb86566d30` 实跑：26组工作项、5组通知HTTP、8组回执、24组沟通桥及67组原生回归均通过，API编译通过；测试PG和wrapper资源已清理。该结果不包括真实host/trace/source ACL接线或生产grant。

`node tests/stoploss/team-work-item-target-browser-check.cjs`：真实 React 合成页面的消息/任务/行动定位和三宽响应式。不能代替真实手机。

回执权限 P2 的独立最小入口：`python3 scripts/with-docker-test.py -- python3 scripts/test-team-work-items.py --replay-only`。仅跑8组真实PG/官方MCP：当前降权下新/旧复核和读均拒绝、合法旧请求版本快照不含新证据、当前 reviewer/正文变化拒绝、指派两种去重无新证据、旧格式回执失败关闭、撤权与正常新复核/人工原生回放。默认工作项脚本也包含这8组；组合主线可只复跑此增量。

历史只读核实：2026-10-21 00:51 UTC，2 条订阅 active=0/eligible=0；01:09 UTC核实 Lawrence 为唯一 EMP005、active、cashier，存在既有管理员双人会话，API 已挂载四个 push-device 自检路由。该只读阶段没有发消息，没有读取/输出 key 值。

父已授权唯一发送者可给 Lawrence 该私有测试会话发一条标注测试的消息。执行前的最短设备配合：

1. 用户在自己的 Lawrence 员工 App 打开 `https://staff.aicube.online/profile#push-device-title`（Profil → Notifikasi ponsel），点 Periksa lagi，按页面自检处理未安装/拒绝权限/失效订阅，点 Aktifkan notifikasi / Sambungkan ulang 重新启用通知。
2. 查看该设备自检服务接受与 displayed/opened 状态，用户确认可以锁屏测试；不让程序代点系统授权。
3. 唯一测试发送者发一条标注测试消息，记录 messageId/seq 和服务端投递状态。
4. 用户锁屏观察是否显示；点通知，核对确切消息，再亲自回复指定测试文字。
5. 核对原生员工 read 游标/实际回复记录。任务反馈另使用已部署原生功能，不声称本轮尚未部署的新工具已可用。

本次授权真机测试已结束：用户自行启用后该账户有效订阅为1；唯一手动测试消息 seq10 于2026-10-21 08:46:27 WIB通过已部署Admin会话发出，推送服务约3秒后接受，随后真实Lawrence回复seq12“测试收到”。用户明确确认在iPhone锁屏看到通知；seq11为旧工作流AI自动回复，排除在真人回执之外。仅证明Lawrence这台iPhone的既有工作消息路径，不证明所有员工设备或新Hermes工具已接通。没有代用户标已读、扩grant或改生产策略；观察已停止，Admin标签已恢复释放。其他Android/iPhone设备及任务端到端反馈仍需实际配合；教程不据此批量派发。

## 迁云依赖

生产代码无 Mac 路径、localhost 地址或 OS 启动方式。须保留 PostgreSQL/Prisma 事务与 JSONB 只读元数据投影端口、原有持久 task/receipt/reminder/delivery/signal、当前单一通知消费者及其租约/重试/实例交接、可信 grant/task/object 授权端口、原生私有附件存储和站点 HTTPS/PWA/service worker/Web Push 配置。现有密钥通过部署的秘密供应方式迁移；不在代码或输出中复制。多实例继续使用现有投递幂等/租约，不新起平行工资/通知 worker。未采购、迁移或部署服务器。
