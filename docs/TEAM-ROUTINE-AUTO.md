# 受控例行自动响应：默认关闭，未生产启用

本批只实现**响应指定员工新消息**的有限例行沟通。没有主动安排、定时追问、定时提醒、自动下达任务或自动验收；不能把 worker 持续运行称为主动跟进已经完成。没有任意自然语言持续沟通、通用敏感资料识别或生产负载承诺。

沿用消息事务事件、Config 持久队列、单店独立 worker、租约、确定性模型/回复 ID、现有管理员和频道访问、epoch/许可指纹/模型版本、来源指纹与预算。旧人工草稿和逐条审批模式不变。默认无策略即不处理。自动回复、消息请求去重、AI 来源、提醒 outbox、job 状态与持续授权审计同事务；回滚后复用已保存 ready 结果和同一回复编号，不重新调用模型。

## 明确授权范围

授权名单独立常量仅包含 Najwa、Chyntia、Naila、Sekar、Rizky、Rangga。每份自动策略必须绑定一个真实本店 staffId、以上一个姓名及同库准确姓名，且仅能是负责管理员与该员工两人的 `direct` 频道。不会按姓名自动搜索/分配身份，不改任何人的角色。被明确选定的员工可能已有 admin 身份，仍可作为消息来源；循环保护排除负责管理员自己的 ID 和所有 AI 标记消息，不假设六人角色。

只接受既存中国区凭据、当前已验证 ready 的连接及其版本/核验 revision。读取凭据不会创建缺失主密钥；不新增账号、JWT、订阅或密钥。负责管理员必须仍为本店在职真实管理员并在频道；员工必须仍在职、同店且在频道。处理前、预算锁后、结果落队列与发送前重新核对范围。停用、移出/归档、可见起点变化、暂停/禁用、模型配置或连接变化均停止执行/发布。

保留现员工 App 个人聊天语义；撤后台库存、财务等业务权限本身不等于撤个人聊天。不新增独立聊天禁权，也不扩展后台权限。

## 模型前的保守边界

这是正向完整语句语言，不是依赖关键词黑名单的“绝对隐私检测”。只接受下表完整语句（大小写、首尾空白及单个句末 `.`/`!`/`。`/`！` 可规范化）；任何附加文字、姓名、数字、附件、不同语言或未知表述都先落 `blocked/TEAM_ROUTINE_MANUAL_REQUIRED` 交人工，**零模型准入**。原文仍留在原私聊，供原有授权人工查看和手动沟通。

| 类别 | 可接受语句 |
|---|---|
| 收到/感谢 | `siap`、`baik`、`oke`、`terima kasih`、`已收到`、`谢谢` |
| 一般进度 | `sudah selesai`、`belum selesai`、`sedang dikerjakan`、`sedang bekerja`、`已经完成`、`尚未完成`、`正在处理` |
| 请求下一步 | `mohon arahan`、`apa langkah selanjutnya`、`请指示下一步` |
| 清洁进度 | `pembersihan sudah selesai`、`pembersihan belum selesai`、`sedang membersihkan` |
| 包材核查进度 | `pemeriksaan kemasan sudah selesai`、`pemeriksaan kemasan belum selesai`、`sedang memeriksa kemasan` |

工资、证件、健康、私人聊天、付款、处分、财务和不明确内容不在语言内；混合“siap + 私人文字”也拒绝。不会把被拒文字交给模型做分类。附件混合消息整条转人工，照片/文件不外送。

模型只接收重建后的 `{seq,actor,code}`，没有原文、姓名、身份编号、附件或其他业务数据。上下文最多六条、同一双人频道、当前许可开始与双方可见楼层以后，遇到未知/人工自由文本即截断，不桥接此前私人聊天；不跨员工/跨频道读取。模型只返回四种已审核回复代码之一，后端映射固定印尼语回复（确认收到、继续原有任务并反馈、请补既有证据、等待主管指示）。自由回复、额外字段或格式不明不会自动发送。所有完成陈述仍未经主管核实。

## 许可与生产准备

现 PUT `/api/team/channels/:id/workflow/policy` 可显式提交：`expectedVersion,enabled,paused,automaticSend:true,consent:true,employeeIds:[真实ID],expectedAiConfigVersion,expectedAiCheckRevision,routine:{version:1,employeeName:授权姓名,region:'cn',scope:'routine_codes_v1',dataConsent:true}`。负责用户/员工身份由当前认证取值，调用方不能任命。来源起点与核验 revision 由服务端保存。每次更改许可会失效旧任务，不能借恢复偷偷发送旧内容。

现 AI 设置页面能准确展示已保存自动模式并保留该模式的暂停/禁用字段；“切换为人工草稿模式”需要明确确认。没有新增自动启用表单或导航。当前聊天 badge 和审计明确“持续授权自动发送”，不会记成逐条人工批准。人工批准仍使用原标签。

后续生产准备必须先由父任务复核独立提交、完成适用检查与受验证部署，再为真实指定 ID/双人频道保存许可；使用既有 DB 与私有主密钥卷显式启动 `TEAM_WORKFLOW_RUN=1 TEAM_WORKFLOW_STORE_ID=<单一门店> node server/dist/workers/teamWorkflow.js`。本批未执行这些生产步骤。worker 无浏览器依赖，关机/休眠或进程停止不能继续运行。

费用和吞吐维持全店三次/分钟、原预算预留和最多三次人工可确认尝试。provider 超时/结果不明保留可能计费风险且不盲重试；证明未建立调用记录的限流/预算失败才安全退避。2秒扫描不是2秒答复保证；模型超时25秒、批次串行、页面3秒拉消息和推送投递周期均会增加等待。

## 观测与验证

`workflow.worker` 保存运行/停止时间、全量当前未解决状态、最近100条终态窗口、最新20条自动发送延迟、全部任务总数与最老等待时间。`stateScope/terminalWindow/latencyWindow` 明确统计窗口；旧历史不会遮蔽当前队列。超过60秒积压及 blocked/uncertain 产生去重的 `workflow.event` 告警状态变化，只能由原受保护游标读取，没有新增外部告警平台或主动员工通知。

聊天持久提醒由独立前置通知提交接线（见 `TEAM-CHAT-NOTIFICATION.md`），不是 routine 新建 daemon。只在既存订阅与密钥下投递 generic 无原文提醒；mock 接受发送不代表手机设备展示。

隔离验证：`python3 scripts/with-docker-test.py -- python3 scripts/test-team-communication.py --routine-auto`，一次性 PostgreSQL、真实认证/路由/服务事务、构造器注入模型。覆盖默认关闭、六姓名及真实身份/地区/频道、模型前未知/敏感/附件拦截、原管理员为员工来源、上下文、并发一次回复、暂停与撤成员/停用/AI变更、缺主密钥零创建、未知计费不重试、事务回滚后复用、3次/分钟/预算、505历史观测、零页面 worker 与 SIGTERM/重启去重。`team-routine-ui.test.cjs` 验证三语自动/人工 badge；既有 mock browser 检查保存模式、暂停/禁用保留授权和明确切回人工模式。

证据在 `output/staff-routine-auto`。本批没有真实模型、生产策略、真人消息、真机触达、广义自然语言持续沟通或主动定时跟进验收。
