# 团队沟通行动项闭环与 MiniMax 接入

2026-10-19 用户要求继续计划、优化、验证与部署，并指定 MiniMax，暂不设置费用上限，保留上限配置入口。

现状：8d500e6e 已有聊天、私有附件及人工纪要；行动项没有接收/提交/验收状态，图片只能下载，AI执行明确禁用。既有业务AI执行器继续禁用，沟通AI独立控制。没有真实API密钥时不得声称真实模型调用验收完成。

学习依据：
- MiniMax 官方 Chat Completions：https://platform.minimax.io/docs/api-reference/text-chat-openai 。固定官方HTTPS入口，Bearer鉴权，分离思考内容，读取usage，不提供模型工具。
- MiniMax 模型与价格：https://platform.minimax.io/docs/guides/models-intro 、https://platform.minimax.io/docs/pricing/overview 。模型可配置，价格采用管理员可维护快照，费用上限默认空。
- Prisma事务原则：https://www.prisma.io/docs/orm/fundamentals/transactions 。本仓库仍为Prisma5，继续使用现有$transaction及频道行锁，不升级ORM。
- MDN Blob URL：https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static 、https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static 。授权下载Blob后预览，切换或关闭时释放，不发布附件URL。

实施：从确认纪要创建任务快照，按成员历史范围隔离；幂等+版本防冲突，员工接收/提交本人消息证据、主持人验收/退回/取消。MiniMax配置仅后台管理员可写，密钥加密且不回显，主密钥在私有持久目录独立保管。文字AI由管理员手选范围触发，只生成私有草稿，人工确认后通过原聊天发送；无私人附件外发、自动员工联系或业务执行。凭据未配置时保持不可调用，费用上限留空代表用户选择的不设上限。

验证：合成账号、隔离PG与可控模型传输；覆盖越权、历史范围、幂等、并发、模型失败和额度控制；构建API/Admin/Staff，真实界面验证与生产只读复核。真实手机图像和供应商真实调用单独记录，不用模拟测试冒充。

本地已验：API/Admin/Staff 构建及三语检查通过；96项范围单元、28套213项权限审计通过；沟通HTTP28组、员工V2/工作台SQLite与PostgreSQL回归完成；既有员工29路由375/768/1440页面回归完成。新任务流程使用独立合成账号在真实Chrome完成接收、本人证据提交、主管验收和员工刷新；后台390/768、员工390/768无横向溢出，私有PNG授权预览/放大可用。曾发现轮询下相同React key导致AI面板累积，改为独立key后持续轮询保持单实例。临时数据与预览已清理。上述为隔离环境；上线真实只读复核、真实手机照片及MiniMax真实密钥调用分别记录，不混称通过。

PostgreSQL 16.15（独立Docker镜像、临时网络/卷）同一28组沟通回归全部通过；本批测试资源标签bt-test-e6c1c1f49b25已由包装器清理。完整类型检查API/Admin/Staff通过。
