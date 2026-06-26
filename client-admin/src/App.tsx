import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/auth'
import { MainLayout } from './layouts/MainLayout'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { DashboardPage } from './pages/DashboardPage'
import { ProductsIndexPage } from './pages/products/ProductsIndexPage'
import { ProductListPage } from './pages/products/ProductListPage'
import { ProductCostPage } from './pages/products/ProductCostPage'
import { ProductFormPage } from './pages/products/ProductFormPage'
import { OrderListPage } from './pages/orders/OrderListPage'
import { OrderDetailPage } from './pages/orders/OrderDetailPage'
import { RefundRequestListPage } from './pages/orders/RefundRequestListPage'
import { InventoryIndexPage } from './pages/inventory/InventoryIndexPage'
import { InventoryPage } from './pages/inventory/InventoryPage'
import { StockLogPage } from './pages/inventory/StockLogPage'
import { StockAlertsPage } from './pages/inventory/StockAlertsPage'
import { StockAlertConfigPage } from './pages/inventory/StockAlertConfigPage'
import { InventoryCountPage } from './pages/inventory/InventoryCountPage'
import { StaffIndexPage } from './pages/staff/StaffIndexPage'
import { StaffListPage } from './pages/staff/StaffListPage'
import { StaffFormPage } from './pages/staff/StaffFormPage'
import { StaffDetailPage } from './pages/staff/StaffDetailPage'
import { LeaveListPage } from './pages/staff/LeaveListPage'
import { LeaveTypeConfigPage } from './pages/staff/LeaveTypeConfigPage'
import { LeaveKanbanPage } from './pages/staff/LeaveKanbanPage'
import { ScheduleCalendarPage } from './pages/staff/ScheduleCalendarPage'
import { TrainingListPage } from './pages/staff/TrainingListPage'
import { StaffPointsPage } from './pages/staff/StaffPointsPage'
import { DepositRulesPage } from './pages/staff/DepositRulesPage'
import { StaffDepositListPage } from './pages/staff/StaffDepositListPage'
import { AttendanceRulesPage } from './pages/staff/AttendanceRulesPage'
import { ShiftConfigPage } from './pages/staff/ShiftConfigPage'
import { ReimbursementListPage } from './pages/staff/ReimbursementListPage'
import { ReimbursementTypeConfigPage } from './pages/staff/ReimbursementTypeConfigPage'
import { SalaryListPage } from './pages/staff/SalaryListPage'
import { ShiftSwapListPage } from './pages/staff/ShiftSwapListPage'
import { AttendanceCorrectionListPage } from './pages/staff/AttendanceCorrectionListPage'
import { OvertimeRequestListPage } from './pages/staff/OvertimeRequestListPage'
import { AttendanceIndexPage } from './pages/staff/AttendanceIndexPage'
import { AttendanceDashboardPage } from './pages/staff/AttendanceDashboardPage'
import { SalaryIndexPage } from './pages/staff/SalaryIndexPage'
import { PointsIndexPage as StaffPointsIndexPage } from './pages/staff/PointsIndexPage'
import { PointsRuleConfigPage as StaffPointsRuleConfigPage } from './pages/staff/PointsRuleConfigPage'
import { RewardsPage } from './pages/staff/RewardsPage'
import { SupplierListPage } from './pages/purchases/SupplierListPage'
import { MemberListPage } from './pages/members/MemberListPage'
import { MemberDetailPage } from './pages/members/MemberDetailPage'
import { SettingsPage } from './pages/SettingsPage'
import { KDSPage } from './pages/kds/KDSPage'
import { KDSConfigPage } from './pages/kds/KDSConfigPage'
import { DeliveryHubPage } from './pages/delivery/DeliveryHubPage'
import { HygieneIndexPage } from './pages/hygiene/HygieneIndexPage'
import { HygieneTemplateListPage } from './pages/hygiene/HygieneTemplateListPage'
import { HygieneTemplateFormPage } from './pages/hygiene/HygieneTemplateFormPage'
import { HygieneCalendarPage } from './pages/hygiene/HygieneCalendarPage'
import { HygieneTodayTasksPage } from './pages/hygiene/HygieneTodayTasksPage'
import { HygieneStatsPage } from './pages/hygiene/HygieneStatsPage'
import { HygieneAreasPage } from './pages/hygiene/HygieneAreasPage'
import { HygieneConfigPage } from './pages/hygiene/HygieneConfigPage'
import { BomAnalysisPage } from './pages/bom/BomAnalysisPage'
import { RecipeEditPage } from './pages/bom/RecipeEditPage'
import { ProcessingListPage } from './pages/material/ProcessingListPage'
import { ProcessingFormPage } from './pages/material/ProcessingFormPage'
import { RestockSuggestionPage } from './pages/material/RestockSuggestionPage'
import { MarketingIndexPage } from './pages/marketing/MarketingIndexPage'
import { PromotionsIndexPage } from './pages/marketing/PromotionsIndexPage'
import { MembersIndexPage } from './pages/marketing/MembersIndexPage'
import { PointsIndexPage } from './pages/marketing/PointsIndexPage'
import { MessagesIndexPage } from './pages/marketing/MessagesIndexPage'
import { OperationsIndexPage } from './pages/marketing/OperationsIndexPage'
import { CampaignListPage } from './pages/marketing/CampaignListPage'
import { CampaignDetailPage } from './pages/marketing/CampaignDetailPage'
import { CampaignStatsPage } from './pages/marketing/CampaignStatsPage'
import { CampaignEditPage } from './pages/marketing/CampaignEditPage'
import { CouponListPage } from './pages/marketing/CouponListPage'
import { CouponDetailPage } from './pages/marketing/CouponDetailPage'
import { CouponEditPage } from './pages/marketing/CouponEditPage'
import { ReferralListPage } from './pages/marketing/ReferralListPage'
import { ReferralDetailPage } from './pages/marketing/ReferralDetailPage'
import { TierBenefitsPage } from './pages/marketing/TierBenefitsPage'
import { PointsExpiryConfigPage } from './pages/marketing/PointsExpiryConfigPage'
import { MarketingAnalyticsPage } from './pages/marketing/MarketingAnalyticsPage'
import { CampaignCategoryListPage } from './pages/marketing/CampaignCategoryListPage'
import { MarketingChannelsPage } from './pages/marketing/MarketingChannelsPage'
import { NotificationHistoryPage } from './pages/marketing/NotificationHistoryPage'
import { AutomationPage } from './pages/marketing/AutomationPage'
import { MessageSettingsPage } from './pages/marketing/MessageSettingsPage'
import { PointsRuleConfigPage } from './pages/marketing/PointsRuleConfigPage'
import { RewardCatalogPage } from './pages/marketing/RewardCatalogPage'
import { MemberBalancePage } from './pages/marketing/MemberBalancePage'
import { DiscountRulePage } from './pages/marketing/DiscountRulePage'
import { TimedSpecialPage } from './pages/marketing/TimedSpecialPage'
import { StackingRulePage } from './pages/marketing/StackingRulePage'
import { AutomationRulePage } from './pages/marketing/AutomationRulePage'
import { AutomationLogPage } from './pages/marketing/AutomationLogPage'
import { MessageStatsPage } from './pages/marketing/MessageStatsPage'
import { CouponReportPage } from './pages/marketing/CouponReportPage'
import { CampaignReportPage } from './pages/marketing/CampaignReportPage'
import { ReferralFunnelPage } from './pages/marketing/ReferralFunnelPage'
import { ProductAnalysisPage } from './pages/product-analysis/ProductAnalysisPage'
import { AddonListPage } from './pages/addons/AddonListPage'
import { CategoryListPage } from './pages/categories/CategoryListPage'
import { QueueManagePage } from './pages/queue/QueueManagePage'
import { QueueDisplayPage } from './pages/queue/QueueDisplayPage'
import { RevenuePage } from './pages/finance/RevenuePage'
import { FinanceReportsPage } from './pages/finance/FinanceReportsPage'
import { FinanceIndexPage } from './pages/finance/FinanceIndexPage'
import { FixedAssetsPage } from './pages/finance/FixedAssetsPage'
import { TaxReportsPage } from './pages/finance/TaxReportsPage'
import { ExpenseListPage } from './pages/expense/ExpenseListPage'
import { ChannelIndexPage } from './pages/channels/ChannelIndexPage'
import { ChannelListPage } from './pages/channels/ChannelListPage'
import { ChannelReportsPage } from './pages/channels/ChannelReportsPage'
import { ChannelCommissionPage } from './pages/channels/ChannelCommissionPage'
import { ChannelProductPricingPage } from './pages/channels/ChannelProductPricingPage'
import { ImportPage } from './pages/import/ImportPage'
import { AnnouncementListPage } from './pages/announcement/AnnouncementListPage'
import { AnnouncementFormPage } from './pages/announcement/AnnouncementFormPage'
import { POSSettingsPage } from './pages/settings/POSSettingsPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function App() {
  return (
       <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />

        {/* 1. 产品管理 - 产品目录、配方管理、加工工艺、产品分析 */}
        <Route path="products" element={<ProductsIndexPage />}>
          <Route index element={<ProductListPage />} />
          <Route path="new" element={<ProductFormPage />} />
          <Route path=":id/edit" element={<ProductFormPage />} />
          <Route path=":id/recipe" element={<RecipeEditPage />} />
          <Route path="costs" element={<ProductCostPage />} />
          <Route path="recipes" element={<BomAnalysisPage />} />
          <Route path="analysis" element={<ProductAnalysisPage />} />
          <Route path="categories" element={<CategoryListPage />} />
          <Route path="addons" element={<AddonListPage />} />
        </Route>

        {/* 渠道管理 - 独立的顶级模块 */}
        <Route path="channels" element={<ChannelIndexPage />}>
          <Route index element={<ChannelListPage />} />
          <Route path="reports" element={<ChannelReportsPage />} />
          <Route path="commissions" element={<ChannelCommissionPage />} />
          <Route path="pricing" element={<ChannelProductPricingPage />} />
        </Route>

        {/* 2. 库存管理 - 库存列表、库存记录、加工工艺、库存预警、补货建议、供应商 */}
        <Route path="inventory" element={<InventoryIndexPage />}>
          <Route index element={<InventoryPage />} />
          <Route path="logs" element={<StockLogPage />} />
          <Route path="process" element={<ProcessingListPage />} />
          <Route path="process/new" element={<ProcessingFormPage />} />
          <Route path="process/:id/edit" element={<ProcessingFormPage />} />
          <Route path="alerts" element={<StockAlertsPage />} />
          <Route path="alert-config" element={<StockAlertConfigPage />} />
          <Route path="count" element={<InventoryCountPage />} />
          <Route path="restock" element={<RestockSuggestionPage />} />
          <Route path="suppliers" element={<SupplierListPage />} />
        </Route>

        {/* 3. 运营功能 - KDS、外卖聚合、排队叫号（不在导航栏显示，但保留独立路由） */}
        <Route path="kds" element={<KDSPage />} />
        <Route path="kds/config" element={<KDSConfigPage />} />
        <Route path="delivery" element={<DeliveryHubPage />} />
        <Route path="queue" element={<QueueManagePage />} />
        <Route path="queue/display" element={<QueueDisplayPage />} />

        {/* 员工管理 - 6个一级Tab: 员工档案/考勤管理/排班管理/培训管理/薪资管理/积分管理 */}
        <Route path="staff" element={<StaffIndexPage />}>
          {/* 1. 员工档案 */}
          <Route index element={<StaffListPage />} />
          <Route path="new" element={<StaffFormPage />} />
          {/* Specific routes before catch-all :id to avoid /deposit being matched as employee id */}
          <Route path="deposit" element={<Navigate to="/staff/salary/deposit" replace />} />
          {/* Catch-all employee id routes */}
          <Route path=":id" element={<StaffDetailPage />} />
          <Route path=":id/edit" element={<StaffFormPage />} />

          {/* 2. 考勤管理 (考勤记录 + 排班申请) */}
          <Route path="attendance" element={<AttendanceIndexPage />}>
            <Route index element={<AttendanceDashboardPage />} />
            <Route path="dashboard" element={<AttendanceDashboardPage />} />
            <Route path="leave" element={<LeaveListPage />} />
            <Route path="leave/types" element={<LeaveTypeConfigPage />} />
            <Route path="leave/kanban" element={<LeaveKanbanPage />} />
            <Route path="correction" element={<AttendanceCorrectionListPage />} />
            <Route path="shift-swap" element={<ShiftSwapListPage />} />
            <Route path="overtime" element={<OvertimeRequestListPage />} />
            <Route path="rules" element={<AttendanceRulesPage />} />
          </Route>

          {/* 3. 排班管理 */}
          <Route path="schedule" element={<ScheduleCalendarPage />} />
          <Route path="schedule/shifts" element={<ShiftConfigPage />} />

          {/* 4. 培训管理 */}
          <Route path="training" element={<TrainingListPage />} />

          {/* 5. 薪资管理 (工资 + 报销 + 押金) */}
          <Route path="salary" element={<SalaryIndexPage />}>
            <Route index element={<SalaryListPage />} />
            <Route path="salary" element={<SalaryListPage />} />
            <Route path="deposit" element={<StaffDepositListPage />} />
            <Route path="deposit-rules" element={<DepositRulesPage />} />
            <Route path="reimbursement" element={<ReimbursementListPage />} />
            <Route path="reimbursement/types" element={<ReimbursementTypeConfigPage />} />
          </Route>

          {/* 6. 积分管理 */}
          <Route path="points" element={<StaffPointsIndexPage />}>
            <Route index element={<StaffPointsPage />} />
            <Route path="rules" element={<StaffPointsRuleConfigPage />} />
            <Route path="rewards" element={<RewardsPage />} />
          </Route>
        </Route>

        {/* 6. 营销管理 - 促销/会员/积分/消息/运营 */}
        <Route path="marketing" element={<MarketingIndexPage />}>
          {/* 默认跳转 - 重定向旧路由到新分组 */}
          <Route index element={<Navigate to="/marketing/promotions" replace />} />

          {/* 旧路由兼容 - 重定向到新分组 */}
          <Route path="campaigns" element={<Navigate to="/marketing/promotions/campaigns" replace />} />
          <Route path="coupons" element={<Navigate to="/marketing/promotions/coupons" replace />} />
          <Route path="referrals" element={<Navigate to="/marketing/promotions/referrals" replace />} />
          <Route path="campaign-categories" element={<Navigate to="/marketing/promotions/campaign-categories" replace />} />
          <Route path="members" element={<Navigate to="/marketing/members" replace />} />
          <Route path="tier-benefits" element={<Navigate to="/marketing/members/tier-benefits" replace />} />
          <Route path="points-rule" element={<Navigate to="/marketing/points" replace />} />
          <Route path="points-expiry" element={<Navigate to="/marketing/points/expiry" replace />} />
          <Route path="rewards" element={<Navigate to="/marketing/points/rewards" replace />} />
          <Route path="channels" element={<Navigate to="/marketing/messages" replace />} />
          <Route path="message-settings" element={<Navigate to="/marketing/messages/settings" replace />} />
          <Route path="automation" element={<Navigate to="/marketing/operations" replace />} />
          <Route path="notifications" element={<Navigate to="/marketing/operations/notifications" replace />} />
          <Route path="analytics" element={<Navigate to="/marketing/operations/analytics" replace />} />

          {/* 促销: 活动/优惠券/推荐/类别/满减规则 */}
          <Route path="promotions" element={<PromotionsIndexPage />}>
            <Route index element={<CampaignListPage />} />
            <Route path="campaigns" element={<CampaignListPage />} />
            <Route path="campaigns/:id" element={<CampaignDetailPage />} />
            <Route path="campaigns/:id/stats" element={<CampaignStatsPage />} />
            <Route path="campaigns/new" element={<CampaignEditPage />} />
            <Route path="campaigns/:id/edit" element={<CampaignEditPage />} />
            <Route path="coupons" element={<CouponListPage />} />
            <Route path="coupons/:id" element={<CouponDetailPage />} />
            <Route path="coupons/new" element={<CouponEditPage />} />
            <Route path="coupons/:id/edit" element={<CouponEditPage />} />
            <Route path="referrals" element={<ReferralListPage />} />
            <Route path="referrals/:id" element={<ReferralDetailPage />} />
            <Route path="campaign-categories" element={<CampaignCategoryListPage />} />
            <Route path="discount-rules" element={<DiscountRulePage />} />
            <Route path="timed-specials" element={<TimedSpecialPage />} />
            <Route path="stacking-rules" element={<StackingRulePage />} />
          </Route>
          {/* 会员: 会员列表/等级权益 */}
          <Route path="members" element={<MembersIndexPage />}>
            <Route index element={<MemberListPage />} />
            <Route path="list" element={<MemberListPage />} />
            <Route path=":id" element={<MemberDetailPage />} />
            <Route path="tier-benefits" element={<TierBenefitsPage />} />
            <Route path="balance" element={<MemberBalancePage />} />
          </Route>
          {/* 积分: 规则/过期/奖励 */}
          <Route path="points" element={<PointsIndexPage />}>
            <Route index element={<PointsRuleConfigPage />} />
            <Route path="rule" element={<PointsRuleConfigPage />} />
            <Route path="expiry" element={<PointsExpiryConfigPage />} />
            <Route path="rewards" element={<RewardCatalogPage />} />
          </Route>
          {/* 消息: 渠道/设置 */}
          <Route path="messages" element={<MessagesIndexPage />}>
            <Route index element={<MarketingChannelsPage />} />
            <Route path="channels" element={<MarketingChannelsPage />} />
            <Route path="settings" element={<MessageSettingsPage />} />
            <Route path="stats" element={<MessageStatsPage />} />
          </Route>
          {/* 运营: 自动化/通知/分析 */}
          <Route path="operations" element={<OperationsIndexPage />}>
            <Route index element={<AutomationPage />} />
            <Route path="automation" element={<AutomationPage />} />
            <Route path="automation/rules" element={<AutomationRulePage />} />
            <Route path="automation/logs" element={<AutomationLogPage />} />
            <Route path="notifications" element={<NotificationHistoryPage />} />
            <Route path="analytics" element={<MarketingAnalyticsPage />} />
            <Route path="analytics/coupons" element={<CouponReportPage />} />
            <Route path="analytics/campaigns" element={<CampaignReportPage />} />
            <Route path="analytics/referral" element={<ReferralFunnelPage />} />
          </Route>
        </Route>

        {/* 7. 卫生管理 - 任务、统计 */}
        <Route path="hygiene" element={<HygieneIndexPage />}>
          <Route index element={<HygieneTemplateListPage />} />
          <Route path="new" element={<HygieneTemplateFormPage />} />
          <Route path=":id/edit" element={<HygieneTemplateFormPage />} />
          <Route path="areas" element={<HygieneAreasPage />} />
          <Route path="calendar" element={<HygieneCalendarPage />} />
          <Route path="today" element={<HygieneTodayTasksPage />} />
          <Route path="stats" element={<HygieneStatsPage />} />
          <Route path="config" element={<HygieneConfigPage />} />
        </Route>

        {/* 8. 财务管理 - 营收/订单/退款/费用/固定资产/报表/税务 */}
        <Route path="finance" element={<FinanceIndexPage />}>
          <Route index element={<Navigate to="/finance/revenue" replace />} />
          <Route path="revenue" element={<RevenuePage />} />
          <Route path="orders" element={<OrderListPage />} />
          <Route path="orders/:id" element={<OrderDetailPage />} />
          <Route path="refunds" element={<RefundRequestListPage />} />
          <Route path="expenses" element={<ExpenseListPage />} />
          <Route path="fixed-assets" element={<FixedAssetsPage />} />
          <Route path="reports" element={<FinanceReportsPage />} />
          <Route path="tax" element={<TaxReportsPage />} />
        </Route>

        {/* 9. 公告管理 */}
        <Route path="announcement" element={<AnnouncementListPage />} />
        <Route path="announcement/new" element={<AnnouncementFormPage />} />
        <Route path="announcement/edit/:id" element={<AnnouncementFormPage />} />

        {/* 10. 系统设置 */}
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/pos" element={<POSSettingsPage />} />

        {/* 10. 数据导入 */}
        <Route path="import" element={<ImportPage />} />
      </Route>
    </Routes>
  )
}

export default App