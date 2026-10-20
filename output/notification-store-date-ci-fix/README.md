# 精确CI39389217963剩余浏览器阻断

82fc2f67939f63c5a3c9a259925309a4c1784d95的类型/翻译/单元/审计/真实隔离接口/四端构建通过，通知与培训竞态、原workflow20、UI优化和会话复用也通过；门店日期测试超时，不能把此CI当通过。

本地原夹具复现同样超时，实际/settings仍在原URL但React错误边界显示“React is not defined”（before-failure.json/png），不是英文label改变或inbox响应异常。测试createServer配置configFile:false，丢失项目Vite的自动JSX转换，shared组件在client-admin tsconfig范围外被转为React.createElement，却没有React全局。

只补esbuild:{jsx:'automatic'}，与项目jsx:react-jsx和@vitejs/plugin-react一致。门店时区/日期保存重载、scoped store payload、Yesterday查询和其他原页面预设全部通过，超时和断言未变。保留失败诊断以便下一次错误可直接定位。

同一已选CI后续的payroll-finance夹具具有相同配置，亦先实际复现React is not defined（before-payroll-finance.log中的ARIA错误页面快照），仅补同一设置后原只读工资/待发金额/财务明细断言通过。未改工资、金额或业务源码，没有真实工资访问/写入。两个测试都在finally关闭自身Vite与浏览器。

此增量仅两项测试配置与诊断/证据；82fc业务源完全不变。新SHA仍需要精确CI，原reviewer须核对源码一致性后给固定源结论。
