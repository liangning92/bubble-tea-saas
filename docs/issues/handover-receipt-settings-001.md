# 交接班小票内容可配置

需求：后台选择交接班小票显示/隐藏的内容，收银机自动拉取，交班打印和历史补打使用当前设置。
根因：旧 summaryItems 同时用于交班页面和部分打印项目；身份、时间、差额及签字固定打印，补打保存的是旧项目开关。
学习：Square 官方将后台小票设置与设备打印配置集中管理：https://api.squareup.com/help/ca/en/article/5424-customize-digital-receipts-and-invoices 、https://api.squareup.com/help/gb/en/article/8245-set-up-printer-profiles 。本项目已有按门店配置 API、10 秒自动拉取及离线配置快照，复用既有链路。
方案：shiftSettings.receiptItems 独立控制打印项目；未配置时沿用旧 summaryItems。所有打印入口自动拉取当前配置并覆盖历史显示开关；数据及财务计算不变。标题和待核对说明保留，避免把未核实数据打印为已核实数据。不改数据库，不构建或发布。

验证：Admin/POS/Electron 无产物类型检查通过；三语言翻译检查通过（原有硬编码警告仍存在）。新增 3 项测试覆盖 21 个字段的独立显示/隐藏、旧配置兼容、当前设置覆盖历史快照、纸宽及核对提示；既有小票渲染 9 项测试通过。实际后台页面与现金管理页面浏览器回归通过：自动保存、重载保留、无需刷新 POS 即可按最新配置补打。配置服务和打印设备为合成边界，未连接真实打印机。工作在独立分支 codex/handover-receipt-settings-20261013，未混入 source 的其他未完成修改。
