import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import * as FinanceService from '../services/FinanceService'
import * as ProductManagementService from '../services/ProductManagementService'
import { prisma } from '../config/database'
import { loadShiftReview, ShiftReviewInputError } from '../services/ShiftReviewService'

const router = Router()

router.get('/shift-sessions', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    if (!req.user!.storeId) return res.status(400).json({ code: 400, message: 'STORE_REQUIRED' })
    const data = await prisma.$transaction(tx => loadShiftReview(tx, req.user!.storeId, req.query.startDate, req.query.endDate))
    return res.json({ code: 200, data })
  } catch (error) {
    if (error instanceof ShiftReviewInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Shift review error:', error)
    return res.status(500).json({ code: 500, message: 'SHIFT_REVIEW_FAILED' })
  }
})

function parseReportDate(value: unknown, fallback: Date, endOfDay = false): Date {
  const dayOnly = value && /^\d{4}-\d{2}-\d{2}$/.test(String(value))
  const date = dayOnly ? new Date(String(value)+(endOfDay?'T23:59:59.999+07:00':'T00:00:00+07:00')) : value ? new Date(String(value)) : fallback
  return date
}

// ==================== REVENUE ====================

// GET /api/finance/revenue
router.get('/revenue', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { startDate, endDate } = req.query

    const result = await FinanceService.getRevenueSummary(
      storeId,
      parseReportDate(startDate, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
      parseReportDate(endDate, new Date(), true)
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
      parseReportDate(startDate, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
      parseReportDate(endDate, new Date(), true)
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

function parseYearMonth(queryMonth?: string, queryYear?: string): { year: number; month: number } {
  const now = new Date()
  let year = parseInt(queryYear as string) || now.getFullYear()
  let month = now.getMonth() + 1

  if (queryMonth) {
    if (queryMonth.includes('-')) {
      const parts = queryMonth.split('-').map(Number)
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        // e.g. "2026-10" or accidental double-concat "2026-2026-10"
        if (parts.length === 3) {
          year = parts[0]
          month = parts[2]
        } else {
          year = parts[0]
          month = parts[1]
        }
      }
    } else {
      const parsedMonth = parseInt(queryMonth)
      if (!isNaN(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12) {
        month = parsedMonth
      }
    }
  }

  return { year, month }
}

// ==================== INCOME STATEMENT ====================

// GET /api/finance/income-statement
router.get('/income-statement', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { year, month } = parseYearMonth(req.query.month as string, req.query.year as string)
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

// GET /api/finance/balance-sheet
router.get('/balance-sheet', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { year, month } = parseYearMonth(req.query.month as string, req.query.year as string)
    const result = await FinanceService.getBalanceSheet(storeId, month, year)
    res.json({ code: 200, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get balance sheet error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get balance sheet' })
  }
})

// GET /api/finance/tax
router.get('/tax', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { year, month } = parseYearMonth(req.query.month as string, req.query.year as string)

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
      parseReportDate(startDate, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
      parseReportDate(endDate, new Date(), true)
    )

    res.json({
      code: 200,
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'RECEIPT_NET_INCOME_UNVERIFIED') return res.status(409).json({code:409,message:error.message,explanation:'Net income is unverified for this report range because included receipt copies lack refund evidence.'})
    console.error('Get cash flow error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get cash flow' })
  }
})

// ==================== GOAL TRACKING ====================

// GET /api/finance/goal
router.get('/goal', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { year, month } = parseYearMonth(req.query.month as string, req.query.year as string)
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
