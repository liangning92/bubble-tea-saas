"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const env_1 = require("./config/env");
const auth_1 = require("./routes/auth");
const store_1 = require("./routes/store");
const product_1 = require("./routes/product");
const order_1 = require("./routes/order");
const inventory_1 = require("./routes/inventory");
const staff_1 = require("./routes/staff");
const member_1 = require("./routes/member");
const category_1 = require("./routes/category");
const config_1 = require("./routes/config");
const receiptTemplate_1 = require("./routes/receiptTemplate");
const posActionLog_1 = require("./routes/posActionLog");
const report_1 = require("./routes/report");
const supplier_1 = require("./routes/supplier");
const purchaseOrder_1 = require("./routes/purchaseOrder");
const marketing_1 = require("./routes/marketing");
const finance_1 = require("./routes/finance");
const financeAccount_1 = require("./routes/financeAccount");
const financeAsset_1 = require("./routes/financeAsset");
const financeBudget_1 = require("./routes/financeBudget");
const financeReport_1 = require("./routes/financeReport");
const staffManagement_1 = require("./routes/staffManagement");
const staffSalary_1 = require("./routes/staffSalary");
const staffPoint_1 = require("./routes/staffPoint");
const deposit_1 = require("./routes/deposit");
const attendanceRule_1 = require("./routes/attendanceRule");
const attendanceQR_1 = require("./routes/attendanceQR");
const training_1 = require("./routes/training");
const staffCorrection_1 = require("./routes/staffCorrection");
const shift_1 = require("./routes/shift");
const productAnalysis_1 = require("./routes/productAnalysis");
const leave_1 = require("./routes/leave");
const reimbursement_1 = require("./routes/reimbursement");
const leaveType_1 = require("./routes/leaveType");
const reimbursementType_1 = require("./routes/reimbursementType");
const upload_1 = require("./routes/upload");
const addon_1 = require("./routes/addon");
const inventoryCount_1 = require("./routes/inventoryCount");
const processRecipe_1 = require("./routes/processRecipe");
const channel_1 = require("./routes/channel");
const productPrice_1 = require("./routes/productPrice");
const expense_1 = require("./routes/expense");
const salary_1 = require("./routes/salary");
const hygiene_1 = require("./routes/hygiene");
const bom_1 = require("./routes/bom");
const material_1 = require("./routes/material");
const referral_1 = require("./routes/referral");
const tierBenefit_1 = require("./routes/tierBenefit");
const pointsExpiry_1 = require("./routes/pointsExpiry");
const pointsRule_1 = require("./routes/pointsRule");
const rewardCatalog_1 = require("./routes/rewardCatalog");
const marketingChannel_1 = require("./routes/marketingChannel");
const marketingAnalytics_1 = require("./routes/marketingAnalytics");
const notification_1 = require("./routes/notification");
const message_1 = require("./routes/message");
const posCash_1 = require("./routes/posCash");
const revenue_1 = require("./routes/revenue");
const payment_1 = __importDefault(require("./routes/payment"));
const announcement_1 = __importDefault(require("./routes/announcement"));
const campaignCategory_1 = require("./routes/campaignCategory");
const hardware_1 = require("./routes/hardware");
const sync_1 = __importDefault(require("./routes/sync"));
const SchedulerService_1 = require("./services/SchedulerService");
const MarketingSchedulerService_1 = require("./services/MarketingSchedulerService");
const errorHandler_1 = require("./middlewares/errorHandler");
const notFound_1 = require("./middlewares/notFound");
const socket_1 = require("./socket");
const app = (0, express_1.default)();
const httpServer = http_1.default.createServer(app);
// Socket.IO Setup
socket_1.socketManager.initialize(httpServer);
// ============================================================
// Global Error Handlers (must be before any async operations)
// ============================================================
// Unhandled Promise rejection → crash with details instead of silent death
process.on('unhandledRejection', (reason, promise) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    console.error('[Server] FATAL: Unhandled Promise Rejection:');
    console.error('[Server] Reason:', message);
    if (stack) {
        console.error('[Server] Stack:', stack);
    }
    console.error('[Server] Promise:', promise);
    // Give logs time to flush before exiting
    setTimeout(() => process.exit(1), 1000);
});
// Uncaught exception → crash with details
process.on('uncaughtException', (err) => {
    console.error('[Server] FATAL: Uncaught Exception:');
    console.error('[Server] Message:', err.message);
    console.error('[Server] Stack:', err.stack);
    setTimeout(() => process.exit(1), 1000);
});
// HTTP Server error handler (e.g. EADDRINUSE)
httpServer.on('error', (err) => {
    console.error('[Server] HTTP server error:', err.message);
    if (err.code === 'EADDRINUSE') {
        console.error(`[Server] Port ${env_1.config.port} is already in use. Please close other applications using this port.`);
    }
    else if (err.code === 'EACCES') {
        console.error(`[Server] Port ${env_1.config.port} requires elevated permissions.`);
    }
    process.exit(1);
});
// Security & Logging Middlewares
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: env_1.config.corsOrigin.split(','),
    credentials: true
}));
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// Serve uploaded files
// UPLOADS_PATH: set by Electron main process when forking this server
// In asar: app.asar.unpacked/server/uploads (via extraResources)
// In dev: project root/server/uploads (fallback)
const uploadsPath = process.env.UPLOADS_PATH || path_1.default.join(__dirname, '../uploads');
app.use('/uploads', express_1.default.static(uploadsPath));
// Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'bubble-tea-api',
        version: '2.0.0'
    });
});
// POS Health Check (same as /health, at /api/health for POS client compatibility)
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'bubble-tea-api',
        version: '2.0.0'
    });
});
// Version Check for POS updates
app.get('/api/version', (req, res) => {
    const latestVersion = process.env.APP_VERSION || '1.0.0';
    const updateUrl = process.env.UPDATE_SERVER_URL || '';
    res.json({
        current: latestVersion,
        latest: latestVersion,
        updateUrl,
        mustUpdate: false
    });
});
// API Routes
app.use('/api/auth', auth_1.authRouter);
app.use('/api/stores', store_1.storeRouter);
app.use('/api/categories', category_1.categoryRouter);
app.use('/api/products', product_1.productRouter);
app.use('/api/orders', order_1.orderRouter);
app.use('/api/inventory', inventory_1.inventoryRouter);
app.use('/api/staff', staff_1.staffRouter);
app.use('/api/members', member_1.memberRouter);
app.use('/api/config', config_1.configRouter);
app.use('/api/receipt-templates', receiptTemplate_1.receiptTemplateRouter);
app.use('/api/pos-action-logs', posActionLog_1.posActionLogRouter);
app.use('/api/reports', report_1.reportRouter);
app.use('/api/suppliers', supplier_1.supplierRouter);
app.use('/api/purchase-orders', purchaseOrder_1.purchaseOrderRouter);
app.use('/api/marketing', marketing_1.marketingRouter);
app.use('/api/finance', finance_1.financeRouter);
app.use('/api/finance/accounts', financeAccount_1.financeAccountRouter);
app.use('/api/finance/assets', financeAsset_1.financeAssetRouter);
app.use('/api/finance/budgets', financeBudget_1.financeBudgetRouter);
app.use('/api/finance/reports', financeReport_1.financeReportRouter);
app.use('/api/staff-management', staffManagement_1.staffManagementRouter);
app.use('/api/staff-salary', staffSalary_1.staffSalaryRouter);
app.use('/api/staff-points', staffPoint_1.staffPointRouter);
app.use('/api/deposit', deposit_1.depositRouter);
app.use('/api/attendance-rules', attendanceRule_1.attendanceRuleRouter);
app.use('/api/attendance-qr', attendanceQR_1.attendanceQRRouter);
app.use('/api/training', training_1.trainingRouter);
app.use('/api/staff-correction', staffCorrection_1.staffCorrectionRouter);
app.use('/api/shift-swap', staffCorrection_1.staffCorrectionRouter);
app.use('/api/overtime', staffCorrection_1.staffCorrectionRouter);
app.use('/api/shifts', shift_1.shiftRouter);
app.use('/api/product-analysis', productAnalysis_1.productAnalysisRouter);
app.use('/api/leave', leave_1.leaveRouter);
app.use('/api/reimbursement', reimbursement_1.reimbursementRouter);
app.use('/api/leave-types', leaveType_1.leaveTypeRouter);
app.use('/api/reimbursement-types', reimbursementType_1.reimbursementTypeRouter);
app.use('/api/upload', upload_1.uploadRouter);
app.use('/api/addons', addon_1.addonRouter);
app.use('/api/inventory-counts', inventoryCount_1.inventoryCountRouter);
app.use('/api/process-recipes', processRecipe_1.processRecipeRouter);
app.use('/api/expenses', expense_1.expenseRouter);
app.use('/api/pos-cash', posCash_1.posCashRouter);
app.use('/api/hygiene', hygiene_1.hygieneRouter);
app.use('/api/bom', bom_1.bomRouter);
app.use('/api/material', material_1.materialRouter);
app.use('/api/salaries', salary_1.salaryRouter);
app.use('/api/channels', channel_1.channelRouter);
app.use('/api/product-price', productPrice_1.productPriceRouter);
app.use('/api/marketing/referrals', referral_1.referralRouter);
app.use('/api/marketing/campaign-categories', campaignCategory_1.campaignCategoryRouter);
app.use('/api/marketing/tier-benefits', tierBenefit_1.tierBenefitRouter);
app.use('/api/marketing/points-expiry-rules', pointsExpiry_1.pointsExpiryRouter);
app.use('/api/marketing/channels', marketingChannel_1.marketingChannelRouter);
app.use('/api/marketing/analytics', marketingAnalytics_1.marketingAnalyticsRouter);
app.use('/api/notifications', notification_1.notificationRouter);
app.use('/api/messages', message_1.messageRouter);
app.use('/api/points-rules', pointsRule_1.pointsRuleRouter);
app.use('/api/rewards', rewardCatalog_1.rewardCatalogRouter);
app.use('/api/revenue', revenue_1.revenueRouter);
app.use('/api/payments', payment_1.default);
app.use('/api/announcement', announcement_1.default);
app.use('/api/hardware', hardware_1.hardwareRouter);
app.use('/api/sync', sync_1.default);
// Error Handling
app.use(notFound_1.notFoundHandler);
app.use(errorHandler_1.errorHandler);
// Start Server with Socket.IO
httpServer.listen(env_1.config.port, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🧋 Bubble Tea SaaS POS API Server                       ║
║                                                           ║
║   Environment: ${env_1.config.nodeEnv.padEnd(40)}║
║   Port: ${String(env_1.config.port).padEnd(50)}║
║   Database: SQLite (${env_1.config.databaseUrl.includes('file') ? 'local' : 'production'})                              ║
║   Socket.IO: Enabled                                      ║
║                                                           ║
║   New Endpoints:                                          ║
║   • /api/suppliers      - Supplier Management           ║
║   • /api/purchase-orders - Purchase Orders               ║
║   • /api/marketing      - Marketing Automation           ║
║   • /api/finance       - Financial Reports               ║
║   • /api/staff-management - HR & Payroll                ║
║   • /api/product-analysis - Product Analytics           ║
║   • /api/leave - Leave Management             ║
║   • /api/reimbursement  - Reimbursement                 ║
║   • /api/hygiene       - Hygiene Management           ║
╚═══════════════════════════════════════════════════════════╝
  `);
    // 启动卫生任务调度器
    (0, SchedulerService_1.startHygieneScheduler)();
    // 启动营销自动化调度器
    (0, MarketingSchedulerService_1.startMarketingScheduler)();
});
exports.default = app;
//# sourceMappingURL=index.js.map