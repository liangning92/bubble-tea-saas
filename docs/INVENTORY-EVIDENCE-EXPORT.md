# 只读库存证据导出

入口：后台库存总览 `/inventory` 的“库存核查证据”卡。选择开始、结束营业日期，下载 JSON。日期在后端按该门店时区解析，最多31个营业日。

API：`GET /api/inventory/evidence-export?storeId=...&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`。必须登录，并仅支持当前登录门店。管理员可用；受委派岗位须同时具有 V2 `inventory.read`、`data.export`、`orders.read`、`products.read` 权限。员工端会话不可用。未取得成本权限的委派岗位不会得到平均成本、入库成本或原始备注；员工/供应商仅提供业务关联ID，不提供联系方式。

证据包提供当前账面库存、全原因入/出库流水（包括销售估算及反向流水）、所选区间盘点、订单行主键、订单消耗快照、现行BOM及加工配方。原始输入数量和包装换算能从流水保存内容核实时才标为 conversionVerified；不会套用现行包装设置补造历史输入。

每类最多20,000行，嵌套订单行/盘点行/配方行先在同一 RepeatableRead 事务内计数后读取。超过限制明确返回413，要求缩小区间；不会静默截断成看似完整证据。导出追加审计，先保存成功下载审计再放行文件；审计故障不放行。库存、订单、配方、盘点数据均不写入。

`contentHash` 为 `JSON.stringify(data)` 的 UTF-8 SHA-256；exportId 是 `inventory-evidence-v1:` 加内容哈希。同一数据快照重复下载内容ID稳定；generatedAt/requestedBy不计入内容哈希。每个原始记录引用另含对应导出记录的checksum。下载端验证完整内容哈希后才保存。此哈希用于完整性核对，不是法律电子签名，也不能证明原始业务已独立核验。

本版明确缺口：没有历史期初期末实盘快照、完整历史配方版本和逐订单行配方分摊；不导出现行包装配置或批次有效期；原始外部凭证/附件未独立核验。库存行的 shelfLife 是现行物料设置，不能替代批次到期日。外部账单、现场数量、凭证附件均不会因下载成功而自动转为“已核实”。证据状态保持 incomplete、businessVerified=false，缺失项在 missing 中逐项列明。

不包含异步大文件导出、临时下载链接或撤回已下载文件。这些属于后续版本，不将文档中更大的需求范围伪装为本次已完成能力。

回归：`node --test tests/stoploss/inventory-evidence-export.test.cjs`；该文件由现有 ci-scope 的 inventory 领域规则纳入精确SHA检查。真实网页下载、线上版本与业务数据核对需由独立验收记录补充，单元测试不代替现场业务验收。
