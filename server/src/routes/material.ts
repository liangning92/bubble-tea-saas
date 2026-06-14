import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { validateBody } from '../utils/validation'
import { z } from 'zod'
import * as materialService from '../services/MaterialService'

const router = Router()

// 原料类型
router.get('/types', authenticate, async (req: AuthRequest, res) => {
  res.json({
    code: 200,
    data: {
      types: materialService.INVENTORY_TYPES,
      labels: materialService.INVENTORY_TYPE_LABELS,
      categories: materialService.INVENTORY_CATEGORIES
    }
  })
})

// 获取原料列表
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { type } = req.query
    const storeId = req.user!.storeId
    const list = await materialService.getInventoryList(storeId, type as string)
    res.json({ code: 200, data: { list } })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// 获取单个原料详情
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const item = await materialService.getInventoryDetail(req.params.id)
    if (!item) return res.status(404).json({ code: 404, message: 'Not found' })
    res.json({ code: 200, data: item })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// 创建原料
const createSchema = z.object({
  storeId: z.string(),
  name: z.string(),
  category: z.string(),
  type: z.string().optional(),
  unit: z.string(),
  avgCost: z.number().optional(),
  concentrateRatio: z.number().optional(),
  safetyStock: z.number().optional(),
  minStock: z.number().optional(),
  maxStock: z.number().optional(),
  shelfLife: z.number().optional(),
  processRecipeId: z.string().optional()
})

router.post('/', authenticate, authorize('admin', 'manager'), validateBody(createSchema), async (req: AuthRequest, res) => {
  try {
    const item = await materialService.createInventory(req.body)
    res.status(201).json({ code: 201, data: item })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// 更新原料
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const item = await materialService.updateInventory(req.params.id, req.body)
    res.json({ code: 200, data: item })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// 库存预警
router.get('/alerts/low-stock', authenticate, async (req: AuthRequest, res) => {
  try {
    const alerts = await materialService.checkLowStockAlerts(req.user!.storeId)
    res.json({ code: 200, data: alerts })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// 过期预警
router.get('/alerts/expiry', authenticate, async (req: AuthRequest, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string) : 7
    const alerts = await materialService.checkExpiryAlerts(req.user!.storeId, days)
    res.json({ code: 200, data: alerts })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// 补货建议
router.get('/suggestions/restock', authenticate, async (req: AuthRequest, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string) : 7
    const suggestions = await materialService.calculateRestockSuggestions(req.user!.storeId, days)
    res.json({ code: 200, data: suggestions })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// 执行加工
router.post('/process/:recipeId/execute', authenticate, async (req: AuthRequest, res) => {
  try {
    const { multiplier, note } = req.body
    const staffId = req.user!.staffId || ''
    const result = await materialService.executeProcessing(req.params.recipeId, staffId, multiplier, note)
    res.json({ code: 200, data: result })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// 加工历史
router.get('/process/history', authenticate, async (req: AuthRequest, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50
    const history = await materialService.getProcessingHistory(req.user!.storeId, limit)
    res.json({ code: 200, data: history })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// 加工日志详情
router.get('/process/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const log = await materialService.getProcessingLogDetail(req.params.id)
    if (!log) return res.status(404).json({ code: 404, message: 'Not found' })
    res.json({ code: 200, data: log })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

export { router as materialRouter }