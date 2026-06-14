import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { validateBody } from '../utils/validation'
import * as InventoryCountService from '../services/InventoryCountService'

const router = Router()

const createSchema = z.object({
  storeId: z.string(),
  period: z.enum(['monthly', 'quarterly', 'annual']),
  startDate: z.string(),
  endDate: z.string(),
  notes: z.string().optional()
})

const updateItemSchema = z.object({
  countedQty: z.number().min(0),
  countedBy: z.string(),
  note: z.string().optional()
})

// GET /api/inventory-counts
router.get('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const counts = await InventoryCountService.getInventoryCounts(storeId)
    res.json({ code: 200, data: { list: counts }, timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('Get inventory counts error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get inventory counts' })
  }
})

// GET /api/inventory-counts/:id
router.get('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const count = await InventoryCountService.getInventoryCountById(req.params.id)
    if (!count) return res.status(404).json({ code: 404, message: 'Inventory count not found' })
    res.json({ code: 200, data: count, timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('Get inventory count error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get inventory count' })
  }
})

// POST /api/inventory-counts
router.post('/', authenticate, authorize('admin', 'manager'), validateBody(createSchema), async (req: AuthRequest, res) => {
  try {
    const count = await InventoryCountService.createInventoryCount({
      ...req.body,
      startDate: new Date(req.body.startDate),
      endDate: new Date(req.body.endDate)
    })
    res.status(201).json({ code: 201, message: 'Inventory count created', data: count, timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('Create inventory count error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to create inventory count' })
  }
})

// PUT /api/inventory-counts/:id/item/:itemId
router.put('/:id/item/:itemId', authenticate, authorize('admin', 'manager', 'staff'), validateBody(updateItemSchema), async (req: AuthRequest, res) => {
  try {
    const item = await InventoryCountService.updateCountItem(
      req.params.itemId,
      req.body.countedQty,
      req.body.countedBy,
      req.body.note
    )
    res.json({ code: 200, message: 'Count item updated', data: item, timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('Update count item error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to update count item' })
  }
})

// POST /api/inventory-counts/:id/complete
router.post('/:id/complete', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const count = await InventoryCountService.completeInventoryCount(req.params.id, req.user!.staffId || '')
    res.json({ code: 200, message: 'Inventory count completed', data: count, timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('Complete inventory count error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to complete inventory count' })
  }
})

// POST /api/inventory-counts/:id/cancel
router.post('/:id/cancel', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const count = await InventoryCountService.cancelInventoryCount(req.params.id)
    res.json({ code: 200, message: 'Inventory count cancelled', data: count, timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('Cancel inventory count error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to cancel inventory count' })
  }
})

export { router as inventoryCountRouter }
