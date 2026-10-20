# 通知队列最终隔离验证

current-final-regression-summary.json为当前服务源码的汇总：14通知HTTP + 7跨独立Node进程/队列恢复 + 5聊天 + 2员工工作台provider，共28组通过。current-*保存本轮日志和结果。first-19-*与exact-signal-before-logout-*保留较早增量证据，不当作最终组数。

使用固定storeId/key信号行，不扫描历史提醒JSON。独立子进程通过真实服务事务写消息/提醒/信号，API消费者只看已提交数据；回滚零投递，重启可恢复，重复扫描/并发入队不重叠投递。实际自有PostgreSQL停启验证连接恢复；受控投递拒绝验证同一缓存信号无需新写仍重试。单次HTTP到mock134ms、子进程commit确认到mock62ms只是各一个合成样本，不是P95、真机送达或真实模型速度。

wrapper批次bt-test-79c00f204050、bt-test-f671379113c8、bt-test-3f3f8b484291均自动清理；无生产worker、真实模型/Push、新凭据。
