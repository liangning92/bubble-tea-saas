import { mediaRouter } from './routes/media'
import {upgradeStaffAccessSqlite} from './utils/staffAccessSqliteUpgrade'
import { declareAccessRoutes } from './middlewares/staffAccessV2'
import { startEmployeeWorker } from './services/EmployeeReminderService'
import { employeeWorkspaceRouter } from './routes/employeeWorkspace'
import { isDisplayPublicRoute } from './utils/displayPublicRoute'
import { legacyActivitiesRouter } from './routes/legacyActivities'
import { activitiesRouter } from './routes/activities'
import { startActivityWorker } from './services/ActivityService'
import { staffPermissionsRouter } from './routes/staffPermissions'
import {startRecurringExpenseScheduler} from './services/RecurringExpenseService'
import {batchImportRouter} from './routes/batchImport'
import {queueRouter} from './routes/queue'
import {serviceHealth} from './services/HealthService'
import prisma from './config/database'
import { upgradeLocalSqlite } from './utils/sqliteUpgrade'
import { aiPermissionsRouter } from './routes/aiPermissions'
// Global BigInt JSON serialization support
(BigInt.prototype as any).toJSON = function () {
  return Number(this)
}

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
import { staffCorrectionRouter, shiftSwapRouter, overtimeRouter } from './routes/staffCorrection'
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
import { authenticate, AuthRequest } from './middlewares/auth'
import { deliveryRouter } from './routes/delivery'

const app = express()
const httpServer = http.createServer(app)

console.log('[Server] Starting initialization...')

// Socket.IO Setup
console.log('[Server] Initializing Socket.IO...')
socketManager.initialize(httpServer)
console.log('[Server] Socket.IO initialized')

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
app.set('trust proxy', 1)
const allowedOrigins = config.corsOrigin.split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
}))
app.use(cors({
  origin: (origin, callback) => {
    // 1. Mobile app, curl, server-to-server (no Origin header)
    if (!origin) return callback(null, true)

    // 2. Electron packaged app (file://, null, app://, vscode-file://)
    if (origin === 'null' || origin === 'file://' || origin.startsWith('file:') || origin.startsWith('app:') || origin.startsWith('vscode-file:')) {
      return callback(null, true)
    }

    // 3. Explicitly allowed web origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    // 4. Local dev servers
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      return callback(null, true)
    }

    callback(null, false)
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Origin', 'Accept', 'X-TV-Display-Token']
}))
app.use(morgan('dev', {
  skip: (_req, res) => process.env.LOCAL_POS_EMBEDDED === '1' && res.statusCode < 400
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Serve uploaded files
// UPLOADS_PATH: set by Electron main process when forking this server
// In asar: app.asar.unpacked/server/uploads (via extraResources)
// In dev: project root/server/uploads (fallback)
const uploadsPath = process.env.UPLOADS_PATH || path.join(__dirname, '../uploads')
// Protect training-only private storage, including percent-encoded path components.
app.use('/uploads', (req, res, next) => {
  try { if (decodeURIComponent(req.path).replace(/\\/g, '/').toLowerCase().split('/').some(part=>['.training-private','.employee-private'].includes(part))) return res.sendStatus(404) }
  catch { return res.sendStatus(400) }
  next()
}, express.static(uploadsPath))

// Readiness checks verify dependencies used by the running service.
app.get(['/health','/api/health'], async (_req,res)=>{
  const health=await serviceHealth()
  res.status(health.status==='ok'?200:503).json(health)
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
app.use('/api/auth', declareAccessRoutes('/api/auth', authRouter))
app.use('/api/queue', declareAccessRoutes('/api/queue', queueRouter))
app.use('/api/import', declareAccessRoutes('/api/import', batchImportRouter))
// Enforce authentication for every API route by default. Only credential entry,
// one-time setup/sync tickets, health checks, and the signed payment webhook are public.
app.use('/api', (req, res, next) => {
  const apiPath = req.originalUrl.split('?')[0].replace(/^\/api(?=\/|$)/, '') || '/'
  const publicPaths = new Set([
    '/auth/login', '/auth/register',
    '/sync/connect', '/sync/full', '/sync/status',
    '/payments/qris/webhook', '/health', '/version'
  ])
  if (publicPaths.has(apiPath) || isDisplayPublicRoute(req.method, apiPath)) return next()
  return authenticate(req as AuthRequest, res, next)
})
app.use('/api/stores', declareAccessRoutes('/api/stores', storeRouter))
app.use('/api/categories', declareAccessRoutes('/api/categories', categoryRouter))
app.use('/api/products', declareAccessRoutes('/api/products', productRouter))
app.use('/api/orders', declareAccessRoutes('/api/orders', orderRouter))
app.use('/api/inventory', declareAccessRoutes('/api/inventory', inventoryRouter))
app.use('/api/staff', declareAccessRoutes('/api/staff', staffRouter))
app.use('/api/members', declareAccessRoutes('/api/members', memberRouter))
app.use('/api/config', declareAccessRoutes('/api/config', configRouter))
app.use('/api/receipt-templates', declareAccessRoutes('/api/receipt-templates', receiptTemplateRouter))
app.use('/api/pos-action-logs', declareAccessRoutes('/api/pos-action-logs', posActionLogRouter))
app.use('/api/reports', declareAccessRoutes('/api/reports', reportRouter))
app.use('/api/suppliers', declareAccessRoutes('/api/suppliers', supplierRouter))
app.use('/api/purchase-orders', declareAccessRoutes('/api/purchase-orders', purchaseOrderRouter))
app.use('/api/marketing/activities', declareAccessRoutes('/api/marketing/activities', activitiesRouter))
app.use('/api/marketing', declareAccessRoutes('/api/marketing', legacyActivitiesRouter))
app.use('/api/marketing', declareAccessRoutes('/api/marketing', marketingRouter))
app.use('/api/finance', declareAccessRoutes('/api/finance', financeRouter))
app.use('/api/finance/accounts', declareAccessRoutes('/api/finance/accounts', financeAccountRouter))
app.use('/api/finance/assets', declareAccessRoutes('/api/finance/assets', financeAssetRouter))
app.use('/api/finance/budgets', declareAccessRoutes('/api/finance/budgets', financeBudgetRouter))
app.use('/api/finance/reports', declareAccessRoutes('/api/finance/reports', financeReportRouter))
app.use('/api/staff-management', declareAccessRoutes('/api/staff-management', staffManagementRouter))
app.use('/api/staff-salary', declareAccessRoutes('/api/staff-salary', staffSalaryRouter))
app.use('/api/staff-points', declareAccessRoutes('/api/staff-points', staffPointRouter))
app.use('/api/deposit', declareAccessRoutes('/api/deposit', depositRouter))
app.use('/api/attendance-rules', declareAccessRoutes('/api/attendance-rules', attendanceRuleRouter))
app.use('/api/attendance-qr', declareAccessRoutes('/api/attendance-qr', attendanceQRRouter))
app.use('/api/training', declareAccessRoutes('/api/training', trainingRouter))
app.use('/api/staff-correction', declareAccessRoutes('/api/staff-correction', staffCorrectionRouter))
app.use('/api/shift-swap', declareAccessRoutes('/api/shift-swap', shiftSwapRouter))
app.use('/api/overtime', declareAccessRoutes('/api/overtime', overtimeRouter))
app.use('/api/shifts', declareAccessRoutes('/api/shifts', shiftRouter))
app.use('/api/product-analysis', declareAccessRoutes('/api/product-analysis', productAnalysisRouter))
app.use('/api/leave', declareAccessRoutes('/api/leave', leaveRouter))
app.use('/api/reimbursement', declareAccessRoutes('/api/reimbursement', reimbursementRouter))
app.use('/api/leave-types', declareAccessRoutes('/api/leave-types', leaveTypeRouter))
app.use('/api/reimbursement-types', declareAccessRoutes('/api/reimbursement-types', reimbursementTypeRouter))
app.use('/api/upload', declareAccessRoutes('/api/upload', uploadRouter))
app.use('/api/media', declareAccessRoutes('/api/media', mediaRouter))
app.use('/api/addons', declareAccessRoutes('/api/addons', addonRouter))
app.use('/api/inventory-counts', declareAccessRoutes('/api/inventory-counts', inventoryCountRouter))
app.use('/api/process-recipes', declareAccessRoutes('/api/process-recipes', processRecipeRouter))
app.use('/api/expenses', declareAccessRoutes('/api/expenses', expenseRouter))
app.use('/api/pos-cash', declareAccessRoutes('/api/pos-cash', posCashRouter))
app.use('/api/hygiene', declareAccessRoutes('/api/hygiene', hygieneRouter))
app.use('/api/bom', declareAccessRoutes('/api/bom', bomRouter))
app.use('/api/material', declareAccessRoutes('/api/material', materialRouter))
app.use('/api/salaries', declareAccessRoutes('/api/salaries', salaryRouter))
app.use('/api/channels', declareAccessRoutes('/api/channels', channelRouter))
app.use('/api/delivery', declareAccessRoutes('/api/delivery', deliveryRouter))
app.use('/api/product-price', declareAccessRoutes('/api/product-price', productPriceRouter))
app.use('/api/marketing/referrals', declareAccessRoutes('/api/marketing/referrals', referralRouter))
app.use('/api/marketing/campaign-categories', declareAccessRoutes('/api/marketing/campaign-categories', campaignCategoryRouter))
app.use('/api/marketing/tier-benefits', declareAccessRoutes('/api/marketing/tier-benefits', tierBenefitRouter))
app.use('/api/marketing/points-expiry-rules', declareAccessRoutes('/api/marketing/points-expiry-rules', pointsExpiryRouter))
app.use('/api/marketing/channels', declareAccessRoutes('/api/marketing/channels', marketingChannelRouter))
app.use('/api/marketing/analytics', declareAccessRoutes('/api/marketing/analytics', marketingAnalyticsRouter))
app.use('/api/notifications', declareAccessRoutes('/api/notifications', notificationRouter))
app.use('/api/messages', declareAccessRoutes('/api/messages', messageRouter))
app.use('/api/points-rules', declareAccessRoutes('/api/points-rules', pointsRuleRouter))
app.use('/api/rewards', declareAccessRoutes('/api/rewards', rewardCatalogRouter))
app.use('/api/revenue', declareAccessRoutes('/api/revenue', revenueRouter))
app.use('/api/payments', declareAccessRoutes('/api/payments', paymentRouter))
app.use('/api/ai', declareAccessRoutes('/api/ai', aiPermissionsRouter))
app.use('/api/staff-work', declareAccessRoutes('/api/staff-work', employeeWorkspaceRouter))
app.use('/api/staff-permissions', declareAccessRoutes('/api/staff-permissions', staffPermissionsRouter))
app.use('/api/announcement', declareAccessRoutes('/api/announcement', announcementRouter))
app.use('/api/hardware', declareAccessRoutes('/api/hardware', hardwareRouter))
app.use('/api/sync', declareAccessRoutes('/api/sync', syncRouter))

// Error Handling
app.use(notFoundHandler)
app.use(errorHandler)

// Start Server with Socket.IO
if (process.env.NODE_ENV !== 'test') {
  upgradeLocalSqlite(prisma, config.databaseUrl).then(() => upgradeStaffAccessSqlite(prisma, config.databaseUrl)).then(() => {
  console.log('[Server] About to listen on port', config.port)
  httpServer.listen(config.port, '0.0.0.0', () => {
  startRecurringExpenseScheduler()
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🧋 YOUME POS API Server                                ║
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
  console.log('[Server] Starting hygiene scheduler...')
  startEmployeeWorker()
  startHygieneScheduler()
  console.log('[Server] Hygiene scheduler started')

  // 启动营销自动化调度器
  console.log('[Server] Starting marketing scheduler...')
  startMarketingScheduler()
  startActivityWorker()
  console.log('[Server] Marketing scheduler started')
  })
  }).catch(async error => {
    console.error('[Schema] Startup blocked; database upgrade failed:', error.message)
    await prisma.$disconnect()
    process.exit(1)
  })
}

export { app }
export default app
