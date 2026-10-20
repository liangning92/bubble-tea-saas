# 员工消息感知（独立分支，未部署）

比较基准：`ceb25d4aa590b716822d6bacae8b92797953fe70`。本分支提供聊天未读、培训发布更新、当前审批待办和个人结果的统一消息入口；不修改财务审批、退款、扣料或工资执行逻辑。

## 可见行为

- 后台顶部和员工首页提供消息入口；员工底部团队入口显示聊天未读。消息中心显示聊天、培训、业务提醒和审批结果，待办数量独立显示。
- 会话列表显示当前成员有权读取的最后一条消息摘要。只统计其他成员在个人阅读游标之后的消息；列表浏览和消息中心浏览都不会确认聊天已读。实际打开会话、取得消息后才确认该会话游标。
- 培训草稿不通知；真正发布新增或变化的课程/检查表才生成个人提醒。同内容重复发布不重复通知。打开具体当前资料后才确认该条已读，不写学习完成或检查表勾选。
- 当前实际有权处理的人看到审批待办，包括旧待办，不受最近100条列表限制。读通知不清待办；节点完成、过期、撤销或权限失效后不再计入。结果只给真实申请人/业务参与人，详情通过原有权限接口取得。
- 两端消息感知在页面可见时每5秒刷新，回到前台/焦点时刷新；请求重叠被阻止；HTTP请求15秒超时后可恢复刷新；异常成功响应会被结构校验隔离为消息加载失败，不使整个页面崩溃，保留最近有效数据并可重试。身份切换会中止旧请求并立即隐藏旧数据。培训资料和其独立已读提示每30秒同步。

## 服务与权限

`GET /api/staff-work/my/inbox` 返回个人 `items/chats/counts`；`POST /api/staff-work/my/inbox/:id/read` 只保存个人阅读状态，拒绝额外身份字段。聊天阅读必须走会话原生接口。

`NotificationInboxService` 每次重新读取 User、active Staff、所属店和业务权限，不信任客户端角色、人员选择或旧权限快照。个人 APP 聊天/培训仍遵守既有个人权限；管理权限撤销不等于禁止个人 APP。后台培训提醒另遵守后台 `training.read`。审批只读感知可跨 APP/后台展示本人当前节点，执行仍由原生路由独立授权。

服务使用已有 `employee.workspace` Config 存储，阅读键为 `inbox.read.<userId>.<noticeId>`。不复用营销的全店通知阅读状态。提醒绑定实际 userId/staffId，跨店、账号解绑、停用和会话成员范围变化均重新校验。

审批投影、首轮历史结果基线、节点权限和准确页面映射见 [approval-notices-20261020.md](approval-notices-20261020.md)。培训发布事务/指纹及失效规则见 [TRAINING-UPDATE-NOTICES.md](TRAINING-UPDATE-NOTICES.md)。

## 投递

聊天提醒与消息保存使用同一事务，提醒写入失败则整条发送回滚。培训提醒与正式发布使用同一事务。审批收集接入既有提醒 worker，替换原重复的结果提醒；排班、卫生分配/到期、培训任务和调班对方已同意的进度提醒保留。

无订阅或缺少已有推送密钥时仍保留站内消息。此链路不创建密钥。推送只含通用标题及应用内定位，不带聊天正文、审批金额或敏感资料。发送前重新核验当前身份、成员/节点和已读状态；读过的消息不再补推。失败次数耗尽记为 `delivery_failed/partially_sent`，不会伪报全部送达。

成功的消息 HTTP 请求在最外事务完成、response.finish 后，按门店以25ms合并唤醒既有 deliver；不调用 collect 或 processLatePayroll。只有既有 API 员工 worker 已启动才启用此同进程优化，单独导入服务不会启动投递。

独立 AI worker 依靠同一事务的持久信号行跨进程唤醒：enqueueChatReminders 最后写 `employee.workspace.notification.chat.pending={eventId:message.id}`，没有正文或秘密。API 内500ms轻扫门店ID及每店这一固定键，使用既有(storeId,key)唯一索引，不扫描历史消息/提醒JSON；值变化唤醒同一 deliver。扫描单飞，数据库失败退避，投递数据库失败保留队列并重试；重启从持久信号/提醒恢复。无额外进程、LISTEN连接、API端点、密钥或数据库权限。AI原子服务适配器仍只需已有 config/staff 等端口，不需要 raw。

原60秒收集/补漏及工资处理频率保持不变。快速扫描只覆盖聊天信号；审批收集仍为60秒，前台数量直接投影当前节点，不等待此周期。500ms是扫描节拍，加上数据库/调度/transport耗时，不能当成手机送达承诺。真实手机仍取决于已有订阅、provider、浏览器与系统设置；mock transport 成功不代表真机送达。

## 独立复审修复

初始acaf候选独立复审P1=0/P2=3，原报告保留在 `output/notification-p2-review/original-review-acaf9327.md`。本增量逐项修复：

- 后台审批详情按会话、身份、门店和目标隔离，切换即隐藏旧记录，迟到列表/详情及错误不能恢复旧的可审批对象。真实React先复现旧缺陷，再验证修复，见 `output/notification-admin-approval-race-20261020`。
- 两端培训以实际展示资料的source快照计算与服务端一致的canonical SHA256，显式匹配通知指纹，异步计算结束再次校验展示对象/身份/位置。旧正文不能确认新版提醒；未变资料跨总版本仍可读，见 `output/training-content-race`。
- 投递领取租约后，在transport调用前重查read/个人marker以及当前订阅、active Staff、User会话时间；已提交阅读不补推。最终状态加提醒锁读取新值合并，与HTTP已读使用同一锁，不能写回旧read=false；已经开始的transport不能撤回，但并发阅读仍保留。相关14组HTTP还验证租约后HTTP注销/旧token订阅失效，不把注销当作阅读。

82fc独立增量已确认原三项闭环及500ms通路，但新增订阅续订竞态P2：旧snapshot失效写回会覆盖HTTP200续订。增量将lease前/后失效及404/410统一为Config.value精确CAS，只允许失效仍等于所观察（或实际发送）的订阅版本；续订/注销已提交的新字段完整保留，无需改接口、schema或引入新锁平台。原增量报告在 `output/notification-p2-review/independent-increment-82fc2f67.md`。新固定候选仍必须独立复核此项并重新执行精确CI，不能用旧SHA绿灯放行。

## 当前验证与限制

- 订阅CAS增量真实临时PostgreSQL/HTTP：通知17组（新增租约前/后续订、注销、404/410交错3组）及独立Node进程/队列故障7组，共24组通过并自动清理；先用108e旧worker内存overlay复现续订被覆盖，再以当前编译服务通过，证据 `output/notification-awareness/subscription-cas-*`。此前82fc的聊天5组、员工工作台SQLite/PostgreSQL各1组等28组汇总仍保留；培训11组、审批投影及团队沟通67组的固定源以各证据为准。最终固定源由精确CI重新验证，不能混称同一批次。
- 当前真实 React 页面的合成 API 浏览器检查：两端消息、超100条审批定位、两端培训；手机390、平板768、桌面1365/1280，保留原控件，未见横向溢出。截图及脚本在 `output/notification-awareness-ui-20261020`、`output/notification-approval-target-ui-20261020`、`output/training-update-notices` 和 `output/training-admin-notices`。
- 团队原测试的未读断言改为按真实消息作者计算，保留13条完整消息、游标单调及并发序号检查。旧培训管理单元夹具显式使用空员工列表；发布提醒仍由真实数据库回归验证。旧员工工作区投递夹具改为先验证缺密钥站内保留，再用两个纯合成字符串验证既有密钥的 mock 投递，断言零密钥生成。
- 旧acaf CI的工作流超时已用实际构建页面复现为inbox夹具返回[]造成的React错误边界，修复运行时响应校验并补明确接口夹具；原20组完整保留、超时不变，先保留旧异常夹具验证校验有效，再用正确夹具通过，见 `output/notification-workflow-ci-fix`。
- API/Admin/Staff/POS Web 均受真实共享组件依赖影响；Windows Electron 源未改，不构建安装器。最终范围以固定提交的 `ci-scope.json` 为准。
- 库存盘点模型没有提交人字段，只给实际 `countedBy` 参与人结果；不虚构收件人。无 Staff 的真实管理员可读取自己的站内审批，不虚构员工/推送身份。
- 真实生产业务页、真实手机送达和真实 worker 运行尚未验收。本任务不部署，不更改生产账号/角色，不操作真实审批，不生成推送密钥，不发送员工通知。
- AI 自动回复/生成/发送由独立线程负责；本分支只保留消息保存后的原子提醒，不包含 routine 自动回复提交。
