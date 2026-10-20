# PR269 通知总独立复审

固定 HEAD：`acaf93275b3272c93711f6b2fd0ee80362fea39e`。完整比较基准：`ceb25d4aa590b716822d6bacae8b92797953fe70`；初始受测提交：`6e802c1c9538fae1a5f20199692344e7e262cd38`。

**结论：P1 = 0，P2 = 3，保留代码阻断，建议修复后再次复审。** 下面三项均由独立探针复现，相关源码在 acaf 与 6e 逐字一致。后台挂起 HTTP 永久停刷这一作者已知问题，已由 acaf 的 15 秒 timeout 修复并独立验证，不重复列为当前 finding。

## P2-1：后台审批通知的迟到详情覆盖当前通知目标

位置：`client-admin/src/pages/StaffApprovalPage.tsx:10`，相关 effect 为 `:11`，可操作记录渲染及 action 为 `:12`、`:13`。

新增详情补取没有请求序号、AbortController 或当前身份/门店/noticeObject 的响应守卫。通知 A 不在最近 100 条内时，先请求列表再等待 A 详情；此时同页切换通知 B，B 先成功显示；A 的旧详情随后返回，仍直接 setRows，将 B 替换成 A。页面 URL 和当前通知定位仍为 B，但界面显示 A 的金额/理由和批准、拒绝按钮。这会使用户在从 B 通知进入后操作错误申请；不是原生后端权限绕过。

独立复现：真实 React `StaffApprovalPage`，只拦截合成 API。挂起 `/approvals/late-target-a`，同文档导航到 `?noticeObject=current-target-b`，等 B 记录出现后释放 A。结果：URL 为 B，`oldTargetVisible=true`、`currentTargetVisible=false`，浏览器异常 0，没有发送批准/拒绝。

证据：`repo-pr269-6e802c1c/output/independent-review/browser-observations.json` 中 `admin_approval_late_detail`；可复现脚本 `browser-probes.cjs`，截图 `admin-approval-late-target.png`。建议将身份、门店、通知目标纳入响应归属，切换时隐藏旧数据，中止或忽略迟到请求；共享 StaffApprovalInbox 的保护不能替代这个后台页面的独立保护。

## P2-2：新版培训通知先到时，会把仍未展示的新版资料标为已读

位置：`client-staff/src/pages/TrainingPage.tsx:283`、`client-staff/src/utils/trainingNotices.ts:42`、`:50`。后台对应实现也仅按 key 匹配：`client-admin/src/pages/staff/TrainingListPage.tsx:133`、`client-admin/src/utils/trainingNotices.ts:43`。

资料和消息分别异步刷新。通知 hook 接收到新版本的更新后，页面只凭已打开课程的 key 调用 markRead；hook 也只按 kind/key 找未读通知，没有证明通知 fingerprint 对应当前实际展示的资料。资料请求尚未返回时，当前弹窗仍是旧内容，新通知却会被确认已读。这违背“打开实际当前资料后才确认该条”的约定，可能让员工错过刚发布的操作更新。

独立复现：真实 React 员工 TrainingPage 打开 r1 的 `review-course`，弹窗实际显示 `OLD CONTENT ACTUALLY DISPLAYED`。随后让消息请求返回同 key 的 r2 新通知，同时挂起资料刷新。无需再点击，页面已 POST 新通知的 `/read`，而旧内容仍在弹窗，r2 资料响应仍未释放。`newNoticeReadPost=true`、`oldContentStillDisplayed=true`，浏览器异常 0。没有写学习完成、检查表勾选或业务记录。

证据：同目录 `browser-observations.json` 中 `training_notice_ahead_of_catalogue`、`browser-probes.cjs`、`training-new-notice-old-content.png`。建议把确认对象与当前实际展示内容的 fingerprint/有效版本绑定；不能仅因为 key 相同就确认新通知。未把“revision 不同但内容相同”本身认定为错误。

## P2-3：领取投递租约后提交的阅读被忽略，且末尾写回旧 reminder 快照

位置：`server/src/services/EmployeeReminderService.ts:345`（发送前检查），`:395` 的结束状态写入；较早的阅读检查位于 `:273`。

阅读检查只在领取发送租约之前执行。租约提交后，另一个设备可成功提交已读；发送前虽重新读 latest，却只检查 cancelled，没有重新检查 latest.read 或独立 inbox.read marker。于是会补推已经读过的通知。末尾 `{...r,status:...}` 还会将旧快照中的 read=false 写回 reminder。独立个人阅读 marker 没有丢失，因此不能表述为消息中心必然重新变未读；但外推抑制及 reminder 阅读字段发生了错误。

独立真实 PG/HTTP 时序：对个人已批准结果生成提醒及合成订阅；让真实投递 claim 事务先提交，再暂停返回；通过真实 `/my/inbox/:id/read` 提交阅读，确认数据库 reminder.read=true；恢复 worker。结果 mock 外推 1 次，最后 reminder.read=false、status=sent。业务申请仍 approved，个人阅读 marker 保留，没有真实外推。

证据：`repo-pr269-6e802c1c/output/independent-review/probe-observations.json` 中 `read_during_delivery_claim`，`extra-probes.js` 中同名探针，`http-probes.log`。建议发送前重查最新阅读状态和个人 marker，并以最新状态合并投递结果，避免覆盖并发阅读或取消。此复现特意保证阅读在 transport 调用前已完成，不要求撤回已经发出的推送。

## 已独立检查并通过的范围

已读取当前 AGENTS 与 BATCH 规则；本次只读、draft、不合并部署指示覆盖默认自动发布。独立 checkout 两个固定提交，检查完整 diff 和新提交增量，没有修改作者树，也没有纳入 PR267 或另一 AI routine 分支。

服务端完整差异覆盖：fresh User/Staff/门店身份、employee header 的个人入口、管理与业务权限投影、结果所属人、旧结果 baseline、旧重复事件替换、成员 preview/fromSeq/本人不计未读、训练发布事务和 fingerprint 幂等、提醒收集/投递租约及终态。

界面完整差异覆盖：两端全局入口/轮询、身份切换响应守卫、同源路径限制、业务对象标记、日期/状态定位、超 100 条详情补取、培训查看与学习状态分离、共享组件的 POS 消费关系。新后台审批页和培训确认的上述时序缺口仍保留。

独立执行结果：

- 6e API 构建（tsc）成功；acaf 的 server/src 与之完全相同，因此没有无谓重构建 API。
- 随机一次性 PostgreSQL、真实路由/认证/事务：原通知 10 组通过；额外 6 组独立探针中，5 组符合契约，1 组复现 P2-3。`http-results.json` 的 passed=16 表示脚本各断言/观察完成，不代表上述业务缺陷不存在。
- 额外符合契约的检查包括：员工站内感知不授予原生管理执行（PUT 审批 403，源记录仍 pending）；107 条旧待办完整投影，阅读后 pending 仍 107；历史结果默认已读、不重放旧结果；新结果只给真实本人；调店后的旧 token GET/POST 均 401 且不写阅读；三次终结失败标 delivery_failed，不伪报 sent。
- 原真实 HTTP 组还覆盖：跨店/伪造角色及人员拒绝、非成员无私聊 preview、只原会话游标确认、无订阅站内保留、不生成 push key、聊天提醒/原工作流事件原子回滚、培训草稿静默/发布失败整笔回滚、撤权及节点结束取消 queued push、404/410/旧会话订阅失效。
- 独立真实 React 页面配合合成 API 的两个探针分别复现 P2-1/P2-2；不是作者测试脚本的零问题结论。
- 在 acaf 单独运行实际 AwarenessProvider、awarenessClient 和真实 Axios。本地 HTTP 故意挂起 GET/read，分别约 15390/15087ms 后返回 timeout，focus 后恢复刷新，浏览器异常 0。作者已知超时问题闭环。
- 新 SHA 独立范围计算得到 api/admin/pos/staff 四组件；notificationAwareness/chatNotification/teamCommunication 均选择，Electron 类型及 Windows 源未选。所有 finding 的源码已对父提交逐字比较并保存哈希连续性证明。

## acaf 增量与 CI

6e→acaf 仅一个业务源文件变化：后台 awarenessClient 的 GET/read 增加 15000ms timeout。旧 employee-workspace 测试夹具先验证缺 key 时 0 投递、in_app、无 key；再显式种合成已有 key，用独立事件验证两次 deliver 只投一次，并禁止 generateVAPIDKeys，原 expiry/logout/薪资断言保留。该修正符合新投递契约，没有为绿 CI 放宽实际权限；SQLite/PG 双 provider 结果属于作者证据，本次未重复整套运行。

旧 [CI 39383263838](https://github.com/liangning92/bubble-tea-saas/actions/runs/39383263838) 为 6e 且失败，不能作为 acaf 的成功证据。新 [CI 39384205439](https://github.com/liangning92/bubble-tea-saas/actions/runs/39384205439) 的 headSha 已独立核为 acaf；报告快照时仍 in_progress，类型、翻译、单元/审计等前置成功，HTTP 运行中，构建/浏览器未完成。未宣称新 CI 通过，即使后续转绿，上述三个独立复现也仍需修复。

## 证据、清理和未验边界

原探针及失败证据保留在 `repo-pr269-6e802c1c/output/independent-review/`：`extra-probes.js`、`bootstrap.cjs`、`owned-pg-review.py`、`probe-observations.json`、`http-probes.log`、`browser-probes.cjs`、`browser-observations.json`、两张截图和 `build-server.log`。真实 HTTP 汇总为相邻 `output/notification-awareness/http-results.json`。

新 SHA 的 `repo-pr269-acaf9327/output/independent-review/` 保存 `timeout-browser.cjs/.json/.log`、`source-continuity.json`、`local-ci-scope.json`、`ci-status-at-review.json`、`exact-ci-run.json` 及复审 attestation。

测试全部经项目 with-docker-test 包装器顺序执行。成功 PG 批次 `bt-test-24ca43d23c9e`、React 缺陷探针批次 `bt-test-6c0c1a7d7acd`、超时浏览器批次 `bt-test-48342e2ea1cc` 均清理完成。前两次独立测试设置失败（合成 PG 用户名不一致；额外身份字段被更早的 403 拒绝而非本测试初写的 400）不是产品 finding；其日志及清理记录保留，批次 `bt-test-786a8b8c10c9`、`bt-test-294567b8dcff` 也已停止 PG/删除目录并完成外层清理。

真实边界：HTTP 测试使用真正 PostgreSQL、Express、JWT 认证、中间件和服务；浏览器使用实际 React 页面/组件与 Axios。Mock 边界：所有账号、业务记录、密钥字符串、API 浏览器响应和 Web Push transport 均为合成数据。没有读取真实凭据、接触真实浏览器/账号、向员工发通知、调用模型、操作生产或合并部署。

未验：生产页和生产数据、真实设备通知权限与收取/点击、真实 push provider、生产 worker、全库回归、四端整套本地构建/全部 audit、真实多实例基础设施故障。两张独立页面截图用于证明内容/目标时序，不构成全响应式 UI 验收；作者的 22 张合成图没有替代本次独立证据。
