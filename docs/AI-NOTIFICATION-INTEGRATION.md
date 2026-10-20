# AI 回复与聊天提醒的事务整合

本地整合以 PR268 `fd0e8de8` 为 AI 基线。通知 PR269 候选已更新到 `1bab5a94`（含订阅失效CAS、两处既有浏览器夹具automatic JSX修正及员工通知请求通道修正），其最终独立复审与精确CI须按最新SHA验收；本文件不构成上线验收。PR267、PR270不在整合范围。本轮没有新增真实模型调用、生产策略、员工消息或常驻进程。

## 共同提交边界

`TeamCommunication.send` 保留完整授权、`expectedLastSeq`、服务端草稿 `contextLastSeq`、内部 routine proof、人工接管 pause/version/epoch、审计和幂等回执。在同一事务中依次 await `enqueueTeamWorkflow` 与 `enqueueChatReminders`。提醒失败会一起回滚消息、频道序号、请求回执、草稿发送状态、接管策略和 workflow 事件；不能在 hook 内独立提交或吞错。

独立 AI worker 与 API 是不同进程。同进程 `wakeEmployeeDelivery` 无法唤醒另一个进程。统一契约是提交后的 `pending` 聊天提醒 outbox：通知分支在 enqueueChatReminders 同事务末尾写单店固定 key `employee.workspace.notification.chat.pending={eventId:message.id}`（不含正文/secret）；既有 API 每500ms读门店ID后按 `(storeId,key)` 唯一索引精确读取该 signal，值变化合并唤醒既有 deliver，避免扫描历史消息/JSON。重启 seen 为空从持久队列补漏，投递数据库错误在500ms重试；保留60s补漏，不提高 collect/payroll 频率，不新建进程、凭据、数据库权限或端点。HTTP成功后的25ms唤醒只优化同进程路径。该实现已在组合树用真实独立 routine worker 与另一 API 进程的默认500ms扫描验证：只有提交后的回复 signal 和 pending reminder 可见，投递为mock。通知自身24组HTTP/跨进程/真实PG停启恢复同样通过；不等于真实手机送达。

## 发布失败的恢复

模型生成成功但最后消息事务失败时，重新在频道锁内读取原 job、ready 草稿和确定性回复请求回执。只有数据库证明没有最终回执且 ready 结果仍存在，才释放本次租约供下一批重用结果；不再次调用模型。三次已确认发布失败转人工审核。若回执与 reviewed job 的回复 ID一致，认定提交已成功，即使客户端丢失事务成功应答也不重发。异常回执转 uncertain；没有新数据库证明时保留原租约，超过120秒源事件过期后不得追发。

人工接管/暂停后，已过期租约的 processing job 转 blocked 并保留计费证据及原 ready 结果，允许管理员处理；有效租约仍等待持有者完成或到期，不抢占。

## 临时候选验证

31组隔离 PostgreSQL/真实 HTTP routine 测试覆盖原20组及11组融合场景：人工消息与人工AI稿发布回滚、自动回复回滚后重用同一模型结果、成功提交应答丢失、三次发布失败上限、失败后人工/AI相反胜出、暂停后租约终结、数据库不可用时原租约/真实TTL保留，以及员工消息列表/收件箱/已读可见性。源消息、普通人工接管、人工AI稿批准及routine四种路径均在事务内真实写完signal后抛错，验证失败不新增/改写signal，成功重试提交对应message.id。模型全为受控 mock，禁止非回环网络。

另通过30项scope/routine/chat单测、API/Admin/Staff构建、旧聊天67组、chat5组、通知HTTP17组与队列跨进程7组、原workflow23项浏览器检查。Admin与Staff实际React界面均验证AI回复正文和完整来源标记可见。最终通知源变更后须重新锁定整合提交、运行适用检查和独立复审。

原 PR268 单次真实 MiniMax 验收独立存档：源提交观察到回复提交观察7331ms，transport区间6806ms（含Docker/stdio及已部署kind=draft包装）。只有一个真实样本，不计算P50/P95或承诺1–2秒；24个mock样本的423/475ms经验P50/P95不能代替真实模型性能。没有额外真实调用。

新增目录姓名快照避免把授权称呼当目录主键：staffId仍精确绑定，只有显式 `employeeRecordName` 与当前目录完全一致且第一完整词与六人规范名相符时，才允许小写/全名目录记录；没有快照保持原严格模式，目录更名后旧许可阻断。合成测试含真实cashier权限语义，未升权、未提交真实员工全名。

订阅失效仅在保存值仍等于被检查/实际发送的旧快照时CAS更新；HTTP续订或注销先提交的新状态不得被旧worker覆盖。404/410以真正送出的live snapshot为CAS前提。最终源新SHA须通过组合精确CI与独立复审，本文件不继承旧SHA失败CI或旧scope review为最终通过。

员工个人通知GET/read POST使用员工端既有http、API_BASE及即时会话token，明确employee通道；审批兼容client的pos通道保持不变。Admin通知继续admin通道。真实双端浏览器断言检查两个方法的header，不放宽原staff-basic通道断言；保留15秒超时、离线拒绝及仅当前会话401注销处理。
