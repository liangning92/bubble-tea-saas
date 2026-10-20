# CI39384205439 工作流页面超时定位

旧精确源acaf9327在workflow-settings combobox处10秒超时。本地使用实际构建后台和原夹具复现，截图before-failure.png显示React错误边界：Cannot read properties of undefined (reading unread)。原测试的通用API fallback为[]，新增个人inbox调用因而得到非契约数据；错误被React边界捕获，所以pageErrors为空不能代表页面正常。

修复包括个人inbox运行时结构校验（无效响应显示消息加载失败，保留最近有效数据并能重试）和工作流夹具显式返回items/chats/counts。先只加运行时校验、保留旧[]夹具，原20组通过（guard-with-original-fixture-results.json）；再补正确夹具，原20组再次通过（final-results.json）。没有增加超时、删除断言或跳过工作流。

两端真实React额外验证初始异常响应不崩溃、后续恢复，以及异常刷新保留有效个人数据，证据在../notification-awareness-ui-20261020/browser-report.json及malformed-response截图。全部API、身份和模型为合成数据，无生产或真实模型/推送访问。
