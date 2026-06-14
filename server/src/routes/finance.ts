import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import * as FinanceService from '../services/FinanceService'
import * as ProductManagementService from '../services/ProductManagementService'

const router = Router()

// ==================== REVENUE ====================

// GET /api/finance/revenue
router.get('/revenue', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { startDate, endDate } = req.query

    const result = await FinanceService.getRevenueSummary(
      storeId,
      startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate ? new Date(endDate as string) : new Date()
    )

    res.json({
      code: 200,
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get revenue error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get revenue' })
  }
})

// GET /api/finance/revenue/daily
router.get('/revenue/daily', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const days = parseInt(req.query.days as string) || 30

    const result = await FinanceService.getDailyRevenueTrend(storeId, days)

    res.json({
      code: 200,
      data: { list: result },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get daily revenue error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get daily revenue' })
  }
})

// GET /api/finance/revenue/hourly
router.get('/revenue/hourly', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const date = req.query.date ? new Date(req.query.date as string) : new Date()

    const result = await FinanceService.getHourlyRevenueDistribution(storeId, date)

    res.json({
      code: 200,
      data: { list: result },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get hourly revenue error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get hourly revenue' })
  }
})

// ==================== PROFIT ====================

// GET /api/finance/profit
router.get('/profit', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { startDate, endDate } = req.query

    const result = await FinanceService.getProfitAnalysis(
      storeId,
      startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate ? new Date(endDate as string) : new Date()
    )

    res.json({
      code: 200,
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get profit error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get profit analysis' })
  }
})

// ==================== INCOME STATEMENT ====================

// GET /api/finance/income-statement
router.get('/income-statement', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1
    const year = parseInt(req.query.year as string) || new Date().getFullYear()
    const includeDepreciation = req.query.includeDepreciation === 'true'

    const result = await FinanceService.getIncomeStatement(storeId, month, year, includeDepreciation)

    res.json({
      code: 200,
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get income statement error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get income statement' })
  }
})

// ==================== TAX ====================

// GET /api/finance/tax
router.get('/tax', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1
    const year = parseInt(req.query.year as string) || new Date().getFullYear()

    const result = await FinanceService.getTaxReport(storeId, month, year)

    res.json({
      code: 200,
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get tax report error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get tax report' })
  }
})

// ==================== CASH FLOW ====================

// GET /api/finance/cash-flow
router.get('/cash-flow', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { startDate, endDate } = req.query

    const result = await FinanceService.getCashFlow(
      storeId,
      startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate ? new Date(endDate as string) : new Date()
    )

    res.json({
      code: 200,
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get cash flow error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get cash flow' })
  }
})

// ==================== GOAL TRACKING ====================

// GET /api/finance/goal
router.get('/goal', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1
    const year = parseInt(req.query.year as string) || new Date().getFullYear()
    const targetRevenue = parseInt(req.query.target as string) || 100000000 // Default Rp 100M

    const result = await FinanceService.getGoalTracking(storeId, month, year, targetRevenue)

    res.json({
      code: 200,
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get goal tracking error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get goal tracking' })
  }
})

// ==================== PRODUCT ANALYSIS ====================

// GET /api/finance/product-mix
router.get('/product-mix', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const days = parseInt(req.query.days as string) || 30
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const endDate = new Date()

    const result = await ProductManagementService.getProductMixAnalysis(storeId, startDate, endDate)

    res.json({
      code: 200,
      data: { list: result },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get product mix error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get product mix' })
  }
})

// GET /api/finance/abc-analysis
router.get('/abc-analysis', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const days = parseInt(req.query.days as string) || 30
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const endDate = new Date()

    const result = await ProductManagementService.getABCAnalysis(storeId, startDate, endDate)

    res.json({
      code: 200,
      data: { list: result },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get ABC analysis error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get ABC analysis' })
  }
})

export { router as financeRouter }