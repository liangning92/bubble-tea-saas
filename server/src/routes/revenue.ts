import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import * as RevenueService from '../services/RevenueService'
import { RevenueDateError, revenuePeriodRange, revenueDailyRange, revenueComparisonRange } from '../utils/revenueDateRange'

const router = Router()

router.get('/purchase-hours', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { start, end } = revenuePeriodRange(req.query)
    res.json({ code: 200, data: await RevenueService.getPurchaseHours(req.user!.storeId, start, end) })
  } catch (error) {
    if (error instanceof RevenueDateError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Get purchase hours error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get purchase analysis' })
  }
})

router.get('/by-channel', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const {start,end} = revenuePeriodRange(req.query)
    const data = await RevenueService.getRevenueByChannel(req.user!.storeId,start,end)
    res.json({code:200,data})
  } catch (error: unknown) {
    if (error instanceof RevenueDateError) {res.status(400).json({code:400,message:error.message});return}
    console.error('Get revenue by channel error:',error)
    res.status(500).json({code:500,message:'Failed to get revenue'})
  }
})

router.get('/summary', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const range = revenuePeriodRange(req.query,new Date(),'month')
    const previous = revenueComparisonRange(req.query.period,range)
    const comparison = await RevenueService.compareRevenue(req.user!.storeId,range.start,range.end,previous.start,previous.end)
    res.json({code:200,data:{...comparison,comparisonRange:{startDate:previous.start.toISOString(),endDate:previous.end.toISOString(),adjusted:previous.adjusted}}})
  } catch (error: unknown) {
    if (error instanceof RevenueDateError) {res.status(400).json({code:400,message:error.message});return}
    console.error('Get revenue summary error:',error)
    res.status(500).json({code:500,message:'Failed to get revenue summary'})
  }
})

router.get('/daily', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const {start,end} = revenueDailyRange(req.query)
    const daily = await RevenueService.getDailyRevenue(req.user!.storeId,start,end)
    res.json({code:200,data:daily})
  } catch (error: unknown) {
    if (error instanceof RevenueDateError) {res.status(400).json({code:400,message:error.message});return}
    console.error('Get daily revenue error:',error)
    res.status(500).json({code:500,message:'Failed to get daily revenue'})
  }
})

export {router as revenueRouter}
