import { Router } from 'express'
import { z } from 'zod'
import prisma from '../config/database'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { validateBody } from '../utils/validation'
import { getStaffConfig, saveStaffConfig, DEFAULT_STAFF_CONFIG } from '../services/StaffConfigService'

const router = Router()

const configSchema = z.object({
  storeId: z.string(),
  key: z.string(),
  value: z.any(),
  category: z.enum(['pos', 'inventory', 'staff', 'member', 'notification', 'payment', 'store', 'marketing', 'finance', 'hygiene'])
})

// GET /api/config
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId, category } = req.query

    const where: any = {}
    if (storeId) where.storeId = storeId as string
    if (category) where.category = category as string

    const configs = await prisma.config.findMany({
      where,
      orderBy: { key: 'asc' }
    })

    // Transform to key-value object
    const result: Record<string, any> = {}
    configs.forEach(c => {
      try {
        result[c.key] = JSON.parse(c.value)
      } catch {
        result[c.key] = c.value
      }
    })

    res.json({
      code: 200,
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get configs error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get configs' })
  }
})

// ==================== STAFF FEATURE CONFIG ====================
// NOTE: These routes MUST be before /:storeId/:key to avoid being matched by that pattern

// GET /api/config/staff/features
router.get('/staff/features', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const config = await getStaffConfig(storeId)

    res.json({
      code: 200,
      data: config,
      defaults: DEFAULT_STAFF_CONFIG,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get staff features error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get staff features' })
  }
})

// PUT /api/config/staff/features
router.put('/staff/features', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const features = req.body

    const config = await saveStaffConfig(storeId, features)

    res.json({
      code: 200,
      message: 'Staff features updated',
      data: config,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Save staff features error:', error)
    res.status(500).json({ code: 500, message: 'Failed to save staff features' })
  }
})

// GET /api/config/:storeId/:key
router.get('/:storeId/:key', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId, key } = req.params

    const config = await prisma.config.findUnique({
      where: { storeId_key: { storeId, key } }
    })

    if (!config) {
      return res.status(404).json({ code: 404, message: 'Config not found' })
    }

    let value
    try {
      value = JSON.parse(config.value)
    } catch {
      value = config.value
    }

    res.json({
      code: 200,
      data: { key: config.key, value, category: config.category },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get config error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get config' })
  }
})

// POST /api/config
router.post('/', authenticate, authorize('admin', 'manager'), validateBody(configSchema), async (req: AuthRequest, res) => {
  try {
    const { storeId, key, value, category } = req.body

    const valueStr = typeof value === 'string' ? value : JSON.stringify(value)

    const config = await prisma.config.upsert({
      where: { storeId_key: { storeId, key } },
      create: { storeId, key, value: valueStr, category },
      update: { value: valueStr, category }
    })

    res.json({
      code: 200,
      message: 'Config saved',
      data: { key: config.key, category: config.category },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Save config error:', error)
    res.status(500).json({ code: 500, message: 'Failed to save config' })
  }
})

// POST /api/config/batch
router.post('/batch', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { storeId, configs } = req.body // configs: [{key, value, category}]

    await prisma.$transaction(
      configs.map((c: any) =>
        prisma.config.upsert({
          where: { storeId_key: { storeId, key: c.key } },
          create: {
            storeId,
            key: c.key,
            value: typeof c.value === 'string' ? c.value : JSON.stringify(c.value),
            category: c.category
          },
          update: {
            value: typeof c.value === 'string' ? c.value : JSON.stringify(c.value),
            category: c.category
          }
        })
      )
    )

    res.json({
      code: 200,
      message: 'Configs saved',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Batch save configs error:', error)
    res.status(500).json({ code: 500, message: 'Failed to save configs' })
  }
})

// DELETE /api/config/:storeId/:key
router.delete('/:storeId/:key', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { storeId, key } = req.params

    await prisma.config.delete({
      where: { storeId_key: { storeId, key } }
    })

    res.json({
      code: 200,
      message: 'Config deleted',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Delete config error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete config' })
  }
})


// Default configs for POS
const defaultPOSConfigs = {
  'pos.default_payment': 'cash',
  'pos.receipt_header': 'Bubble Tea Shop',
  'pos.receipt_footer': 'Thank you!',
  'pos.offline_mode': true,
  'pos.sync_interval': 60,
  'pos.low_stock_threshold': 20,
  'pos.tax_rate': 0.11,
  'pos.shift_start': '09:00',
  'pos.shift_end': '21:00',
  'pos.grid_cols': '4',
  'pos.card_size': 'medium',
  'pos.show_category': true,
  'pos.show_price': true,
  'pos.quick_amounts': { enabled: true, amounts: [10000, 20000, 50000] },
  'pos.shift_settings': { requireReconciliation: false, requireSupervisorConfirm: false, showSummary: true, cashDifferenceLimit: 0 },
  'pos.auto_logout': 30,
  'pos.sound_settings': { keypress: { enabled: true, volume: 80 }, orderComplete: { enabled: true, volume: 100 }, error: { enabled: true, volume: 100 }, newOrder: { enabled: true, volume: 100 } },
  'pos_api_url': '' // POS API URL, set by Admin
}

const defaultMemberConfigs = {
  'member.default_level': '普通',
  'member.points_rate': 1,
  'member.points_per': 10000,
  'member.birthday_bonus': 500,
  'member.upgrade_threshold': 500000
}

const defaultPaymentConfigs = {
  'payment.settings': { defaultMethod: 'cash', minAmount: 0, maxCashAmount: 0, changeEnabled: true },
  'payment.methods': { cash: true, qris: true, gopay: true, ovo: true, dana: true, shopeepay: true, debit: false }
}

// GET /api/config/defaults
router.get('/defaults/:category', authenticate, async (req: AuthRequest, res) => {
  try {
    const { category } = req.params

    let defaults: Record<string, any> = {}
    if (category === 'pos') defaults = defaultPOSConfigs
    else if (category === 'member') defaults = defaultMemberConfigs
    else if (category === 'payment') defaults = defaultPaymentConfigs

    res.json({
      code: 200,
      data: defaults,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get default configs error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get default configs' })
  }
})

export { router as configRouter }