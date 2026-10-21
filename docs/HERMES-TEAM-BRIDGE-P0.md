# Hermes 团队沟通 P0 隔离适配

范围：独立 agent 身份、受限员工目录/角色、任务绑定工作会话、增量消息、私有附件读取、发言/回复、自身阅读游标、员工消息事件及持久待执行关联。复用 TeamCommunicationService；不新造聊天业务库，不要求普通聊天逐条人工审核。

## 默认边界

- 仅提供显式注入工厂；没有修改 agentHandler、agentTools、productionAgentBindings、pilot host、OAuth、生产 grant、现有 Events 回调或模型配置。默认 disabled，工具工厂也默认不注册。
- grant resolver 和 task authorization port 必传，无默认允许。模型/工具 body 不接受 storeId、agentId、grantVersion、clientRevision、role 等身份字段。
- grant 固定 agentId/storeId/sponsorUserId/version/clientRevision/expiresAt/actions/staffIds/channelIds。每个动作检查当前 grant，真实 sponsor 必须是同店 admin/manager 且有 active Staff。停用、撤销、到期及版本改变立即阻断。
- 请求内 WeakMap capability 使普通 JSON 不能伪造 TeamActor。作者为独立 `agent:<uuid>`，显示 agent 名称和运营智能体标识；真实 sponsor 仅提供审计 FK 和明确授权来源，不假称员工发言。
- 工具：store_team_directory/channels/create/messages/attachment/send/receipts/markRead/changes。任务/频道参数绑定由 backend task port 每次重新核验。工厂 scopes 必须由可信 host 取已认证 token 与当前 grant 的交集；本轮未接入任何生产 host。

## 会话、任务、消息

新工作会话只能选择当前授权 staffIds 内的 active 员工，并继承同一门店范围。原生 group 会话、创建幂等 receipt、任务关联索引与审计同事务；获得创建锁后重新授权。索引使用已保护的 externalAgent.teamBridge.v1.*，普通 config read/list/post/batch/delete 不能编辑。

本轮可用的是通过桥新建并持久绑定的工作会话。已有会话不会自动加入 agent、不会读取任意私聊；若后续接入既有会话，需可信配置流程明确 agent 成员、历史 fromSeq、任务关联索引与授权频道，单写 channelIds 不会使未知会话可读。

消息沿用原生序号、requestId 幂等和提醒事务。agent 发送额外要求 expectedLastSeq；replyToSeq 必须是当前成员范围内的真实可见消息。消息持久存 taskRef、replyToSeq、agentId、grant/client 版本；重复 requestId 改正文/任务/回复对象会冲突。agent 发言不会再入已有模型工作流，避免自身回复循环。

员工原生消息在同一事务记录最小 pending 关联，失败时消息和序号整体回滚。数据包括 eventId/taskId/taskVersion/channelId/messageId/seq/state=pending，无正文、秘密、回调或模型调用。任务版本是来源快照，后续执行必须重新读取并校验当前版本，不以旧 pending 决定动作。

changes 按原生增量序号/fromSeq 返回 team.message_created 最小事件；相同消息稳定 eventId，重连/重复扫描不会新建第二待办，也不会开始执行。消息提交后即有 pending，不依赖首次 changes 调用。没有在本轮新增 worker、timer、MCP Events subscribe 或 webhook 投递；由主线程整合现有授权 host/事件投递，不能据隔离事件投影宣称 dot 已被真实唤醒。

## 附件与已读

attachment 复用原生频道文件授权，再由注入存储端口加载最大 2 MiB 内容，I/O 后重验授权；不返回本机路径或公共 URL。当前只读附件，不实现 agent 上传/发送新附件。

markRead 仅更新 agent 自己的游标；员工阅读仍由员工 App 原生接口记录。receipts 明确 device=unknown，消息 stored、推送服务接受、设备展示、员工阅读、任务提交/验收不互相代替。投递结果/员工任务/审批感知由通知工作项适配线程负责。

## 与员工任务适配的接缝

bridge.withActor(action, taskRef, channelId, callback) 仅向可信服务提供作用域内 actor。identity.teamAgentTaskAuthority(db,actor,action) 精确匹配 tasks.read/assign/review，事务内重查授权和真实 sponsor active Staff/V2或legacy权限；返回 sponsor actor，不给 role=agent 全局 manage。原生任务的 audience、reviewer、expectedVersion、证据及状态机仍由任务适配负责。本轮未修改这三个任务方法。

## 验收命令与限制

- server tsc；admin/staff tsc；git diff --check。
- 初次提交已通过：14组官方MCP/真实临时PG桥接用例；67组原生沟通回归；34组CI范围决策。独立代码复审已修复3项并确认无新增明确P1/P2。
- CI范围已新增 teamAgentBridge 域及隔离脚本入口。
- `BT_TEST_RUN=bt-test-team-agent-<batch> python3 scripts/test-team-agent-bridge.py`：官方 MCP 2026-07-28 客户端＋随机本机 HTTP＋临时 PostgreSQL，使用合成员工、授权、task port 与附件存储，不连接生产。
- `BT_TEST_RUN=bt-test-team-native-<batch> python3 scripts/test-team-communication.py`：原生团队沟通回归，模型/通知传输均为 fixture。
- 临时数据库和上传目录在 finally 清理；没有修改正式卷。

真实未验：新 OAuth/team scopes 的真实授权、Hermes profile 工具暴露、实际员工消息/设备与阅读、真实业务 task port 组合、主线程 Events 投递、实际前端 agent 消息展示与响应式截图。不能把隔离测试称作生产已开通。本轮不部署、不扩库存24h grant、不生成凭据。

## 迁云依赖

生产代码不写 Mac 路径、localhost 拓扑或启动方式。须保留：事务数据库中的会话/消息/幂等 receipt/关联 pending、私有附件存储及授权加载端口、可信身份及实时 grant resolver、任务授权端口、原生通知投递 wake 与恢复、主线程 Events 的持久投递/重试能力。迁云需迁移这些持久数据并配置新网络/秘密供应；新实例重连使用持久序号与 eventId。pending 本轮只表示待执行，没有执行器领取租约，未来消费者必须复用主线执行权/租约，不能多实例直接执行。未采购或迁移服务器。

## 3090beac 独立复审后的最小修复

- agent 发消息的 requestId 回执作用域为 store/agent/requestId。现在先获得该作用域的数据库锁，再获得频道锁、重验授权、读取回执及产生任何消息/提醒副作用；不同频道并发不能各自提交冲突正文或任务。普通员工发送锁顺序未改。
- 所有可信 agent 的原生 channel 读取都检查实际返回的同一频道快照（任务关联索引、成员范围、active 员工、归档状态），包含 create 幂等回执重放；创建 capability 不再因最初没有 channelId 跳过对象授权。
- 修复后本轮实际运行 16 组官方 MCP/临时 PostgreSQL：新增跨频道并发的真实数据库锁等待＋唯一消息/回执断言、同频道并发正向，以及 grant 字节不变时由原生管理员改成员/恢复/归档后的 create 回放拒绝。日志 output/team-agent-bridge/p2-regression.log；结果 output/team-agent-bridge/result.json；临时数据库清理完成。
- server tsc 在本次修复代码上通过。67 组原生回归、admin/staff 类型检查和34组CI范围结果属于上一提交验证，本轮未宣称重新运行。
- 生产仍默认关闭，未部署、扩 grant、发送真实消息或调用模型。最终放行由主线程对固定增量复审决定。

## 后续保密准入增量

自然语言send.text/create.title仍保留，但现在必须由可信employee_work runtime/source policy端口提供当前执行与输入/输出来源准入；缺失默认拒绝。附件增加分类及全受众边界。真实runtime尚未接线；完整威胁模型、保留能力与未验条件见 HERMES-COMMUNICATION-CONFIDENTIALITY.md。
