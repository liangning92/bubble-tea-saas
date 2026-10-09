import { lazy, Suspense } from 'react'
import { RouteLoading } from './components/RouteLoading'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './stores/auth'
import { MainLayout } from './layouts/MainLayout'
import { DashboardFeatureUnavailable } from './components/DashboardReadState'

const MessageLogPage = lazy(() => import('./pages/marketing/MessageLogPage').then(module => ({default:module.MessageLogPage})))
const MarketingOverviewPage = lazy(() => import('./pages/marketing/MarketingOverviewPage').then(module => ({ default: module.MarketingOverviewPage })))
const ActivitiesPage = lazy(() => import('./pages/marketing/ActivitiesPage').then(module => ({ default: module.ActivitiesPage })))
const StaffAdjustmentsPage = lazy(() => import('./pages/staff/StaffAdjustmentsPage').then(module => ({ default: module.StaffAdjustmentsPage })))
const TrainingLibraryPage = lazy(() => import('./pages/TrainingLibraryPage').then(module => ({ default: module.TrainingLibraryPage })))
const ConsumptionAnalysisPage = lazy(() => import('./pages/inventory/ConsumptionAnalysisPage').then(module => ({ default: module.ConsumptionAnalysisPage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then(module => ({ default: module.LoginPage })))
const RegisterPage = lazy(() => import('./pages/RegisterPage').then(module => ({ default: module.RegisterPage })))
const POSMonitorPage = lazy(() => import('./pages/POSMonitorPage').then(module => ({ default: module.POSMonitorPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(module => ({ default: module.DashboardPage })))
const ProductsIndexPage = lazy(() => import('./pages/products/ProductsIndexPage').then(module => ({ default: module.ProductsIndexPage })))
const ProductListPage = lazy(() => import('./pages/products/ProductListPage').then(module => ({ default: module.ProductListPage })))
const ProductFormPage = lazy(() => import('./pages/products/ProductFormPage').then(module => ({ default: module.ProductFormPage })))
const OrderListPage = lazy(() => import('./pages/orders/OrderListPage').then(module => ({ default: module.OrderListPage })))
const OrderDetailPage = lazy(() => import('./pages/orders/OrderDetailPage').then(module => ({ default: module.OrderDetailPage })))
const RefundRequestListPage = lazy(() => import('./pages/orders/RefundRequestListPage').then(module => ({ default: module.RefundRequestListPage })))
const InventoryIndexPage = lazy(() => import('./pages/inventory/InventoryIndexPage').then(module => ({ default: module.InventoryIndexPage })))
const InventoryPage = lazy(() => import('./pages/inventory/InventoryPage').then(module => ({ default: module.InventoryPage })))
const StockLogPage = lazy(() => import('./pages/inventory/StockLogPage').then(module => ({ default: module.StockLogPage })))
const StockAlertsPage = lazy(() => import('./pages/inventory/StockAlertsPage').then(module => ({ default: module.StockAlertsPage })))
const StockAlertConfigPage = lazy(() => import('./pages/inventory/StockAlertConfigPage').then(module => ({ default: module.StockAlertConfigPage })))
const InventoryCountPage = lazy(() => import('./pages/inventory/InventoryCountPage').then(module => ({ default: module.InventoryCountPage })))
const StaffIndexPage = lazy(() => import('./pages/staff/StaffIndexPage').then(module => ({ default: module.StaffIndexPage })))
const StaffListPage = lazy(() => import('./pages/staff/StaffListPage').then(module => ({ default: module.StaffListPage })))
const StaffFormPage = lazy(() => import('./pages/staff/StaffFormPage').then(module => ({ default: module.StaffFormPage })))
const StaffDetailPage = lazy(() => import('./pages/staff/StaffDetailPage').then(module => ({ default: module.StaffDetailPage })))
const LeaveBalancePage = lazy(() => import('./pages/staff/LeaveBalancePage').then(module => ({ default: module.LeaveBalancePage })))
const LeaveListPage = lazy(() => import('./pages/staff/LeaveListPage').then(module => ({ default: module.LeaveListPage })))
const LeaveTypeConfigPage = lazy(() => import('./pages/staff/LeaveTypeConfigPage').then(module => ({ default: module.LeaveTypeConfigPage })))
const LeaveKanbanPage = lazy(() => import('./pages/staff/LeaveKanbanPage').then(module => ({ default: module.LeaveKanbanPage })))
const ScheduleCalendarPage = lazy(() => import('./pages/staff/ScheduleCalendarPage').then(module => ({ default: module.ScheduleCalendarPage })))
const TrainingListPage = lazy(() => import('./pages/staff/TrainingListPage').then(module => ({ default: module.TrainingListPage })))
const StaffPointsPage = lazy(() => import('./pages/staff/StaffPointsPage').then(module => ({ default: module.StaffPointsPage })))
const DepositRulesPage = lazy(() => import('./pages/staff/DepositRulesPage').then(module => ({ default: module.DepositRulesPage })))
const StaffDepositListPage = lazy(() => import('./pages/staff/StaffDepositListPage').then(module => ({ default: module.StaffDepositListPage })))
const AttendanceRulesPage = lazy(() => import('./pages/staff/AttendanceRulesPage').then(module => ({ default: module.AttendanceRulesPage })))
const ShiftConfigPage = lazy(() => import('./pages/staff/ShiftConfigPage').then(module => ({ default: module.ShiftConfigPage })))
const ReimbursementListPage = lazy(() => import('./pages/staff/ReimbursementListPage').then(module => ({ default: module.ReimbursementListPage })))
const ReimbursementTypeConfigPage = lazy(() => import('./pages/staff/ReimbursementTypeConfigPage').then(module => ({ default: module.ReimbursementTypeConfigPage })))
const SalaryListPage = lazy(() => import('./pages/staff/SalaryListPage').then(module => ({ default: module.SalaryListPage })))
const ShiftSwapListPage = lazy(() => import('./pages/staff/ShiftSwapListPage').then(module => ({ default: module.ShiftSwapListPage })))
const AttendanceCorrectionListPage = lazy(() => import('./pages/staff/AttendanceCorrectionListPage').then(module => ({ default: module.AttendanceCorrectionListPage })))
const OvertimeRequestListPage = lazy(() => import('./pages/staff/OvertimeRequestListPage').then(module => ({ default: module.OvertimeRequestListPage })))
const AttendanceIndexPage = lazy(() => import('./pages/staff/AttendanceIndexPage').then(module => ({ default: module.AttendanceIndexPage })))
const AttendanceDashboardPage = lazy(() => import('./pages/staff/AttendanceDashboardPage').then(module => ({ default: module.AttendanceDashboardPage })))
const SalaryIndexPage = lazy(() => import('./pages/staff/SalaryIndexPage').then(module => ({ default: module.SalaryIndexPage })))
const StaffPointsIndexPage = lazy(() => import('./pages/staff/PointsIndexPage').then(module => ({ default: module.PointsIndexPage })))
const StaffPointsRuleConfigPage = lazy(() => import('./pages/staff/PointsRuleConfigPage').then(module => ({ default: module.PointsRuleConfigPage })))
const RewardsPage = lazy(() => import('./pages/staff/RewardsPage').then(module => ({ default: module.RewardsPage })))
const PurchaseOrderListPage = lazy(() => import('./pages/purchases/PurchaseOrderListPage').then(module => ({ default: module.PurchaseOrderListPage })))
const SupplierListPage = lazy(() => import('./pages/purchases/SupplierListPage').then(module => ({ default: module.SupplierListPage })))
const MemberListPage = lazy(() => import('./pages/members/MemberListPage').then(module => ({ default: module.MemberListPage })))
const MemberDetailPage = lazy(() => import('./pages/members/MemberDetailPage').then(module => ({ default: module.MemberDetailPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(module => ({ default: module.SettingsPage })))
const KDSPage = lazy(() => import('./pages/kds/KDSPage').then(module => ({ default: module.KDSPage })))
const KDSConfigPage = lazy(() => import('./pages/kds/KDSConfigPage').then(module => ({ default: module.KDSConfigPage })))
const DeliveryHubPage = lazy(() => import('./pages/delivery/DeliveryHubPage').then(module => ({ default: module.DeliveryHubPage })))
const HygieneIndexPage = lazy(() => import('./pages/hygiene/HygieneIndexPage').then(module => ({ default: module.HygieneIndexPage })))
const HygieneTemplateListPage = lazy(() => import('./pages/hygiene/HygieneTemplateListPage').then(module => ({ default: module.HygieneTemplateListPage })))
const HygieneTemplateFormPage = lazy(() => import('./pages/hygiene/HygieneTemplateFormPage').then(module => ({ default: module.HygieneTemplateFormPage })))
const HygieneCalendarPage = lazy(() => import('./pages/hygiene/HygieneCalendarPage').then(module => ({ default: module.HygieneCalendarPage })))
const HygieneTodayTasksPage = lazy(() => import('./pages/hygiene/HygieneTodayTasksPage').then(module => ({ default: module.HygieneTodayTasksPage })))
const HygieneStatsPage = lazy(() => import('./pages/hygiene/HygieneStatsPage').then(module => ({ default: module.HygieneStatsPage })))
const HygieneAreasPage = lazy(() => import('./pages/hygiene/HygieneAreasPage').then(module => ({ default: module.HygieneAreasPage })))
const HygieneConfigPage = lazy(() => import('./pages/hygiene/HygieneConfigPage').then(module => ({ default: module.HygieneConfigPage })))
const BomAnalysisPage = lazy(() => import('./pages/bom/BomAnalysisPage').then(module => ({ default: module.BomAnalysisPage })))
const RecipeEditPage = lazy(() => import('./pages/bom/RecipeEditPage').then(module => ({ default: module.RecipeEditPage })))
const ProcessingListPage = lazy(() => import('./pages/material/ProcessingListPage').then(module => ({ default: module.ProcessingListPage })))
const ProcessingFormPage = lazy(() => import('./pages/material/ProcessingFormPage').then(module => ({ default: module.ProcessingFormPage })))
const RestockSuggestionPage = lazy(() => import('./pages/material/RestockSuggestionPage').then(module => ({ default: module.RestockSuggestionPage })))
const MarketingIndexPage = lazy(() => import('./pages/marketing/MarketingIndexPage').then(module => ({ default: module.MarketingIndexPage })))
const PromotionsIndexPage = lazy(() => import('./pages/marketing/PromotionsIndexPage').then(module => ({ default: module.PromotionsIndexPage })))
const MembersIndexPage = lazy(() => import('./pages/marketing/MembersIndexPage').then(module => ({ default: module.MembersIndexPage })))
const PointsIndexPage = lazy(() => import('./pages/marketing/PointsIndexPage').then(module => ({ default: module.PointsIndexPage })))
const MessagesIndexPage = lazy(() => import('./pages/marketing/MessagesIndexPage').then(module => ({ default: module.MessagesIndexPage })))
const OperationsIndexPage = lazy(() => import('./pages/marketing/OperationsIndexPage').then(module => ({ default: module.OperationsIndexPage })))
const CouponListPage = lazy(() => import('./pages/marketing/CouponListPage').then(module => ({ default: module.CouponListPage })))
const CouponDetailPage = lazy(() => import('./pages/marketing/CouponDetailPage').then(module => ({ default: module.CouponDetailPage })))
const CouponEditPage = lazy(() => import('./pages/marketing/CouponEditPage').then(module => ({ default: module.CouponEditPage })))
const ReferralListPage = lazy(() => import('./pages/marketing/ReferralListPage').then(module => ({ default: module.ReferralListPage })))
const ReferralDetailPage = lazy(() => import('./pages/marketing/ReferralDetailPage').then(module => ({ default: module.ReferralDetailPage })))
const TierBenefitsPage = lazy(() => import('./pages/marketing/TierBenefitsPage').then(module => ({ default: module.TierBenefitsPage })))
const PointsExpiryConfigPage = lazy(() => import('./pages/marketing/PointsExpiryConfigPage').then(module => ({ default: module.PointsExpiryConfigPage })))
const MarketingAnalyticsPage = lazy(() => import('./pages/marketing/MarketingAnalyticsPage').then(module => ({ default: module.MarketingAnalyticsPage })))
const CampaignCategoryListPage = lazy(() => import('./pages/marketing/CampaignCategoryListPage').then(module => ({ default: module.CampaignCategoryListPage })))
const MarketingChannelsPage = lazy(() => import('./pages/marketing/MarketingChannelsPage').then(module => ({ default: module.MarketingChannelsPage })))
const NotificationHistoryPage = lazy(() => import('./pages/marketing/NotificationHistoryPage').then(module => ({ default: module.NotificationHistoryPage })))
const AutomationPage = lazy(() => import('./pages/marketing/AutomationPage').then(module => ({ default: module.AutomationPage })))
const MessageSettingsPage = lazy(() => import('./pages/marketing/MessageSettingsPage').then(module => ({ default: module.MessageSettingsPage })))
const PointsRuleConfigPage = lazy(() => import('./pages/marketing/PointsRuleConfigPage').then(module => ({ default: module.PointsRuleConfigPage })))
const RewardCatalogPage = lazy(() => import('./pages/marketing/RewardCatalogPage').then(module => ({ default: module.RewardCatalogPage })))
const MemberBalancePage = lazy(() => import('./pages/marketing/MemberBalancePage').then(module => ({ default: module.MemberBalancePage })))
const AutomationRulePage = lazy(() => import('./pages/marketing/AutomationRulePage').then(module => ({ default: module.AutomationRulePage })))
const AutomationLogPage = lazy(() => import('./pages/marketing/AutomationLogPage').then(module => ({ default: module.AutomationLogPage })))
const MessageStatsPage = lazy(() => import('./pages/marketing/MessageStatsPage').then(module => ({ default: module.MessageStatsPage })))
const CouponReportPage = lazy(() => import('./pages/marketing/CouponReportPage').then(module => ({ default: module.CouponReportPage })))
const CampaignReportPage = lazy(() => import('./pages/marketing/CampaignReportPage').then(module => ({ default: module.CampaignReportPage })))
const ReferralFunnelPage = lazy(() => import('./pages/marketing/ReferralFunnelPage').then(module => ({ default: module.ReferralFunnelPage })))
const ProductAnalysisPage = lazy(() => import('./pages/product-analysis/ProductAnalysisPage').then(module => ({ default: module.ProductAnalysisPage })))
const AddonListPage = lazy(() => import('./pages/addons/AddonListPage').then(module => ({ default: module.AddonListPage })))
const CategoryListPage = lazy(() => import('./pages/categories/CategoryListPage').then(module => ({ default: module.CategoryListPage })))
const QueueManagePage = lazy(() => import('./pages/queue/QueueManagePage').then(module => ({ default: module.QueueManagePage })))
const QueueDisplayPage = lazy(() => import('./pages/queue/QueueDisplayPage').then(module => ({ default: module.QueueDisplayPage })))
const RevenuePage = lazy(() => import('./pages/finance/RevenuePage').then(module => ({ default: module.RevenuePage })))
const FinanceReportsPage = lazy(() => import('./pages/finance/FinanceReportsPage').then(module => ({ default: module.FinanceReportsPage })))
const FinanceIndexPage = lazy(() => import('./pages/finance/FinanceIndexPage').then(module => ({ default: module.FinanceIndexPage })))
const ShiftReviewPage = lazy(() => import('./pages/dashboard/ShiftReviewPage').then(module => ({ default: module.ShiftReviewPage })))
const FixedAssetsPage = lazy(() => import('./pages/finance/FixedAssetsPage').then(module => ({ default: module.FixedAssetsPage })))
const TaxReportsPage = lazy(() => import('./pages/finance/TaxReportsPage').then(module => ({ default: module.TaxReportsPage })))
const AccountsPage = lazy(() => import('./pages/finance/AccountsPage').then(module => ({ default: module.AccountsPage })))
const BudgetPage = lazy(() => import('./pages/finance/BudgetPage').then(module => ({ default: module.BudgetPage })))
const FinanceSettingsPage = lazy(() => import('./pages/finance/FinanceSettingsPage').then(module => ({ default: module.FinanceSettingsPage })))
const ExpenseListPage = lazy(() => import('./pages/expense/ExpenseListPage').then(module => ({ default: module.ExpenseListPage })))
const ChannelIndexPage = lazy(() => import('./pages/channels/ChannelIndexPage').then(module => ({ default: module.ChannelIndexPage })))
const ChannelListPage = lazy(() => import('./pages/channels/ChannelListPage').then(module => ({ default: module.ChannelListPage })))
const ChannelReportsPage = lazy(() => import('./pages/channels/ChannelReportsPage').then(module => ({ default: module.ChannelReportsPage })))
const ChannelCommissionPage = lazy(() => import('./pages/channels/ChannelCommissionPage').then(module => ({ default: module.ChannelCommissionPage })))
const ChannelProductPricingPage = lazy(() => import('./pages/channels/ChannelProductPricingPage').then(module => ({ default: module.ChannelProductPricingPage })))
const ImportPage = lazy(() => import('./pages/import/ImportPage').then(module => ({ default: module.ImportPage })))
const AnnouncementListPage = lazy(() => import('./pages/announcement/AnnouncementListPage').then(module => ({ default: module.AnnouncementListPage })))
const AnnouncementFormPage = lazy(() => import('./pages/announcement/AnnouncementFormPage').then(module => ({ default: module.AnnouncementFormPage })))

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}


function LegacyShiftRedirect() {
  const { search, hash } = useLocation()
  return <Navigate to={`/dashboard/shifts${search}${hash}`} replace />
}

function App() {
  return (
    <Suspense fallback={<RouteLoading />}><Routes>
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
        <Route path="dashboard/shifts" element={<ShiftReviewPage />} />
        <Route path="finance/shifts" element={<LegacyShiftRedirect />} />
        <Route path="pos-monitor" element={<POSMonitorPage />} />

        {/* 1. 产品管理 */}
        <Route path="products" element={<ProductsIndexPage />}>
          <Route index element={<ProductListPage />} />
          <Route path="new" element={<ProductFormPage />} />
          <Route path=":id/edit" element={<ProductFormPage />} />
          <Route path=":id/recipe" element={<RecipeEditPage />} />
          <Route path="costs" element={<Navigate to="/products/recipes" replace />} />
          <Route path="recipes" element={<BomAnalysisPage />} />
          <Route path="analysis" element={<ProductAnalysisPage />} />
          <Route path="categories" element={<CategoryListPage />} />
          <Route path="addons" element={<AddonListPage />} />
        </Route>

        {/* 渠道管理 */}
        <Route path="channels" element={<ChannelIndexPage />}>
          <Route index element={<ChannelListPage />} />
          <Route path="reports" element={<ChannelReportsPage />} />
          <Route path="commissions" element={<ChannelCommissionPage />} />
          <Route path="pricing" element={<ChannelProductPricingPage />} />
        </Route>

        {/* 2. 库存管理 */}
        <Route path="inventory" element={<InventoryIndexPage />}>
          <Route index element={<InventoryPage />} />
          <Route path="logs" element={<StockLogPage />} />
          <Route path="process" element={<ProcessingListPage />} />
          <Route path="process/new" element={<ProcessingFormPage />} />
          <Route path="process/:id/edit" element={<ProcessingFormPage />} />
          <Route path="alerts" element={<StockAlertsPage />} />
          <Route path="consumption-analysis" element={<DashboardFeatureUnavailable />} />
          <Route path="alert-config" element={<StockAlertConfigPage />} />
          <Route path="count" element={<InventoryCountPage />} />
          <Route path="consumption" element={<ConsumptionAnalysisPage />} />
          <Route path="restock" element={<RestockSuggestionPage />} />
          <Route path="suppliers" element={<SupplierListPage />} />
          <Route path="purchase-orders" element={<PurchaseOrderListPage />} />
        </Route>

        {/* 3. 运营功能 */}
        <Route path="kds" element={<KDSPage />} />
        <Route path="kds/config" element={<KDSConfigPage />} />
        <Route path="delivery" element={<DeliveryHubPage />} />
        <Route path="queue" element={<QueueManagePage />} />
        <Route path="queue/display" element={<QueueDisplayPage />} />

        {/* 员工管理 */}
        <Route path="staff" element={<StaffIndexPage />}>
          <Route index element={<StaffListPage />} />
          <Route path="new" element={<StaffFormPage />} />
          <Route path="adjustments" element={<StaffAdjustmentsPage />} />
          <Route path="deposit" element={<Navigate to="/staff/salary/deposit" replace />} />
          <Route path=":id" element={<StaffDetailPage />} />
          <Route path=":id/edit" element={<StaffFormPage />} />

          {/* 考勤管理 */}
          <Route path="attendance" element={<AttendanceIndexPage />}>
            <Route index element={<AttendanceDashboardPage />} />
            <Route path="dashboard" element={<AttendanceDashboardPage />} />
            <Route path="leave" element={<LeaveListPage />} />
            <Route path="leave/balance" element={<LeaveBalancePage />} />
            <Route path="leave/types" element={<LeaveTypeConfigPage />} />
            <Route path="leave/kanban" element={<LeaveKanbanPage />} />
            <Route path="correction" element={<AttendanceCorrectionListPage />} />
            <Route path="shift-swap" element={<ShiftSwapListPage />} />
            <Route path="overtime" element={<OvertimeRequestListPage />} />
            <Route path="rules" element={<AttendanceRulesPage />} />
          </Route>

          {/* 排班管理 */}
          <Route path="schedule" element={<ScheduleCalendarPage />} />
          <Route path="schedule/shifts" element={<ShiftConfigPage />} />

          {/* 培训管理 */}
          <Route path="training" element={<TrainingListPage />} />
          <Route path="training/library" element={<TrainingLibraryPage />} />

          {/* 薪资管理 */}
          <Route path="salary" element={<SalaryIndexPage />}>
            <Route index element={<SalaryListPage />} />
            <Route path="salary" element={<SalaryListPage />} />
            <Route path="deposit" element={<StaffDepositListPage />} />
            <Route path="deposit-rules" element={<DepositRulesPage />} />
            <Route path="reimbursement" element={<ReimbursementListPage />} />
            <Route path="reimbursement/types" element={<ReimbursementTypeConfigPage />} />
          </Route>

          {/* 积分管理 */}
          <Route path="points" element={<StaffPointsIndexPage />}>
            <Route index element={<StaffPointsPage />} />
            <Route path="rules" element={<StaffPointsRuleConfigPage />} />
            <Route path="rewards" element={<RewardsPage />} />
          </Route>
        </Route>

        {/* 营销管理 */}
        <Route path="marketing" element={<MarketingIndexPage />}>
          <Route index element={<Navigate to="/marketing/overview" replace />} />
          <Route path="overview" element={<MarketingOverviewPage />} />

          {/* 促销 */}
          <Route path="promotions" element={<PromotionsIndexPage />}>
            <Route index element={<Navigate to="/marketing/promotions/activities" replace />} />
            <Route path="activities" element={<ActivitiesPage />} />
            <Route path="campaigns" element={<ActivitiesPage />} />
            <Route path="campaigns/:id" element={<Navigate to="/marketing/promotions/activities" replace />} />
            <Route path="campaigns/:id/stats" element={<Navigate to="/marketing/promotions/activities" replace />} />
            <Route path="campaigns/new" element={<Navigate to="/marketing/promotions/activities" replace />} />
            <Route path="campaigns/:id/edit" element={<Navigate to="/marketing/promotions/activities" replace />} />
            <Route path="coupons" element={<CouponListPage />} />
            <Route path="coupons/:id" element={<CouponDetailPage />} />
            <Route path="coupons/new" element={<CouponEditPage />} />
            <Route path="coupons/:id/edit" element={<CouponEditPage />} />
            <Route path="referrals" element={<ReferralListPage />} />
            <Route path="referrals/:id" element={<ReferralDetailPage />} />
            <Route path="campaign-categories" element={<CampaignCategoryListPage />} />
            <Route path="discount-rules" element={<Navigate to="/marketing/promotions/activities" replace />} />
            <Route path="timed-specials" element={<Navigate to="/marketing/promotions/activities" replace />} />
            <Route path="stacking-rules" element={<Navigate to="/marketing/promotions/activities" replace />} />
            <Route path="tv-screen" element={<Navigate to="/settings/tv-screen" replace />} />
          </Route>

          {/* 会员 */}
          <Route path="members" element={<MembersIndexPage />}>
            <Route index element={<MemberListPage />} />
            <Route path="list" element={<MemberListPage />} />
            <Route path=":id" element={<MemberDetailPage />} />
            <Route path="tier-benefits" element={<TierBenefitsPage />} />
            <Route path="balance" element={<MemberBalancePage />} />
          </Route>

          {/* 积分 */}
          <Route path="points" element={<PointsIndexPage />}>
            <Route index element={<PointsRuleConfigPage />} />
            <Route path="rule" element={<PointsRuleConfigPage />} />
            <Route path="expiry" element={<PointsExpiryConfigPage />} />
            <Route path="rewards" element={<RewardCatalogPage />} />
          </Route>

          {/* 消息 */}
          <Route path="messages" element={<MessagesIndexPage />}>
            <Route index element={<MarketingChannelsPage />} />
            <Route path="channels" element={<MarketingChannelsPage />} />
            <Route path="settings" element={<MessageSettingsPage />} />
            <Route path="stats" element={<MessageStatsPage />} />
            <Route path="logs" element={<MessageLogPage />} />
          </Route>

          {/* 运营 */}
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

          {/* 电视大屏互动 */}
          <Route path="tv-screen" element={<Navigate to="/settings/tv-screen" replace />} />
        </Route>

        {/* 卫生管理 */}
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

        {/* 财务管理 */}
        <Route path="finance" element={<FinanceIndexPage />}>
          <Route index element={<Navigate to="/finance/revenue" replace />} />
          <Route path="revenue" element={<RevenuePage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="budgets" element={<BudgetPage />} />
          <Route path="orders" element={<OrderListPage />} />
          <Route path="orders/:id" element={<OrderDetailPage />} />
          <Route path="refunds" element={<RefundRequestListPage />} />
          <Route path="expenses" element={<ExpenseListPage />} />
          <Route path="fixed-assets" element={<FixedAssetsPage />} />
          <Route path="reports" element={<FinanceReportsPage />} />
          <Route path="tax" element={<TaxReportsPage />} />
          <Route path="settings" element={<FinanceSettingsPage />} />
        </Route>

        {/* 公告管理 */}
        <Route path="announcement" element={<AnnouncementListPage />} />
        <Route path="announcement/new" element={<AnnouncementFormPage />} />
        <Route path="announcement/edit/:id" element={<AnnouncementFormPage />} />

        {/* 系统设置 */}
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/pos" element={<SettingsPage />} />
        <Route path="settings/tv-screen" element={<SettingsPage />} />
        <Route path="settings/ai" element={<SettingsPage />} />
        <Route path="settings/permissions" element={<SettingsPage />} />

        {/* 数据导入 */}
        <Route path="import" element={<ImportPage />} />
      </Route>
    </Routes></Suspense>
  )
}

export default App