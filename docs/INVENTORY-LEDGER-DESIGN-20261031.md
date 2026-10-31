# 库存流水页面设计调整

页面围绕门店管理者的查询任务组织：选择原料、时间和流水类型，核对数量与明细，必要时进入原有登记、更正或导出操作。

## 参考依据

- Shopify index table：搜索、筛选、排序和分页共用稳定状态；保持结果与查询一致。https://shopify.dev/docs/apps/build/app-home/migrate-from-polaris-react/index-table
- Carbon data table：以表格为主要工作区，把查询和表级操作集中组织。https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines
- Carbon disclosures：次要信息通过明确触发展开，必要的查询控件保持可见。https://www.carbondesignsystem.com/building-blocks/core/patterns/disclosures
- Atlassian spacing：使用有限的间距尺度与一致的组件尺寸区分层级。https://atlassian.design/foundations/spacing

## 本页实施

保留既有一级、二级导航及所有业务指标。页面采用标题与动作、紧凑统计、流水工作区三个层次。流水类型使用页签；原料搜索、分类、日期捷径集中在表格上方，查询范围与清除入口靠近筛选。桌面输入控件统一40px，手机44px。

成本更正金额持续可见，解释文字按需展开。多原料实际出库汇总默认是一行入口，展开后以名称/数量列表呈现；单原料直接展示数量。不对不同单位直接加总，不删除汇总信息。

明细默认每页50行，可选25/50/100行；看板、原料汇总和导出仍按全部匹配结果计算。筛选改变后重置页码，手工更正、照片、单据引用、采购登记、报损、刷新和导出入口保留。加载或首次请求失败时，统计显示不可用占位，避免将未完成查询表示为零。

## 验证

针对性浏览器检查包含18种合成原料的默认收展布局、控件对齐、图标不遮字，以及125条记录跨页统计、筛选后页码重置、无效年份经日历恢复，以及窄屏表格的横向键盘滚动。验证1365/768/390三种视口；真实页面的前后截图和发布验收记录存于本地任务output中，不上传正式业务数据。
