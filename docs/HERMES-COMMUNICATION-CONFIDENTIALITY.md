# 员工沟通保密边界（隔离开发）

## 审计结论

78bb 的门店/员工/任务 allowlist、当前频道和历史范围授权不足以阻止跨上下文携带：send.text 和 create.title 可自由写入，拥有管理信息的同一进程可能把它带入员工会话；sponsor 的管理权限不是员工的数据读取授权。没有财务工具只代表当前工具覆盖有限，不是长期保密机制。

普通员工沟通继续保留自然语言正文和标题；没有改成固定 code/language 话术，没有逐条老板审稿。保护以输入数据和执行上下文隔离为主，出站检查作为另一道边界。模板只能作为保密拒答的可选兜底。

## 威胁模型与信任边界

| 风险 | 必须由后端强制的边界 |
|---|---|
| 员工在正文自称老板、让agent复用sponsor权限 | 请求人从真实来源消息作者和当前active Staff/User解析；正文角色/能力字段不被信任；逐个当前受众核对数据能力 |
| 管理任务、其他会话、旧记忆进入员工回复 | 可信runtime必须证明employee_work执行身份、独立profile/任务/记忆；隔间键绑定门店/agent/任务版本/频道/完整成员fromSeq/真实角色/权限配置/grant与client版本 |
| 旧模型输出换正文、换任务或换接收人 | 出站准入绑定executionId、compartmentKey、requestId、textHash和当前audienceHash；证明不从工具body取 |
| 引用、摘要、翻译或编码带出原文 | 准入必须使用完整可信输入/派生来源清单，不只检查最终文字；同频道source必须所有当前成员均可见；其他任务/会话/共享记忆拒绝 |
| 汇总或组合推导敏感指标 | 来源解析端返回dataClasses，派生输出保留来源权限的并集/最高限制；不能把汇总、比例、编码当降密。unknown需要复核，本轮protected classes全禁发 |
| 群成员/权限变化或旧回执重放 | 当前原生频道检查、原生全受众最大fromSeq、执行隔间变化及事务内出站复查；cached message本身也复查，不只查新输入 |
| 附件绕过文字检查 | 原生文件grant和全受众历史范围、私有内容hash、可信来源分类、逐人数据能力；缺分类/unknown/protected拒绝（unknown返回需复核） |

可信计算基包括后端授权、实际数据源ACL、runtime执行轨迹和完整来源记录。模型自报“安全”、自报scope/角色/source、仅一个相同的隔间字符串，都不构成真实隔离证明。恶意或错误的后端实现能够破坏这些前提；本包没有提供一个默认allow生产实现。

## 固定数据投影与能力矩阵

真实业务读取应先按“请求人权限 ∩ 全部接收人权限 ∩ 当前agent任务授权”投影，再进入模型。金额/成本/利润/工资等字段不能先放进模型再要求它忘记。未来新敏感工具必须是明确字段DTO，禁止通用SQL、全量财务对象、任意表达式和可绕过的原始导出。

本轮后端已区分 operational、revenue、profit、cost、salary、private_staff、unknown。能力检查分别使用真实每个人的 personal.messages、finance.read、finance.read+profit.read、cost.read、salary.read、staff.private.read，不沿用sponsor。V2未明确允许不当作许可。

本轮没有开放任何protected数据发布，即使全体受众都有财务权限也不因此自动开启；需要后续独立工具/固定投影/范围授权。普通employee_work事实仍由各原生业务ACL与任务端口校验。未知/派生敏感分类进入NEEDS_REVIEW，不自动联系员工或老板。

## 已实现的代码边界

- communication.assertContext 是必需的可信runtime接缝；缺失/manager/shared memory/错误执行身份拒绝所有task-bound桥访问。
- communication.admitOutput 必须来自实际execution的完整输入和输出轨迹；文本/标题可自然表达，但必须匹配正文哈希、请求、隔间、执行实例和当前完整受众；deny不发送，unknown返回TEAM_AGENT_OUTPUT_NEEDS_REVIEW。
- typed sources仅允许当前conversation、同employee_task、已发布public_sop、同隔间memory；每个来源另经authorizeSource的真实ACL与dataClasses检查。未知kind/多余秘密字段无效。
- 原生TeamCommunicationService对可信agent强制全成员最大fromSeq，withActor和直接原生消息/附件路径也受约束；公开messages/changelog不加载给新成员不可见的历史。
- 原生发送事务在旧request回执之前执行出站检查，重放cached message再次检查；create标题在创建事务/回放当前频道时检查。普通人类消息路径未改为agent策略。
- 附件按私有文件grant加载，核完整受众历史、内容hash、分类及当前权限，缺少可信分类端口拒绝。

## 尚未真实实现/验证的接线

本包没有实现Hermes的独立profile/模型session/记忆存储隔离，也没有实现实际runtime输出轨迹仓库、source分类器或各业务source ACL适配器。communication端口是强制且默认关闭的接缝；合成端口只能验证后端消费证明的规则，不能证明实际Hermes进程已经满足前提。真实接入前必须由主线在有限grant下整合并独立验收；不得把这里的fixture allow用于生产。

发送与标题schema仍为原先自由text/title，新增proof不由客户端传入。真实host按当前token/run/任务记录构造端口。实际runtime若不能证明干净上下文或完整来源，拒绝发送并升级澄清，不能降级成共享manager会话。

自由文本可能隐喻、改写、推理、幻觉或包含未标注的人类内容；通用语义判断不能给出绝对零泄露保证。本轮没有用关键词或模型提示词宣称100%识别。输入隔离减少接触秘密的机会；固定敏感数据投影、来源ACL、全受众复核与保守未知处理提供可测试约束。对既有人类主动贴入群中的敏感信息，不声称能够追溯撤回已发生的披露。

## 验收范围

合成案例覆盖：自然多语言追问与标题原文保留；缺失/管理/共享记忆上下文拒绝；错误execution/hash/请求/受众证明拒绝；真实员工自称老板无提权；其他任务/会话/记忆、protected或unknown派生标签拒绝；群成员加入后公开及withActor原生历史/附件均不可读；角色变化使旧namespace失效；当前policy撤回与旧敏感cached message不能重放；原有幂等/原子pending/重连/已读边界保留。

只运行临时PostgreSQL、官方MCP客户端、合成身份/数据/可信端口；没有读取真实财务/工资、联系员工、调用模型、改生产grant或部署。

最终本轮验证：server tsc通过；24组官方MCP/真实临时PostgreSQL合成检查通过并清理；独立只读复审发现的withActor历史边界已修复、复核无剩余P1/P2。日志 output/team-agent-bridge/confidentiality-final.log，结果 confidentiality-result.json。上轮67原生回归及CI范围结果未冒称本轮重跑。
