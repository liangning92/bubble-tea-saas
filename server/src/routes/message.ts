import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { z } from 'zod'
import {
  getMessageChannels,
  createMessageChannel,
  updateMessageChannel,
  deleteMessageChannel,
  getMessageTemplates,
  createMessageTemplate,
  updateMessageTemplate,
  deleteMessageTemplate,
  getMessageLogs,
  getMessageStats,
  getAvailableVariables,
  sendMessageToMember,
  broadcastMessage,
  createDefaultTemplates
} from '../services/MessageService'

const router = Router()

// Validation schemas
const channelCreateSchema = z.object({
  type: z.enum(['sms', 'whatsapp', 'push', 'email']),
  name: z.string().min(1),
  provider: z.string().min(1),
  config: z.record(z.string()),
  enabled: z.boolean().optional(),
  priority: z.number().optional(),
  costPerSms: z.number().optional(),
  dailyLimit: z.number().optional(),
  monthlyLimit: z.number().optional(),
  isDefault: z.boolean().optional()
})

const templateCreateSchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  channel: z.enum(['sms', 'whatsapp', 'push', 'all']),
  subject: z.string().optional(),
  body: z.string().min(1),
  variables: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().optional()
})

// ============================================
// Channel Routes
// ============================================

// GET /api/messages/channels - Get all channels
router.get('/channels', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const channels = await getMessageChannels(storeId)
    res.json({ code: 200, data: { list: channels }, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get channels error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get channels' })
  }
})

// POST /api/messages/channels - Create channel
router.post('/channels', authenticate, authorize('admin'), validateBody(channelCreateSchema), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const channel = await createMessageChannel({ ...req.body, storeId })
    res.status(201).json({ code: 201, message: 'Channel created', data: channel, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Create channel error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create channel' })
  }
})

// PUT /api/messages/channels/:id - Update channel
router.put('/channels/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const channel = await updateMessageChannel(id, req.body)
    res.json({ code: 200, message: 'Channel updated', data: channel, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Update channel error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update channel' })
  }
})

// DELETE /api/messages/channels/:id - Delete channel
router.delete('/channels/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    await deleteMessageChannel(id)
    res.json({ code: 200, message: 'Channel deleted', timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Delete channel error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete channel' })
  }
})

// ============================================
// Template Routes
// ============================================

// GET /api/messages/templates - Get all templates
router.get('/templates', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { type } = req.query
    const templates = await getMessageTemplates(storeId, type as string | undefined)
    res.json({ code: 200, data: { list: templates }, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get templates error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get templates' })
  }
})

// POST /api/messages/templates - Create template
router.post('/templates', authenticate, authorize('admin'), validateBody(templateCreateSchema), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const template = await createMessageTemplate({ ...req.body, storeId })
    res.status(201).json({ code: 201, message: 'Template created', data: template, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Create template error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create template' })
  }
})

// PUT /api/messages/templates/:id - Update template
router.put('/templates/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const template = await updateMessageTemplate(id, req.body)
    res.json({ code: 200, message: 'Template updated', data: template, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Update template error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update template' })
  }
})

// DELETE /api/messages/templates/:id - Delete template
router.delete('/templates/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    await deleteMessageTemplate(id)
    res.json({ code: 200, message: 'Template deleted', timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Delete template error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete template' })
  }
})

// POST /api/messages/templates/init - Initialize default templates
router.post('/templates/init', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const templates = await createDefaultTemplates(storeId)
    res.json({ code: 200, message: `Created ${templates.length} default templates`, data: { count: templates.length }, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Init templates error:', error)
    res.status(500).json({ code: 500, message: 'Failed to initialize templates' })
  }
})

// GET /api/messages/variables - Get available variables
router.get('/variables', authenticate, async (req: AuthRequest, res) => {
  try {
    const variables = getAvailableVariables()
    res.json({ code: 200, data: { variables }, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get variables error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get variables' })
  }
})

// ============================================
// Log Routes
// ============================================

// GET /api/messages/logs - Get message logs
router.get('/logs', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { memberId, type, channelType, status, startDate, endDate, limit, offset } = req.query

    const result = await getMessageLogs(storeId, {
      memberId: memberId as string,
      type: type as string,
      channelType: channelType as string,
      status: status as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0
    })

    res.json({
      code: 200,
      data: {
        list: result.logs,
        total: result.total,
        pagination: {
          limit: limit ? Number(limit) : 50,
          offset: offset ? Number(offset) : 0,
          total: result.total
        }
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get logs error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get logs' })
  }
})

// GET /api/messages/stats - Get message statistics
router.get('/stats', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const stats = await getMessageStats(storeId)
    res.json({ code: 200, data: stats, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get stats error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get stats' })
  }
})

// ============================================
// Send Message Routes
// ============================================

// POST /api/messages/send - Send message to member
router.post('/send', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { memberId, type, channelType, templateId, customBody } = req.body

    if (!memberId) {
      return res.status(400).json({ code: 400, message: 'memberId is required' })
    }

    const result = await sendMessageToMember(
      storeId,
      memberId,
      type || 'custom',
      channelType || 'sms',
      templateId,
      customBody
    )

    if (result.success) {
      res.json({ code: 200, message: 'Message sent', data: { messageId: result.messageId }, timestamp: new Date().toISOString() })
    } else {
      res.status(400).json({ code: 400, message: result.error || 'Failed to send message' })
    }
  } catch (error) {
    console.error('Send message error:', error)
    res.status(500).json({ code: 500, message: 'Failed to send message' })
  }
})

// POST /api/messages/broadcast - Broadcast message to multiple members
router.post('/broadcast', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { memberIds, type, channelType, templateId, customBody } = req.body

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ code: 400, message: 'memberIds array is required' })
    }

    const result = await broadcastMessage(
      storeId,
      memberIds,
      type || 'custom',
      channelType || 'sms',
      templateId,
      customBody
    )

    res.json({
      code: 200,
      message: `Sent ${result.success} messages, ${result.failed} failed`,
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Broadcast error:', error)
    res.status(500).json({ code: 500, message: 'Failed to broadcast message' })
  }
})

export { router as messageRouter }

// Helper function for body validation
function validateBody(schema: z.ZodSchema) {
  return (req: AuthRequest, res: any, next: any) => {
    try {
      req.body = schema.parse(req.body)
      next()
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          code: 400,
          message: 'Validation failed',
          errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        })
      } else {
        next(error)
      }
    }
  }
}
