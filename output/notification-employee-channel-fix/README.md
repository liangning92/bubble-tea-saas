# 员工消息客户端通道修复

精确CI39391996522在staff-basic-access-page-check.cjs:18实际观察到X-Client-App=pos而非employee；此前通知、培训竞态、workflow、日期、订单、POS支出和工资页面均通过。此处原断言有效，不是夹具错误。

新通知客户端误用了staffPermissionClient，后者为了原审批兼容在api.ts明确固定pos头。修复只让notificationAwareness使用既有员工http/API_BASE及当前会话Authorization、employee通道；不修改审批客户端、后端授权、端点或角色。继承原http的15秒超时、离线守卫和401处理。

真实React双端通知回归新增GET inbox和阅读POST通道断言（员工employee、后台admin），原阅读/竞态/超时/异常响应断言全部通过。Staff类型和构建通过。原staff-basic保持不变，三种权限状态及随后29路由×375/768/1440全部通过。按本次已选CI失败处到末尾顺序验证，库存盘点两脚本也通过。

尾部原training-management测试实际发现两个“重试”按钮的strict selector歧义：提醒status和正文alert各有一个。仅将原正文失败恢复测试精确限定到已断言错误文本的alert，再点击其重试；未使用first/nth、未延长超时、未删除恢复/发布/编辑断言。此完整原脚本随后通过，见training-content-retry-final.log。selected-browser-tail.log保留此前真实歧义前态，其前面各脚本PASS。

本地尾部harness只用已构建Staff的本地静态文件服务，无生产代理，finally关闭服务；每个原测试finally关闭自有浏览器/Vite并删除临时入口。所有API、身份、业务和Push均合成，无生产或真实模型/外推。

12c的CAS、原三P2和跨进程代码逐字未变；原独立P1/P2=0结论按连续性延续，新客户端差异与测试定位修正仍需新固定SHA精确CI及必要独立复核。
