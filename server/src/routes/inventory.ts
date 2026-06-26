import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { validateBody } from '../utils/validation'
import * as InventoryService from '../services/InventoryService'
import { getInventoryAlertConfig, saveInventoryAlertConfig, DEFAULT_INVENTORY_ALERT_CONFIG } from '../services/InventoryAlertConfigService'

const router = Router()

// Validation schemas
const stockInSchema = z.object({
  inventoryId: z.string(),
  storeId: z.string(),
  quantity: z.number().positive(),
  unitCost: z.number().int().optional(),
  note: z.string().optional(),
  staffId: z.string().optional(),
  supplierId: z.string().optional()
})

const stockOutSchema = z.object({
  inventoryId: z.string(),
  storeId: z.string(),
  quantity: z.number().positive(),
  reason: z.enum(['sold', 'loss', 'adjust', 'expired', 'transfer']),
  note: z.string().optional(),
  staffId: z.string().optional(),
  orderId: z.string().optional()
})

const adjustSchema = z.object({
  newStock: z.number().min(0),
  reason: z.string(),
  staffId: z.string().optional()
})

const createInventorySchema = z.object({
  storeId: z.string(),
  name: z.string().min(1),
  category: z.string(),
  unit: z.string(),
  currentStock: z.number().int().optional(),
  avgCost: z.number().int().optional(),
  minStock: z.number().optional(),
  maxStock: z.number().optional(),
  safetyStock: z.number().optional(),
  shelfLife: z.number().int().optional(),
  concentrateRatio: z.number().optional()
})

const updateInventorySchema = createInventorySchema.partial()

// GET /api/inventory
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId, categoryId, search, lowStock } = req.query

    const items = await InventoryService.getInventory({
      storeId: storeId as string || req.user!.storeId,
      categoryId: categoryId as string,
      search: search as string,
      lowStock: lowStock === 'true'
    })

    res.json({
      code: 200,
      data: { list: items },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get inventory error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get inventory' })
  }
})

// GET /api/inventory/logs - Get all inventory logs (combined stock-in, stock-out, and adjustments)
router.get('/logs', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.query.storeId as string || req.user!.storeId
    const inventoryId = req.query.inventoryId as string
    const type = req.query.type as string

    let logs: any[] = []

    if (!type || type === 'stock_in') {
      const stockInLogs = await InventoryService.getStockInLogs(storeId, inventoryId)
      logs = logs.concat(stockInLogs.map((l: any) => ({ ...l, type: 'stock_in' })))
    }

    if (!type || type === 'stock_out') {
      const stockOutLogs = await InventoryService.getStockOutLogs(storeId, inventoryId)
      logs = logs.concat(stockOutLogs.map((l: any) => ({ ...l, type: 'stock_out' })))
    }

    logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    res.json({
      code: 200,
      data: { list: logs },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get inventory logs error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get inventory logs' })
  }
})

// GET /api/inventory/:id
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const item = await InventoryService.getInventoryById(id)

    if (!item) {
      return res.status(404).json({ code: 404, message: 'Inventory not found' })
    }

    res.json({
      code: 200,
      data: item,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get inventory item error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get inventory item' })
  }
})

// POST /api/inventory/stock-in
router.post('/stock-in', authenticate, authorize('admin', 'manager'), validateBody(stockInSchema), async (req: AuthRequest, res) => {
  try {
    const item = await InventoryService.stockIn({
      ...req.body,
      staffId: req.body.staffId || req.user!.staffId
    })

    res.status(201).json({
      code: 201,
      message: 'Stock in successful',
      data: item,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Stock in error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to stock in' })
  }
})

// POST /api/inventory/stock-out
router.post('/stock-out', authenticate, authorize('admin', 'manager', 'staff'), validateBody(stockOutSchema), async (req: AuthRequest, res) => {
  try {
    const item = await InventoryService.stockOut({
      ...req.body,
      staffId: req.body.staffId || req.user!.staffId
    })

    res.json({
      code: 200,
      message: 'Stock out successful',
      data: item,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Stock out error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to stock out' })
  }
})

// PUT /api/inventory/:id/adjust
router.put('/:id/adjust', authenticate, authorize('admin', 'manager'), validateBody(adjustSchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const item = await InventoryService.adjustInventory(
      id,
      req.body.newStock,
      req.body.reason,
      req.body.staffId || req.user!.staffId
    )

    res.json({
      code: 200,
      message: 'Inventory adjusted',
      data: item,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Adjust inventory error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to adjust inventory' })
  }
})

// GET /api/inventory/alerts/low-stock
router.get('/alerts/low-stock', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.query.storeId as string || req.user!.storeId
    const alerts = await InventoryService.getLowStockAlerts(storeId)

    res.json({
      code: 200,
      data: { list: alerts },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get low stock alerts error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get low stock alerts' })
  }
})

// GET /api/inventory/stats
router.get('/stats/summary', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.query.storeId as string || req.user!.storeId
    const stats = await InventoryService.getInventoryStats(storeId)

    res.json({
      code: 200,
      data: stats,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get inventory stats error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get inventory stats' })
  }
})

// GET /api/inventory/logs/stock-in
router.get('/logs/stock-in', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.query.storeId as string || req.user!.storeId
    const inventoryId = req.query.inventoryId as string
    const logs = await InventoryService.getStockInLogs(storeId, inventoryId)

    res.json({
      code: 200,
      data: { list: logs },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get stock in logs error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get stock in logs' })
  }
})

// GET /api/inventory/logs/stock-out
router.get('/logs/stock-out', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.query.storeId as string || req.user!.storeId
    const inventoryId = req.query.inventoryId as string
    const logs = await InventoryService.getStockOutLogs(storeId, inventoryId)

    res.json({
      code: 200,
      data: { list: logs },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get stock out logs error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get stock out logs' })
  }
})

// POST /api/inventory
router.post('/', authenticate, authorize('admin', 'manager'), validateBody(createInventorySchema), async (req: AuthRequest, res) => {
  try {
    const item = await InventoryService.createInventory(req.body)

    res.status(201).json({
      code: 201,
      message: 'Inventory created',
      data: item,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Create inventory error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to create inventory' })
  }
})

// PUT /api/inventory/:id
router.put('/:id', authenticate, authorize('admin', 'manager'), validateBody(updateInventorySchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const item = await InventoryService.updateInventory(id, req.body)

    res.json({
      code: 200,
      message: 'Inventory updated',
      data: item,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Update inventory error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to update inventory' })
  }
})

// DELETE /api/inventory/:id
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    await InventoryService.deleteInventory(id)

    res.json({
      code: 200,
      message: 'Inventory deleted',
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Delete inventory error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to delete inventory' })
  }
})

// GET /api/inventory/batches
router.get('/batches', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const inventoryId = req.query.inventoryId as string
    const batches = await InventoryService.getBatches(storeId, inventoryId)
    res.json({ code: 200, data: { list: batches }, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get batches error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get batches' })
  }
})

// GET /api/inventory/batches/expiring
router.get('/batches/expiring', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const days = parseInt(req.query.days as string) || 7
    const batches = await InventoryService.getExpiringBatches(storeId, days)
    res.json({ code: 200, data: { list: batches }, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get expiring batches error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get expiring batches' })
  }
})

// ============================================
// 库存异常预警 - 理论消耗 vs 实际消耗对比
// ============================================

// GET /api/inventory/consumption-analysis
router.get('/consumption-analysis', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { startDate, endDate, varianceThreshold, category } = req.query

    if (!startDate || !endDate) {
      return res.status(400).json({ code: 400, message: 'startDate and endDate are required' })
    }

    const analysis = await InventoryService.getConsumptionAnalysis({
      storeId,
      startDate: startDate as string,
      endDate: endDate as string,
      varianceThreshold: varianceThreshold ? parseFloat(varianceThreshold as string) : 10,
      category: category as string
    })

    res.json({
      code: 200,
      data: { list: analysis },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get consumption analysis error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get consumption analysis' })
  }
})

// GET /api/inventory/anomaly-summary
router.get('/anomaly-summary', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { startDate, endDate, varianceThreshold, category } = req.query

    if (!startDate || !endDate) {
      return res.status(400).json({ code: 400, message: 'startDate and endDate are required' })
    }

    const summary = await InventoryService.getAnomalySummary({
      storeId,
      startDate: startDate as string,
      endDate: endDate as string,
      varianceThreshold: varianceThreshold ? parseFloat(varianceThreshold as string) : 10,
      category: category as string
    })

    res.json({
      code: 200,
      data: summary,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get anomaly summary error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get anomaly summary' })
  }
})

// GET /api/inventory/alert-config
router.get('/alert-config', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const config = await getInventoryAlertConfig(storeId)
    res.json({
      code: 200,
      data: config,
      defaults: DEFAULT_INVENTORY_ALERT_CONFIG,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get inventory alert config error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get inventory alert config' })
  }
})

// PUT /api/inventory/alert-config
router.put('/alert-config', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const configData = req.body

    const config = await saveInventoryAlertConfig(storeId, configData)
    res.json({
      code: 200,
      message: 'Inventory alert config saved',
      data: config,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Save inventory alert config error:', error)
    res.status(500).json({ code: 500, message: 'Failed to save inventory alert config' })
  }
})

export { router as inventoryRouter }