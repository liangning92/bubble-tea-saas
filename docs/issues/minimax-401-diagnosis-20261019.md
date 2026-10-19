# MiniMax 401 只读诊断

2026-10-19（Asia/Jakarta）。本轮未再调用供应商，累计仍只有前一轮 1 次合成请求；未读取或输出完整密钥，未改正式配置、端点或权限。外部 pending approval :2 归属未知，不作为批准。

## 已核实请求

| 项目 | 实际值或结构 |
|---|---|
| 主机和路径 | HTTPS POST https://api.minimax.io/v1/chat/completions，代码固定，非 AI 设置中的可编辑字段 |
| 协议 | OpenAI Chat Completions 兼容，JSON，非流式 |
| 鉴权头结构 | Authorization: Bearer <服务端解密后的已保存密钥>；代码自行加 Bearer 和一个空格。此处只核对源码结构，没有解密、读取或输出密钥 |
| 其他请求头 | Content-Type: application/json |
| 模型 | MiniMax-M3；该次私有请求记录也保存这一模型名 |
| 参数 | messages 的 system/user；stream=false、reasoning_split=true、max_completion_tokens=4096、temperature=0.3、service_tier=standard、M3 thinking.type=disabled；无 tools 或附件 |
| 网络边界 | redirect=error，25 秒超时；不自动跟随重定向或重试 |
| 正式设置已知元数据 | 启用、已配置密钥、月预算留空。设置不回显密钥，也没有配置地区、计费类型或自定义 Base URL |

官方 [Chat Completion 文档](https://platform.minimax.io/docs/api-reference/text-chat-openai) 支持以上主机/路径、Bearer 头、JSON 以及 MiniMax-M3；M3 可关闭 thinking。因此目前没有证据支持“模型名拼错”或“把 Anthropic 请求发给 OpenAI 路径”。这仅核实静态兼容性，不证明当前账号有该模型资源。

## 401 来源证据与剩余不确定性

1. 既有唯一合成请求 523e32b7-5825-4215-9800-cd09dd2add3c，创建于 2026-10-19T15:30:16.352Z；sourceSeq=[]、status=uncertain、error=TEAM_AI_CREDENTIAL_REJECTED、text 为空、usage 未取得；频道消息数仍为 3。前轮脱敏证据保存在工作区 output/team-operations/live-minimax-diagnostic.json。
2. 正式源码 0b46484f 的 TeamAiService.ts 只有在 fetch 返回 HTTP401 时才抛 TEAM_AI_CREDENTIAL_REJECTED，内部 TeamError 状态是 502。路由捕获后向本系统前端返回 HTTP502 和该码。应用登录鉴权在路由之前运行；本次已经通过并创建私有请求及预算预留，故这里不是本系统入口 JWT 的401。
3. 服务端解密失败会给 TEAM_AI_SECRET_UNAVAILABLE；网络/超时异常映射为 TEAM_AI_PROVIDER_UNAVAILABLE；额度限流映射其他代码。本次记录均不是这些代码。
4. 结论：向固定 MiniMax URL 发出的请求收到 HTTP401。程序没有保留此响应的供应商错误正文和响应头，不能进一步确认失效、撤销、抄录问题、地区不匹配或账户产品/授权不匹配。没有通过追加请求补取错误正文，避免重复计费。
5. UI 目前把此类错误概括为“AI 不可用”，查询后仅提示“结果待核对”；需要脱敏诊断才能分辨原因。改进为明确的凭据排查提示可另做小修，本轮不扩大功能。

估算预留 $0.005610 不是实际供应商扣款。失败后保留预留是原有保守策略；本轮不释放预留或改预算，不把未知费用记为零。

## 官方服务地区及套餐对应

| 情况 | 官方文档核实 | 对当前系统的含义 |
|---|---|---|
| 国际平台 | [前置准备](https://platform.minimax.io/docs/guides/quickstart-preparation) 使用 api.minimax.io/v1 或 api.minimax.io/anthropic；按量密钥来自 API Keys，订阅 Key 来自 Billing→M Plan | 当前实现使用国际 OpenAI 路径，需与该服务匹配的凭据 |
| 国内平台 | [国内前置准备](https://platform.minimax.cn/docs/guides/quickstart-preparation) 当前使用 api.minimax.cn/v1 或 api.minimax.cn/anthropic；旧 platform.minimaxi.com 文档已重定向到 platform.minimax.cn | 国内凭据与当前国际主机是否匹配必须先核对，不能靠修改模型名解决；本轮未切换端点 |
| Coding/Token/M Plan | [M Plan FAQ](https://platform.minimax.io/docs/m-plan/faq) 区分订阅 Key 与按量 API Key，二者使用不同资源/账务；官方明确支持 OpenAI 或 Anthropic 兼容工具，并提醒401时核对 key 来源地区 | 不能笼统声称订阅 Key 一定不兼容当前协议；也不能假定用户现有订阅包含 M3 或生产使用资源 |
| OpenAI 与 Anthropic | [M Plan 工具配置](https://platform.minimax.io/docs/m-plan/other-tools) 提供 api.minimax.io/v1 的 OpenAI Bearer 接入；[订阅快速开始](https://platform.minimax.io/docs/m-plan/quickstart) 提供 /anthropic 示例 | 换协议不是当前已证实的修复；当前代码不使用 Anthropic 的 x-api-key/messages 请求 |

这些是官方当前指导，不是对本次私有密钥来源的识别。没有访问用户供应商控制台、订阅/余额或密钥值。国内旧 api.minimaxi.com 地址是否仍受支持未验证，也未以用户密钥试探。

## 最小需要用户操作

1. 只告知非秘密元数据：创建该密钥的平台域名（国际 minimax.io 或国内 minimax.cn/旧 minimaxi.com），以及密钥是“接口密钥/按量 API Key”还是“Coding/Token/M Plan 订阅 Key”。不要发送值、截图或密钥片段。
2. 若确认为适用于国际 API 的凭据，账号持有人在供应商控制台核对其未撤销及资源/模型权限，再本人在本系统“设置→AI设置→API密钥”填入原始密钥并保存。不要附加 Bearer；代码会添加。供应商继续 MiniMax、模型继续 MiniMax-M3、月预算继续空。此处是操作建议，本任务没有执行凭据更新。
3. 若只有国内平台凭据，先确认要使用哪个服务地区。当前 UI 没有“地区/接口主机”字段，不能在现有页面配置国内端点；后续需另行明确范围，增加受限地区选项及独立密钥配置/迁移策略，再检查安全边界。不能默默替换硬编码主机，也不要求用户为诊断购买新套餐。
4. 若是订阅 Key，用户核对订阅席位/积分及 MiniMax-M3 的可用性。若资源与模型不符，再由用户决定账户或模型方案；本轮不自动改模型、价格、订阅或收费方式。
5. 修复后先查询既有私有请求；需要新的合成生成时再按已明确的调用上限执行。本轮指示为不重复实际调用，因此没有进行复测或生成新请求。
