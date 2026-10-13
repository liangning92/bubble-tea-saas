# 整月预计工资与人工更正

## 问题与行为

考勤尚未正式启用。旧计算默认使用打卡天数，入职后没有打卡会算出 0；页面加载还会调用 prepare-month 创建待发工资并计入财务。

现在默认按整月在职日期预计，按试用期/正式期月薪分段折算，不把没有打卡作为缺勤。预计阶段不额外增加带薪休息、不创建 Salary，不计入费用或应付款。月底沿用更正入口填写实际工作天数、有效迟到分钟数、其他考勤扣款及原因；计薪天数支持半天，沿用足月固定带薪休息，避免缺勤重复扣薪。

迟到使用该月已配置的间隔/阶梯规则；未配置规则且输入非零分钟时必须配置规则或选择人工迟到金额。人工更正优先于自动月度迟到奖惩项目，保持押金、其他奖惩独立，重复保存不重复扣款。考勤数据必须先预览再导入，工资记录必须保存才改变。

## 接口与存储

- staff-salary/calculate 保留工作天数参数，新增 daysSource、lateMinutes、lateMode、manualLateDeduction、otherAttendanceDeduction 预览参数。
- 工资创建/更新增加 correction（含 reason）、includedAttendanceDeduction、daysSource。服务端重新计算迟到扣款并替换预览中已包含的考勤扣款，不信任客户端迟到金额。
- 原 prepare-month 保留兼容响应，返回 estimateOnly，不再生成或改写待发工资。列表 includeUnrecorded 提供预计金额。
- 工资依据版本 2 保存实际天数、来源、确认状态、规则快照和更正记录。Config 中保存更正和不可覆盖的审计条目，包含修改前后金额与计算依据；无需数据库结构迁移。
- 员工工资接口在没有已保存工资时返回本人整月预计；有记录时显示保存的依据。月结发放需要月底结束及人工确认，已发放保持锁定。
- 未发放自动旧记录展示重算差额，不自动改写。已有人工更正保留；已发放保留历史快照。未确认的自动旧草稿不计入财务计提，旧人工确认记录仍保留费用。

## 页面与验证

管理端和员工端按月份/状态、金额、工资组成、计薪依据排列，计算明细折叠展示。中文、印尼语、英语及工资条共用文案和规则说明。

相关检查（无需正式构建）：

```sh
npm run typecheck:server
npm run typecheck:admin
npm run typecheck:staff
npm run i18n:check:admin
npm run i18n:check:staff
cd server
./node_modules/.bin/jest --config jest.audit.config.cjs --runInBand audit-tests/probation-payroll.test.ts audit-tests/payroll-manual-attendance.test.ts audit-tests/payroll-roster.test.ts audit-tests/payroll-correction.test.ts audit-tests/payroll-finance-accrual.test.ts audit-tests/payroll-weekend-leave.test.ts audit-tests/payroll-estimate.test.ts audit-tests/payroll-employee-estimate.test.ts audit-tests/staff-app-flow.test.ts audit-tests/staff-offboarding.test.ts audit-tests/resource-middleware.test.ts audit-tests/resource-boundaries.test.ts
cd ..
node tests/stoploss/payroll-estimate-page-check.cjs
```

浏览器检查启动仅本机开发服务器，使用合成 API 数据；覆盖预计不生成应付款、半天更正、分钟扣款、无规则阻止保存、导入预览、重复保存、旧人工金额保留、当月禁止发放、双端手机布局和真实 HTML 工资条下载。默认截图目录 /tmp/payroll-estimate-evidence，支持 PAYROLL_EVIDENCE_DIR 指定输出。

受影响组件：API、管理端、员工端。此次不构建、不发布；待集中构建确认后上线。

本地验证：12 组相关回归共 90 项通过；检查范围选择器 10 项通过；API、管理端、员工端类型检查和双端翻译检查通过；双端浏览器流程与工资条下载通过。远端正式 CI、构建与部署留待集中确认。
