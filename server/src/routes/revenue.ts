import { revenueQueryOptions, revenueQuery,revenueQuerySchema, RevenueQueryError,canReadRevenueRefunds } from '../services/RevenueQueryService'
import { loadStoreDateSettings } from '../utils/storeDateSettings'
import prisma from '../config/database'
import { getHandoverReceipts } from '../services/ShiftManualReceipts'
import { Router } from 'express'
import {describeNativeQuery} from '../utils/validation'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import * as RevenueService from '../services/RevenueService'
import { RevenueDateError, revenuePeriodRange, revenueDailyRange, revenueComparisonRange } from '../utils/revenueDateRange'

const router = Router()
const canQueryRefunds = (req: AuthRequest) => canReadRevenueRefunds(req.user!)
const queryHandler = (endpoint:'query-options'|'query') => async (req:AuthRequest,res:import('express').Response,next:import('express').NextFunction) => {
 try {
  if (!req.user!.storeId) return res.status(400).json({code:400,message:'STORE_REQUIRED'})
  if(req.query.storeId && req.query.storeId !== req.user!.storeId) return res.status(403).json({code:403,message:'STORE_MISMATCH'})
  const data=await prisma.$transaction(async (tx):Promise<unknown>=>endpoint==='query-options'?revenueQueryOptions(tx,req.user!.storeId,canQueryRefunds(req)):revenueQuery(tx,req.user!.storeId,req.query,canQueryRefunds(req)),{timeout:30000})
  res.json({code:200,data})
 } catch(error) {if(error instanceof RevenueQueryError || error instanceof RevenueDateError)return res.status(error instanceof RevenueQueryError?error.status:400).json({code:400,message:error.message});next(error)}
}
router.get('/query-options', authenticate, authorize('admin','manager'), queryHandler('query-options'))
router.get('/query', authenticate, authorize('admin','manager'), describeNativeQuery(revenueQuerySchema.describe('Native financial report with complete date/metric filters. period: today/yesterday/week/month/custom; custom requires inclusive startDate/endDate. dataset: net (net receipt income), orders, grossProfit, expense, drawer, manual:cash, manual:qris, payment:<method>, channel:<id>, expense:<category>. Use query-options only for custom channel/payment/category IDs. Do not infer bank deposits from sales.')), queryHandler('query'))

router.get('/handover-receipts', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res, next) => {
  try { const settings=await loadStoreDateSettings(prisma,req.user!.storeId); const {start,end} = revenuePeriodRange(req.query,new Date(),'today',settings.timezone); res.json({code:200,data:await getHandoverReceipts(prisma,req.user!.storeId,start,end,settings.timezone)}) }
  catch (error) { if (error instanceof RevenueDateError) return res.status(400).json({code:400,message:error.message}); next(error) }
})

router.get('/purchase-hours', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const settings=await loadStoreDateSettings(prisma,req.user!.storeId)
    const { start, end } = revenuePeriodRange(req.query,new Date(),'today',settings.timezone)
    const filters={paymentMethod:typeof req.query.paymentMethod==='string'?req.query.paymentMethod:undefined,channelId:typeof req.query.channelId==='string'?req.query.channelId:undefined}
    if(filters.paymentMethod || filters.channelId){const options=await revenueQueryOptions(prisma,req.user!.storeId,canQueryRefunds(req));if(filters.paymentMethod&&!options.payments.includes(filters.paymentMethod)||filters.channelId&&!options.channels.some(c=>c.id===filters.channelId))return res.status(400).json({code:400,message:'INVALID_QUERY_FILTER'})}
    res.json({ code: 200, data: await RevenueService.getPurchaseHours(req.user!.storeId, start, end,settings.timezone,filters) })
  } catch (error) {
    if (error instanceof RevenueDateError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Get purchase hours error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get purchase analysis' })
  }
})

router.get('/by-channel', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const settings=await loadStoreDateSettings(prisma,req.user!.storeId)
    const {start,end} = revenuePeriodRange(req.query,new Date(),'today',settings.timezone)
    const data = await RevenueService.getRevenueByChannel(req.user!.storeId,start,end,settings.timezone)
    res.json({code:200,data})
  } catch (error: unknown) {
    if (error instanceof RevenueDateError) {res.status(400).json({code:400,message:error.message});return}
    console.error('Get revenue by channel error:',error)
    res.status(500).json({code:500,message:'Failed to get revenue'})
  }
})

router.get('/summary', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const settings=await loadStoreDateSettings(prisma,req.user!.storeId)
    const range = revenuePeriodRange(req.query,new Date(),'month',settings.timezone)
    const previous = revenueComparisonRange(req.query.period,range,settings.timezone)
    const comparison = await RevenueService.compareRevenue(req.user!.storeId,range.start,range.end,previous.start,previous.end,settings.timezone)
    res.json({code:200,data:{...comparison,comparisonRange:{startDate:previous.start.toISOString(),endDate:previous.end.toISOString(),adjusted:previous.adjusted}}})
  } catch (error: unknown) {
    if (error instanceof RevenueDateError) {res.status(400).json({code:400,message:error.message});return}
    console.error('Get revenue summary error:',error)
    res.status(500).json({code:500,message:'Failed to get revenue summary'})
  }
})

router.get('/daily', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const settings=await loadStoreDateSettings(prisma,req.user!.storeId)
    const {start,end} = revenueDailyRange(req.query,new Date(),settings.timezone)
    const daily = await RevenueService.getDailyRevenue(req.user!.storeId,start,end,settings.timezone)
    res.json({code:200,data:daily})
  } catch (error: unknown) {
    if (error instanceof RevenueDateError) {res.status(400).json({code:400,message:error.message});return}
    console.error('Get daily revenue error:',error)
    res.status(500).json({code:500,message:'Failed to get daily revenue'})
  }
})

export {router as revenueRouter}
