import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import * as MarketingAnalyticsService from '../services/MarketingAnalyticsService'

const router = Router()

// GET /api/marketing/analytics/roi
router.get('/roi', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    // Always use user's storeId for security
    const storeId = req.user!.storeId
    const { startDate, endDate } = req.query as any
    const roi = await MarketingAnalyticsService.getMarketingROI(storeId, { startDate, endDate })
    res.json({ code: 200, data: roi, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get marketing ROI error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get marketing ROI' })
  }
})

// GET /api/marketing/analytics/campaigns/:id
router.get('/campaigns/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate } = req.query as any
    const analytics = await MarketingAnalyticsService.getCampaignAnalytics(req.params.id, { startDate, endDate })
    res.json({ code: 200, data: analytics, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get campaign analytics error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get campaign analytics' })
  }
})

// GET /api/marketing/analytics/summary
router.get('/summary', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const summary = await MarketingAnalyticsService.getMarketingSummary(storeId)
    res.json({ code: 200, data: summary, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get marketing summary error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get marketing summary' })
  }
})

export { router as marketingAnalyticsRouter }