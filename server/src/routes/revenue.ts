import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import * as RevenueService from '../services/RevenueService'
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subWeeks, subMonths } from 'date-fns'

const router = Router()

// GET /api/revenue/by-channel?period=today|week|month|custom&startDate=&endDate=
router.get('/by-channel', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { period, startDate, endDate } = req.query

    let start: Date
    let end: Date = endOfDay(new Date())

    if (period === 'today') {
      start = startOfDay(new Date())
      end = endOfDay(new Date())
    } else if (period === 'week') {
      start = startOfWeek(new Date())
      end = endOfWeek(new Date())
    } else if (period === 'month') {
      start = startOfMonth(new Date())
      end = endOfMonth(new Date())
    } else if (period === 'custom' && startDate && endDate) {
      start = startOfDay(new Date(startDate as string))
      end = endOfDay(new Date(endDate as string))
    } else {
      // Default to today
      start = startOfDay(new Date())
      end = endOfDay(new Date())
    }

    const data = await RevenueService.getRevenueByChannel(storeId, start, end)
    res.json({ code: 200, data })
  } catch (error: any) {
    console.error('Get revenue by channel error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get revenue' })
  }
})

// GET /api/revenue/summary?period=today|week|month|custom&startDate=&endDate=
router.get('/summary', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { period, startDate, endDate, comparePeriod } = req.query

    let currentStart: Date
    let currentEnd: Date = endOfDay(new Date())

    if (period === 'today') {
      currentStart = startOfDay(new Date())
      currentEnd = endOfDay(new Date())
    } else if (period === 'week') {
      currentStart = startOfWeek(new Date())
      currentEnd = endOfWeek(new Date())
    } else if (period === 'month') {
      currentStart = startOfMonth(new Date())
      currentEnd = endOfMonth(new Date())
    } else if (period === 'custom' && startDate && endDate) {
      currentStart = startOfDay(new Date(startDate as string))
      currentEnd = endOfDay(new Date(endDate as string))
    } else {
      currentStart = startOfMonth(new Date())
      currentEnd = endOfMonth(new Date())
    }

    // Previous period for comparison
    let previousStart: Date
    let previousEnd: Date

    if (period === 'today') {
      previousStart = startOfDay(subDays(currentStart, 1))
      previousEnd = endOfDay(subDays(currentEnd, 1))
    } else if (period === 'week') {
      previousStart = startOfWeek(subWeeks(currentStart, 1))
      previousEnd = endOfWeek(subWeeks(currentEnd, 1))
    } else if (period === 'month' || !period || period === 'custom') {
      previousStart = subMonths(currentStart, 1)
      previousEnd = subMonths(currentEnd, 1)
    } else {
      previousStart = subMonths(currentStart, 1)
      previousEnd = subMonths(currentEnd, 1)
    }

    const comparison = await RevenueService.compareRevenue(storeId, currentStart, currentEnd, previousStart, previousEnd)
    res.json({ code: 200, data: comparison })
  } catch (error: any) {
    console.error('Get revenue summary error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get revenue summary' })
  }
})

// GET /api/revenue/daily?startDate=&endDate=
router.get('/daily', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { startDate, endDate } = req.query

    const start = startDate ? startOfDay(new Date(startDate as string)) : startOfMonth(new Date())
    const end = endDate ? endOfDay(new Date(endDate as string)) : endOfDay(new Date())

    const daily = await RevenueService.getDailyRevenue(storeId, start, end)
    res.json({ code: 200, data: daily })
  } catch (error: any) {
    console.error('Get daily revenue error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get daily revenue' })
  }
})

export { router as revenueRouter }