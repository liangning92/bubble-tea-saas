import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import http from 'http'
import path from 'path'
import { config } from './config/env'
import { authRouter } from './routes/auth'
import { storeRouter } from './routes/store'
import { productRouter } from './routes/product'
import { orderRouter } from './routes/order'
import { inventoryRouter } from './routes/inventory'
import { staffRouter } from './routes/staff'
import { memberRouter } from './routes/member'
import { categoryRouter } from './routes/category'
import { configRouter } from './routes/config'
import { receiptTemplateRouter } from './routes/receiptTemplate'
import { posActionLogRouter } from './routes/posActionLog'
import { reportRouter } from './routes/report'
import { supplierRouter } from './routes/supplier'
import { purchaseOrderRouter } from './routes/purchaseOrder'
import { marketingRouter } from './routes/marketing'
import { financeRouter } from './routes/finance'
import { financeAccountRouter } from './routes/financeAccount'
import { financeAssetRouter } from './routes/financeAsset'
import { financeBudgetRouter } from './routes/financeBudget'
import { financeReportRouter } from './routes/financeReport'
import { staffManagementRouter } from './routes/staffManagement'
import { staffSalaryRouter } from './routes/staffSalary'
import { staffPointRouter } from './routes/staffPoint'
import { depositRouter } from './routes/deposit'
import { attendanceRuleRouter } from './routes/attendanceRule'
import { attendanceQRRouter } from './routes/attendanceQR'
import { trainingRouter } from './routes/training'
import { staffCorrectionRouter } from './routes/staffCorrection'
import { shiftRouter } from './routes/shift'
import { productAnalysisRouter } from './routes/productAnalysis'
import { leaveRouter } from './routes/leave'
import { reimbursementRouter } from './routes/reimbursement'
import { leaveTypeRouter } from './routes/leaveType'
import { reimbursementTypeRouter } from './routes/reimbursementType'
import { uploadRouter } from './routes/upload'
import { addonRouter } from './routes/addon'
import { inventoryCountRouter } from './routes/inventoryCount'
import { processRecipeRouter } from './routes/processRecipe'
import { channelRouter } from './routes/channel'
import { productPriceRouter } from './routes/productPrice'
import { expenseRouter } from './routes/expense'
import { salaryRouter } from './routes/salary'
import { hygieneRouter } from './routes/hygiene'
import { bomRouter } from './routes/bom'
import { materialRouter } from './routes/material'
import { referralRouter } from './routes/referral'
import { tierBenefitRouter } from './routes/tierBenefit'
import { pointsExpiryRouter } from './routes/pointsExpiry'
import { pointsRuleRouter } from './routes/pointsRule'
import { rewardCatalogRouter } from './routes/rewardCatalog'
import { marketingChannelRouter } from './routes/marketingChannel'
import { marketingAnalyticsRouter } from './routes/marketingAnalytics'
import { notificationRouter } from './routes/notification'
import { messageRouter } from './routes/message'
import { posCashRouter } from './routes/posCash'
import { revenueRouter } from './routes/revenue'
import { default as paymentRouter } from './routes/payment'
import { default as announcementRouter } from './routes/announcement'
import { campaignCategoryRouter } from './routes/campaignCategory'
import { hardwareRouter } from './routes/hardware'
import syncRouter from './routes/sync'
import { startHygieneScheduler } from './services/SchedulerService'
import { startMarketingScheduler } from './services/MarketingSchedulerService'
import { errorHandler } from './middlewares/errorHandler'
import { notFoundHandler } from './middlewares/notFound'
import { socketManager } from './socket'

const app = express()
const httpServer = http.createServer(app)

// Socket.IO Setup
socketManager.initialize(httpServer)

// ============================================================
// Global Error Handlers (must be before any async operations)
// ============================================================

// Unhandled Promise rejection → crash with details instead of silent death
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  const message = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error ? reason.stack : undefined
  console.error('[Server] FATAL: Unhandled Promise Rejection:')
  console.error('[Server] Reason:', message)
  if (stack) {
    console.error('[Server] Stack:', stack)
  }
  console.error('[Server] Promise:', promise)
  // Give logs time to flush before exiting
  setTimeout(() => process.exit(1), 1000)
})

// Uncaught exception → crash with details
process.on('uncaughtException', (err: Error) => {
  console.error('[Server] FATAL: Uncaught Exception:')
  console.error('[Server] Message:', err.message)
  console.error('[Server] Stack:', err.stack)
  setTimeout(() => process.exit(1), 1000)
})

// HTTP Server error handler (e.g. EADDRINUSE)
httpServer.on('error', (err: NodeJS.ErrnoException) => {
  console.error('[Server] HTTP server error:', err.message)
  if (err.code === 'EADDRINUSE') {
    console.error(`[Server] Port ${config.port} is already in use. Please close other applications using this port.`)
  } else if (err.code === 'EACCES') {
    console.error(`[Server] Port ${config.port} requires elevated permissions.`)
  }
  process.exit(1)
})

// Security & Logging Middlewares
app.use(helmet())
app.use(cors({
  origin: config.corsOrigin.split(','),
  credentials: true
}))
app.use(morgan('dev'))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Serve uploaded files
// UPLOADS_PATH: set by Electron main process when forking this server
// In asar: app.asar.unpacked/server/uploads (via extraResources)
// In dev: project root/server/uploads (fallback)
const uploadsPath = process.env.UPLOADS_PATH || path.join(__dirname, '../uploads')
app.use('/uploads', express.static(uploadsPath))

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'bubble-tea-api',
    version: '2.0.0'
  })
})

// POS Health Check (same as /health, at /api/health for POS client compatibility)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'bubble-tea-api',
    version: '2.0.0'
  })
})

// Version Check for POS updates
app.get('/api/version', (req, res) => {
  const latestVersion = process.env.APP_VERSION || '1.0.0'
  const updateUrl = process.env.UPDATE_SERVER_URL || ''
  res.json({
    current: latestVersion,
    latest: latestVersion,
    updateUrl,
    mustUpdate: false
  })
})

// API Routes
app.use('/api/auth', authRouter)
app.use('/api/stores', storeRouter)
app.use('/api/categories', categoryRouter)
app.use('/api/products', productRouter)
app.use('/api/orders', orderRouter)
app.use('/api/inventory', inventoryRouter)
app.use('/api/staff', staffRouter)
app.use('/api/members', memberRouter)
app.use('/api/config', configRouter)
app.use('/api/receipt-templates', receiptTemplateRouter)
app.use('/api/pos-action-logs', posActionLogRouter)
app.use('/api/reports', reportRouter)
app.use('/api/suppliers', supplierRouter)
app.use('/api/purchase-orders', purchaseOrderRouter)
app.use('/api/marketing', marketingRouter)
app.use('/api/finance', financeRouter)
app.use('/api/finance/accounts', financeAccountRouter)
app.use('/api/finance/assets', financeAssetRouter)
app.use('/api/finance/budgets', financeBudgetRouter)
app.use('/api/finance/reports', financeReportRouter)
app.use('/api/staff-management', staffManagementRouter)
app.use('/api/staff-salary', staffSalaryRouter)
app.use('/api/staff-points', staffPointRouter)
app.use('/api/deposit', depositRouter)
app.use('/api/attendance-rules', attendanceRuleRouter)
app.use('/api/attendance-qr', attendanceQRRouter)
app.use('/api/training', trainingRouter)
app.use('/api/staff-correction', staffCorrectionRouter)
app.use('/api/shift-swap', staffCorrectionRouter)
app.use('/api/overtime', staffCorrectionRouter)
app.use('/api/shifts', shiftRouter)
app.use('/api/product-analysis', productAnalysisRouter)
app.use('/api/leave', leaveRouter)
app.use('/api/reimbursement', reimbursementRouter)
app.use('/api/leave-types', leaveTypeRouter)
app.use('/api/reimbursement-types', reimbursementTypeRouter)
app.use('/api/upload', uploadRouter)
app.use('/api/addons', addonRouter)
app.use('/api/inventory-counts', inventoryCountRouter)
app.use('/api/process-recipes', processRecipeRouter)
app.use('/api/expenses', expenseRouter)
app.use('/api/pos-cash', posCashRouter)
app.use('/api/hygiene', hygieneRouter)
app.use('/api/bom', bomRouter)
app.use('/api/material', materialRouter)
app.use('/api/salaries', salaryRouter)
app.use('/api/channels', channelRouter)
app.use('/api/product-price', productPriceRouter)
app.use('/api/marketing/referrals', referralRouter)
app.use('/api/marketing/campaign-categories', campaignCategoryRouter)
app.use('/api/marketing/tier-benefits', tierBenefitRouter)
app.use('/api/marketing/points-expiry-rules', pointsExpiryRouter)
app.use('/api/marketing/channels', marketingChannelRouter)
app.use('/api/marketing/analytics', marketingAnalyticsRouter)
app.use('/api/notifications', notificationRouter)
app.use('/api/messages', messageRouter)
app.use('/api/points-rules', pointsRuleRouter)
app.use('/api/rewards', rewardCatalogRouter)
app.use('/api/revenue', revenueRouter)
app.use('/api/payments', paymentRouter)
app.use('/api/announcement', announcementRouter)
app.use('/api/hardware', hardwareRouter)
app.use('/api/sync', syncRouter)

// Error Handling
app.use(notFoundHandler)
app.use(errorHandler)

// Start Server with Socket.IO
httpServer.listen(config.port, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🧋 Bubble Tea SaaS POS API Server                       ║
║                                                           ║
║   Environment: ${config.nodeEnv.padEnd(40)}║
║   Port: ${String(config.port).padEnd(50)}║
║   Database: SQLite (${config.databaseUrl.includes('file') ? 'local' : 'production'})                              ║
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
  `)

  // 启动卫生任务调度器
  startHygieneScheduler()

  // 启动营销自动化调度器
  startMarketingScheduler()
})

export default app