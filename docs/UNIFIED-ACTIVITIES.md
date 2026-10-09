# 统一活动与后台、收银、电视联动

## 交付基线

审查参考为 `codex/restore-truncated-files@c32e626`。实现位于隔离分支 `codex/unified-marketing`，基于远端 `master@fbc8983`，保留最新员工、收银、退款与财务修复，并吸收参考提交的兼容调整。原工作目录中其他 agent 的未提交文件未改动。

## 门店操作

- 后台「营销管理 → 促销 → 活动」创建活动，选择类型，填写规则、商品/规格、会员/渠道/支付条件、门店时区、起止日期、星期及每日时段。发布后无需手动刷新收银或电视。
- 商品特价、百分比折扣、第 N 杯优惠、买 N 送 M、满减、阶梯优惠、套餐、小料/加价购、升杯、满额赠礼、会员价、生日礼、首单礼、送券/领券、积分、集杯、抽奖、邀请、门店拼团共 19 类。每日特价、新品尝鲜、会员日及节日主题由时间、条件及主题字段组合表达。
- 价格方案按整单最低应付金额选择，会员价、套餐、券与积分抵扣不叠加，同价依优先级与活动 ID 稳定选择。储值余额沿用支付流程。饮品优惠不包含小料；小料活动另行计价。
- 收银自动试算，结账前再次校验；赠品选项未选完不能结账。拼团由收银逐一选择会员登记，成团后选取团单并加入足量商品，统一结账，无预付款。
- 权益在付款订单事务内登记，后台持久任务自动送券、积分、集点或开奖。收银活动面板可兑奖，并自动提示本机订单的开奖结果。库存不足的奖品停止发放，电视也停止宣传相关权益。
- 「设置 → 电视大屏」仅管理终端播放与授权。首次打开后台生成的播放链接后，电视浏览器记住门店与展示授权，地址自动移除令牌。可收藏固定播放页或设为主页；支持开机启动浏览器的设备可自动打开。授权有效期 30 天，到期在后台重新打开链接。清理浏览器数据会清除记忆。
- 退款按剩余商品数量与扣税后的实付金额重新判断，撤回未使用券、积分与集点。已领取实物或已使用优惠券产生 `manual_review` 人工处理记录，后台「权益与兑奖」可见。

## 营销管理操作链路

营销总览提供资源准备、配置发布、终端执行、权益兑现与效果复盘入口。促销、会员、积分、消息、运营五个模块复用系统导航、卡片、表格、按钮和弹窗样式；读取失败显示重试，不将失败误报为空数据。

活动类别用于运营归档，优惠形式用于选择计算规则。类别页面和创建表单引用同一门店类别 ID；类别页显示关联活动数量，支持查看和直接创建该类别活动。重命名保留 ID，使用中的类别不能删除；跨门店类别和赠品商品关联被拒绝。

创建活动可以选择常见模板。商品无需逐个输入名称，可搜索名称或编码、按商品分类筛选并批量选择，再限定规格；选择结果保存商品 ID。批量选择只覆盖当前商品，新增商品需另行加入。券模板可直接进入预填活动，赠品目录选择已有商品或小料。发布前确认规则、条件、时间及宣传预览。

运营效果读取成交报价快照、权益、完成订单和已批准退款。总览订单去重，单个活动相关成交可能与其他活动重合；显示的成交优惠为结账时优惠，实收包含税并扣除退款。这是相关成交统计，不能视作新增收益或 ROI。历史券、活动和邀请报表保留独立入口。

消息提供发送记录和状态筛选，不因创建活动自动发送顾客消息。自动运营页面区分支付后自动权益与既有运营任务。

## 数据及 API

统一规则、迁移来源、订单报价快照、权益任务、奖品池、拼团、终端与事件确认使用既有 `Config` 表的 `marketing.unified.*` 命名空间。无需增加数据库表或运行 schema push；通用配置接口禁止读取/修改内部记录。所有读写按登录用户门店隔离。规则编辑使用版本与比较更新；订单及活动 ID 唯一决定权益任务。

| 路径（`/api` 下） | 用途 |
|---|---|
| `marketing/activities` | 统一列表、创建、编辑、结束 |
| `marketing/activities/quote` | 权威整单报价、税费、命中优惠、待选赠品、预计权益 |
| `marketing/activities/display` | 当前宣传内容 |
| `marketing/activities/offline-snapshot` | 签名的离线价格与商品缓存 |
| `marketing/activities/resources` | 本门店商品规格、商品分类、活动类别、赠品及券模板 |
| `marketing/activities/performance` | 指定期间真实成交、退款、优惠及权益汇总 |
| `marketing/activities/entitlements/list` | 已登记权益与兑奖状态 |
| `marketing/activities/entitlements/:id/fulfil` | 幂等兑奖及库存扣减 |
| `marketing/activities/claim`, `referral` | 门店领券与绑定邀请人 |
| `marketing/activities/groups*` | 收银登记、参团与统一结账 |
| `marketing/activities/heartbeat`, `terminals/list` | 收银/电视在线状态及同步版本 |
| `marketing/activities/migration/preview`, `migration/apply` | 旧数据迁移演练/执行 |
| `marketing/tv-screen/config`, `events`, `heartbeat` | 展示授权、播放内容及每台电视独立事件确认 |

WebSocket 仅通知重新拉取：`marketing:activities:updated` 和 `tv:config:update`。启动、重连、恢复前台和 15 秒补偿轮询都重新读取；本地有效时间判断在无后台操作时也会停止到期宣传或价格。自动开奖由服务端完成，电视动画只消费结果，按事件 ID 去重，每台电视独立确认；展示接口不返回会员信息、奖品权重、库存或券模板 ID。

离线价格仅包含无需服务端额度、会员、券或积分确认的签名规则。缓存最多有效 7 天，仍按活动时间窗口判断。恢复连接后核验签名及原成交时刻，权益依服务端库存与共享限额处理。沿用原有收到款凭据、订单重放与断网保护流程。

## 迁移与部署顺序

1. 备份目标数据库，并用其备份副本先执行演练。CLI 默认只读，必须显式指定门店：

   ```sh
   cd server
   npm run activities:migrate -- --store STORE_ID
   # 检查输出中的 created / skipped / conflicts / activities 后执行：
   npm run activities:migrate -- --store STORE_ID --apply
   npm run activities:migrate -- --store STORE_ID --apply
   ```

   若只安装运行依赖，可先 `npm run build`，再运行 `node dist/scripts/activityMigration.js --store STORE_ID [--apply]`。

2. 核对原折扣、特价、TV 价格及奖品规则与演练结果。来源 ID 保持稳定；重复执行不新增也不覆盖已编辑记录。冲突、无效、未关联商品的 TV 宣传留在草稿待确认。原数据保留用于审计。旧活动 Campaign 标记 `migrated`，避免旧自动任务重复发券。首次访问新活动接口也会迁移尚未迁移的门店，因此生产部署前先完成演练。
3. 后台、服务端、POS/电视同时发布并重新构建；本次未提交生成的 `server/dist`，部署必须从源码构建，不能直接运行仓库中旧的 dist。旧促销/电视页面跳转到新入口；旧折扣、特价、Campaign CRUD 使用统一记录。旧 POS 若报价不符合统一规则会拒绝成交，需要刷新至新客户端。
4. 在测试门店发布短时特价，联网 POS 加商品后核对应付金额与 `quote`。开电视，观察终端在线与版本；停用、修改、到期后确认两端自动更新。完成抽奖订单，断开电视再重连，核对同一结果与权益不会重复生成。库存不足、部分退款及人工兑奖记录需由门店核对。
5. 服务端每 15 秒处理持久权益任务；观察 `activity_grant_pending` 与任务的 `failure/attempts/nextAttemptAt`。失去库存/券模板的任务标为 `unavailable`，不会反复发放。

回滚须同时回滚三端。已经产生统一活动订单或发放权益后，不应直接恢复旧活动任务或删除 `marketing.unified.*` 数据；先保存权益和财务记录并人工核对，避免旧规则重复执行。

## 验证证据

- `marketing-operations-page-check.cjs`：23 个营销页面的生产包、类别创建及重命名、类别进入创建表单、模板与商品搜索、发布预览确认、券模板预填、读取失败重试、移动端总览。使用隔离合成 API，不操作生产订单。
- `activity-performance.test.cjs`：相关订单去重、退款后实收、原始优惠、无成交数据和退款上限。


- `unified-activity.test.cjs`：时间边界、跨午夜/星期、规格/会员/渠道条件、低价杯配对、套餐不重复使用商品、小料、积分/券互斥及稳定择优。
- `unified-activity-integration.cjs`：真实 Prisma 隔离 SQLite，19 类规则、迁移重复执行、订单重放、自动任务/唯一开奖、库存、领券重试、邀请、部分及全退款、积分/集点撤回、成团条件、签名离线成交及同步、门店隔离、展示权限、多电视确认、测试开奖无权益，真实认证 WebSocket 同时通知 POS 与 TV。
- `unified-activity-page-check.cjs`：生产 React 包配合合成 API，在 Chromium 验证活动创建、旧 TV 入口跳转、无价格规则的 TV 设置、POS 自动报价、电视队列确认、自动到期与记住展示授权。该浏览器测试不访问生产接口，真实服务端契约由上面的数据库/HTTP/Socket 测试覆盖。
- 报价验证前重复点击、变价拦截以及原收款/订单重放/配置保护等共 49 个相关单元回归通过。
- 服务端、后台及 POS TypeScript 检查与三端生产构建通过；截图保存在 `/tmp/unified-marketing-page-evidence`。

运行：

```sh
npm run typecheck:server && npm run typecheck:admin && npm run typecheck:pos
node --test tests/stoploss/unified-activity.test.cjs tests/stoploss/offline-checkout.test.cjs tests/stoploss/order-receipt.test.cjs tests/stoploss/config-policy.test.cjs tests/stoploss/activity-pricing.test.cjs
node tests/stoploss/unified-activity-integration.cjs
# 可覆盖默认 /tmp 路径，指向刚构建的包：
ACTIVITY_ADMIN_BUILD=/path/to/admin/dist ACTIVITY_POS_BUILD=/path/to/pos/dist node tests/stoploss/unified-activity-page-check.cjs
```

2026-10-09 已部署生产 API、后台与网页收银/电视。API 源码为 `9b5ebc9576cd3c390a37037a3b4e12e3e77d7b4e`，后台与 POS 网页源码为 `de5c134187ea03c32229751d6a0e10881ef05b00`；后续修改仅涉及 API 授权和测试。生产两个门店共迁移 4 条活动，无冲突；迁移演练比较 107 张表，105 张历史业务表完全不变，另外仅改活动配置和旧 Campaign 的迁移状态。数据库与上传媒体已备份并校验，恢复库及临时凭证已清理。公网三站 200、API/数据库/Redis 健康，活动报价、电视专用授权、门店隔离与真实浏览器记住授权验证通过，未创建生产测试交易。备份与回滚 Compose、镜像来源及验收证据存放在主机的 `deployment-unified-backups` 私有目录。

此次交付为网页版本；Windows POS 安装包和真实电视设备的开机自动进入设置尚未发布/执行，不应将网页部署视为安装版升级完成。
