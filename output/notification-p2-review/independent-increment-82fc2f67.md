# PR269 固定候选增量独立复审

固定 HEAD：`82fc2f67939f63c5a3c9a259925309a4c1784d95`；本轮比较基准：`acaf93275b3272c93711f6b2fd0ee80362fea39e`；PR 完整基准仍为 `ceb25d4aa590b716822d6bacae8b92797953fe70`。

**结论：原三项 P2 均已独立验证闭环；本轮 P1=0、新增 P2=1，继续阻断。** 此外精确 CI 的浏览器步骤失败，不能宣称发布门禁通过。本报告保留原 `通知总复审-PR269-acaf9327.md`、原 SHA 及原复现证据。

## P2：旧订阅快照会覆盖已成功续订的新会话

位置：`server/src/services/EmployeeReminderService.ts:438` 并行读取，`:449` 比较，`:450–451` 失效写回。

新增的 transport 前复核同时读取 liveSubscription 和 liveUser，但它们不是原子快照，且失效写回没有 CAS/订阅版本检查或与 HTTP 续订共锁。当订阅旧快照已经读出、User 查询尚在等待时，同一用户可更新会话并通过真实 HTTP 成功续订同一 endpoint。随后 User 查询看到新 updatedAt，worker 将它与旧 issuedAtMs 比较，认为订阅失效，并用 `{...liveSubscription,active:false}` 覆盖数据库中刚续订成功的记录。

这会丢失新 issuedAtMs、active=true 及可能同时更新的订阅内容，使新登录设备的后续消息不能通过此订阅投递；不是向旧会话越权外推。本次 mock 外推为 0，但新有效会话被错误禁用。较早的 `:375–386` 也存在旧快照失效写回，修复时应采用一致的版本/条件写入策略，不能只在末尾重新读一次。

独立真实 PG/HTTP 复现：

1. 用真实 `PUT /staff-work/my/subscription` 建立合成 endpoint 的订阅，创建待投递聊天。
2. worker 已领取投递租约；让 subscription 快照查询完成，暂停第二次 User 查询。只延迟独立测试适配器，业务服务不改。
3. 合成 User.updatedAt 更新为新会话失效时间；使用新 issuedAtMs 的 JWT 再次通过真实 HTTP PUT 续订相同 endpoint，HTTP200，数据库 active=true 且 issuedAtMs 已更新。
4. 放开 worker 的 User 查询。最终订阅 active=false，issuedAtMs 被还原为旧值，新值不再保留。

结构化证据为 `output/independent-review/probe-observations.json` 的 `subscription_renewed_during_final_lookup`：httpRenewalSucceeded=true、beforeActive=true、afterActive=false、afterIssuedAt=oldIssuedAt，且不同于 renewedIssuedAt。复现代码位于同目录 `added-probes.js` 和已注入的 `extra-probes.js`；完整日志为 `http-probes.log`。

建议只在订阅仍是所观察的版本时失效，可使用条件更新/CAS，或和 HTTP 注册/注销协调同一锁；不要用旧对象覆盖新会话。须覆盖租约前、租约后、续订和注销的交错。此项独立于原“阅读导致多推”P2，后者本次已闭环。

## 原三项 P2 闭环

| 原 finding | 本次独立实际结果 |
|---|---|
| 后台 A 详情晚到覆盖当前 B 通知 | 原探针调整修复期望：URL 为 B，currentTargetVisible=true、oldTargetVisible=false；403/404 清空，切换账号后旧响应不可见。使用真实 StaffApprovalPage 和 Axios、合成 API，无审批操作。 |
| 旧课程展示时把先到的新通知标已读 | 两端实际 React 培训页面分别验证：r1 弹窗仍显示旧正文、r2 资料请求挂起时，r2 read POST 为 0；r2 正文实际渲染并打开后才确认对应通知。通知 fingerprint 由合成 source 的 canonical SHA256 构造，不以随机 key 相同作为正向证明。 |
| 领取投递租约后阅读仍补推并回写 unread | 原真实 PG/HTTP 探针保留：先 claim，后 HTTP read 成功，再放开 worker，mockSendsAfterRead=0、finalRead=true、finalStatus=in_app。补充已开始 mock transport 后阅读，再完成发送，read=true/in_app 仍保留。 |

源码审查还确认：后台隔离包含账号/token/门店/noticeObject 与请求序号和 abort；培训 hash 后检查阅读 generation、当前身份、可见性及当前打开对象；HTTP markRead 与 deliver 更新 reminder 使用共同锁并合并最新阅读 marker。上述源码检查不替代本轮实际重放。

## 跨进程信号与必要增量

新信号为每店固定 Config key `employee.workspace.notification.chat.pending`，只含 eventId；在 `enqueueChatReminders` 的原消息事务内写入。scanner 仅读门店 ID 及固定 key，500ms 调度、单飞、错误退避；25ms 同进程 wake 在 HTTP 事务成功且 response finish 后触发。模块导入不启动投递器，工资与 collect 仍走原 60 秒 worker，不含 AI routine、真实模型、接口或凭据创建。

在独立的同一临时 PG 中顺序运行：

- 通知 HTTP 共 22 组：当前仓库 14 组加本方保留/扩展的 8 组。7 个独立业务边界符合契约，另 1 个独立观察复现上述新增 P2；脚本 passed=22 不代表不存在 finding。
- 队列/进程共 9 组：仓库 7 组独立重跑，加本方 2 组。覆盖真实独立 Node 子进程 staged transaction 在提交前不可见、提交后投递、回滚不投递、scanner 停启恢复、并发扫描单飞、在途新增消息去重、实际本批 PG 停止/启动及 DB 恢复、已缓存 signal 后 dispatcher 失败恢复。
- 本方额外注入固定 signal 写入失败，确认消息、提醒和 signal 同时回滚；再让两个独立进程向同店不同频道写入，固定信号锁串行提交后，两条消息各投递一次，同店最大并发 delivery=1。没有把单一样本时延表述为 P95 或真机到达时延。
- 真实 React 独立浏览器探针完成后台乱序/身份/失败清空及员工、后台两端 notice-first/content-later 正反向检查，pageErrors=[]。没有执行真实审批、学习完成或勾选。
- API build 含 tsc 成功；范围选择器 27/27 通过。本地完整基准到固定 SHA 的选择为 api/admin/pos/staff，保留真实共享消费者与新增回归，无 Electron/Windows 源变更。

`shared/NotificationAwareness.tsx` 的成功响应形状校验会拒绝旧夹具返回的 []，使错误留在消息组件；工作流夹具显式补实际 inbox envelope，未删除原 20 项、未延长超时。该增量符合已声明 API 契约。本轮没有重跑全部生产界面或将作者日志当作独立通过。

## 精确 CI

[CI 39389217963](https://github.com/liangning92/bubble-tea-saas/actions/runs/39389217963) 的 headSha 已独立核为 `82fc2f67…`。实际 verify 已失败于 `Run related browser regressions`；verify_full skipped。具体失败为 `tests/stoploss/store-date-settings-page-check.cjs:21` 的 `getByLabel('Store timezone').selectOption` 等待 30000ms 超时。此前通知、双端培训内容竞态及原工作流浏览器步骤已完成，不代表后续所选页面都已通过；没有据此推断生产原因。日志与最终步骤状态保存于 `exact-ci-run.json`、`exact-ci-failed.log`。没有复用 acaf 或更早 SHA 的成功记录。即使 CI 后续另行转绿，新增订阅竞态仍需修复。

## 证据和清理边界

独立副本：`/Users/liangning/Documents/Codex/2026-10-19/task-5/repo-pr269-82fc2f67`。作者树未修改；受测 server/src、shared、clients、scripts、tests 与固定 SHA 一致。所有新增测试代码仅在本方 output 目录及运行时临时入口，入口在 finally 删除。

证据目录 `output/independent-review/`：

- `probe-observations.json`、`extra-probes.js`、`added-probes.js`、`bootstrap.cjs`、`owned-pg-review.py`、`http-probes.log`：保留原探针、新 P2 和阅读 merge 验证。
- `queue-bootstrap.cjs`、`queue-extra.js`、相邻 `output/notification-queue-wake/current-results.json`：9 组真实跨进程/DB 检查。
- `browser-probes.cjs`、`browser-observations.json`、`browser-probes.log`、三张截图：原 UI finding 闭环及两端内容指纹正反例。
- `build-server.log`、`ci-scope-tests.log`、`local-ci-scope.json`、`cleanup.json`、复审 attestation、精确 CI 元数据和日志。

全部测试通过项目 with-docker-test 包装器顺序执行。成功 PG 批次 `bt-test-865e3650fe44` 已停止/删除，wrapper 清理成功；成功浏览器批次 `bt-test-ae28b5dcae6a` 已清理，浏览器/预览服务关闭。此前独立测试适配器缺 Prisma 方法的批次 `bt-test-e1751671166a`、后台培训测试入口未切到课程页等本方夹具问题对应的浏览器批次 `bt-test-81bb2ec6a045`、`bt-test-e9f20fda118a` 均 finally 清理；这些是本方夹具修正，不列产品 finding，前态日志保留。

未验：生产页面/业务/账号、真实设备送达与点击、真实 Push provider、生产 worker、真实多实例基础设施规模和长期性能、真实模型及完整全库回归。真实部分为 PG、Express/JWT/原中间件和服务、独立 Node 进程、实际 React 页面与 Axios；Mock 部分为全部身份/业务/密钥字符串、浏览器 API 及 Push transport。没有生产读取/写入、真实外推、密钥生成、合并或部署。
