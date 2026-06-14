import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { validateBody } from '../utils/validation'
import prisma from '../config/database'
import {
  getAllMarketingChannelsWithStats,
  getMarketingChannelWithStats,
  getMembersByChannel,
  getChannelAttributionReport
} from '../services/MarketingChannelService'

const router = Router()

const createChannelSchema = z.object({
  storeId: z.string(),
  name: z.string().min(1),
  code: z.string().min(2),
  type: z.enum(['delivery_platform', 'offline', 'online', 'call', 'corporate']),
  commission: z.number().optional().default(0),
  status: z.string().optional().default('active'),
  sortOrder: z.number().int().optional().default(0)
})

const updateChannelSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(2).optional(),
  type: z.enum(['delivery_platform', 'offline', 'online', 'call', 'corporate']).optional(),
  commission: z.number().optional(),
  status: z.string().optional(),
  sortOrder: z.number().int().optional()
})

// GET /api/marketing/channels
router.get('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const dateRange = req.query.startDate && req.query.endDate ? {
      startDate: new Date(req.query.startDate as string),
      endDate: new Date(req.query.endDate as string)
    } : undefined

    // Get channels with statistics
    const channels = await getAllMarketingChannelsWithStats(storeId, dateRange)

    res.json({
      code: 200,
      data: { list: channels },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get marketing channels error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get marketing channels' })
  }
})

// GET /api/marketing/channels/:id
router.get('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const dateRange = req.query.startDate && req.query.endDate ? {
      startDate: new Date(req.query.startDate as string),
      endDate: new Date(req.query.endDate as string)
    } : undefined

    const channel = await getMarketingChannelWithStats(req.params.id, dateRange)

    if (!channel) {
      return res.status(404).json({ code: 404, message: 'Channel not found' })
    }

    res.json({
      code: 200,
      data: channel,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get marketing channel error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get marketing channel' })
  }
})

// GET /api/marketing/channels/:id/members
router.get('/:id/members', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { page = '1', pageSize = '50', status } = req.query
    const result = await getMembersByChannel(req.params.id, {
      page: parseInt(page as string),
      pageSize: parseInt(pageSize as string),
      status: status as string
    })

    res.json({
      code: 200,
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get channel members error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get channel members' })
  }
})

// GET /api/marketing/channels/attribution
router.get('/stats/attribution', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const dateRange = req.query.startDate && req.query.endDate ? {
      startDate: new Date(req.query.startDate as string),
      endDate: new Date(req.query.endDate as string)
    } : undefined

    const report = await getChannelAttributionReport(storeId, dateRange)

    res.json({
      code: 200,
      data: report,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get attribution report error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get attribution report' })
  }
})

// POST /api/marketing/channels
router.post('/', authenticate, authorize('admin'), validateBody(createChannelSchema), async (req: AuthRequest, res) => {
  try {
    const channel = await prisma.marketingChannel.create({
      data: {
        storeId: req.body.storeId,
        name: req.body.name,
        code: req.body.code,
        type: req.body.type,
        commission: req.body.commission || 0,
        status: req.body.status || 'active',
        sortOrder: req.body.sortOrder || 0
      }
    })

    res.status(201).json({
      code: 201,
      message: 'Marketing channel created',
      data: channel,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Create marketing channel error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create marketing channel' })
  }
})

// PUT /api/marketing/channels/:id
router.put('/:id', authenticate, authorize('admin'), validateBody(updateChannelSchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const updateData: any = {}

    // Only update provided fields
    if (req.body.name !== undefined) updateData.name = req.body.name
    if (req.body.code !== undefined) updateData.code = req.body.code
    if (req.body.type !== undefined) updateData.type = req.body.type
    if (req.body.commission !== undefined) {
      // Validate commission is between 0 and 1 (0% to 100%)
      const commission = parseFloat(req.body.commission)
      if (commission < 0 || commission > 1) {
        return res.status(400).json({ code: 400, message: 'Commission must be between 0 and 1 (0% to 100%)' })
      }
      updateData.commission = commission
    }
    if (req.body.status !== undefined) updateData.status = req.body.status
    if (req.body.sortOrder !== undefined) updateData.sortOrder = req.body.sortOrder

    const channel = await prisma.marketingChannel.update({
      where: { id },
      data: updateData
    })

    res.json({
      code: 200,
      message: 'Marketing channel updated',
      data: channel,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Update marketing channel error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update marketing channel' })
  }
})

// DELETE /api/marketing/channels/:id
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    // Check if channel has associated members
    const memberCount = await prisma.memberChannel.count({
      where: { channelId: req.params.id }
    })

    if (memberCount > 0) {
      return res.status(400).json({
        code: 400,
        message: `Cannot delete channel with ${memberCount} associated members. Please reassign members first.`
      })
    }

    await prisma.marketingChannel.delete({
      where: { id: req.params.id }
    })

    res.json({
      code: 200,
      message: 'Marketing channel deleted',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Delete marketing channel error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete marketing channel' })
  }
})

export { router as marketingChannelRouter }