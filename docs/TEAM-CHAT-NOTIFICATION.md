# 聊天持久提醒接线（隔离验证，未生产启用）

普通或 AI 聊天消息保存时，为当前同店、在职、仍属频道且具有消息可见范围的收件成员写入唯一提醒。排除发送人。消息、请求去重、原工作流队列与提醒在原频道事务中提交；提醒失败整次回滚。提醒 ID 按收件员工和消息 ID 确定，重复请求不重建。

提醒标题固定为“Pesan kerja baru / 新工作消息”，不含发送人、原文、附件名或图片。深链 `/team?channel=<频道ID>` 使用现有员工 App `/team` 路由与 `StaffTeamConversation` 的 `channel` 参数。深链不授予访问权，原频道成员和 `fromSeq` 检查仍生效。

员工工作台读取与现有 EmployeeReminder 投递器发前再次检查真实身份、门店、频道成员、归档、可见起点和已读序号。移出、停用、归档或越过可见起点的提醒隐藏/取消；已读消息取消待投递提醒。沿用员工 App 个人聊天可用性，撤后台库存/财务等业务权限不等于撤个人聊天；不新增独立禁聊规则。

投递复用现有订阅、私有 VAPID 配置和 Employee worker。投递函数现在只读取既存密钥，不创建密钥。没有订阅或既存密钥时留 `in_app`；旧会话订阅时间早于当前用户更新时间时停用，404/410 端点停用。消息/成员/已读状态在发前重查。现有投递 lease 和确定性 delivery key 保护正常重放与并发，不将供应商接受推送等同设备展示；崩溃在外部发送和保存回执之间仍是现有 Web Push 的不确定边界。

每用户未读、私有消息读取、已读游标持久化继续复用原聊天接口；打开别的频道不会修改本频道 read key。页面是否在前台、浏览器通知权限、有效订阅、操作系统通知设置、网络及既有约60秒 worker 周期都会影响实际感知。本批不申请通知权限、不创建生产订阅或密钥、不启动新 daemon；真实手机展示和点开验收留给后续受验证部署。

隔离检查：`python3 scripts/with-docker-test.py -- python3 scripts/test-team-communication.py --chat-notify`。仅一次性 PostgreSQL、真实路由/认证/事务、预置 synthetic 既存密钥、mock Web Push。断言不调用 `generateVAPIDKeys`，覆盖消息/提醒回滚、去重、无订阅/密钥、在职/成员/fromSeq/归档/已读、后台撤权仍保留 App、旧订阅、404/410。`team-chat-notification.test.cjs` 执行实际 service worker 的 push/click 处理，验证 `/team?channel=` 路由合同。没有真实模型、生产访问或设备送达验证。证据在 `output/team-chat-notification/http-results.json`。

本提交只处理聊天提醒，培训新版本、审批通知和统一入口由后续独立通知工作继续完成。
