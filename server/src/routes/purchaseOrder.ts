import { parseDateBoundary } from '../utils/businessDate'
import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { getStoreId } from '../utils/storeHelper'
import { validateBody } from '../utils/validation'
import * as PurchaseOrderService from '../services/PurchaseOrderService'

const router = Router()

// Validation schemas
const createPOSchema = z.object({
  storeId: z.string(),
  supplierId: z.string(),
  expectedDate: z.string().optional(),
  note: z.string().optional(),
  items: z.array(z.object({
    inventoryId: z.string(),
    quantity: z.number().positive(),
    unitCost: z.number().int().positive()
  })).min(1)
})

// GET /api/purchase-orders
router.get('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { storeId, supplierId, status, startDate, endDate } = req.query

    const orders = await PurchaseOrderService.getPurchaseOrders({
      storeId: getStoreId(req),
      supplierId: supplierId as string,
      status: status as string,
      startDate: startDate ? parseDateBoundary(startDate as string) : undefined,
      endDate: endDate ? parseDateBoundary(endDate as string, true) : undefined
    })

    res.json({
      code: 200,
      data: { list: orders },
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Get purchase orders error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get purchase orders' })
  }
})

// GET /api/purchase-orders/pending
router.get('/pending', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = getStoreId(req)
    const orders = await PurchaseOrderService.getPendingPurchaseOrders(storeId)

    res.json({
      code: 200,
      data: { list: orders },
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Get pending purchase orders error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get pending purchase orders' })
  }
})

// GET /api/purchase-orders/:id
router.get('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const order = await PurchaseOrderService.getPurchaseOrderById(id)

    if (!order || (req.user!.role !== 'admin' && order.storeId !== getStoreId(req))) {
      return res.status(404).json({ code: 404, message: 'Purchase order not found' })
    }

    res.json({
      code: 200,
      data: order,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Get purchase order error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get purchase order' })
  }
})

// POST /api/purchase-orders
router.post('/', authenticate, authorize('admin', 'manager'), validateBody(createPOSchema), async (req: AuthRequest, res) => {
  try {
    const order = await PurchaseOrderService.createPurchaseOrder({
      ...req.body,
      storeId: req.user!.role === 'admin' ? req.body.storeId : getStoreId(req),
      expectedDate: req.body.expectedDate ? new Date(req.body.expectedDate) : undefined
    })

    res.status(201).json({
      code: 201,
      message: 'Purchase order created',
      data: order,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Create purchase order error:', error)
    res.status(error.statusCode || 500).json({ code: error.statusCode || 500, message: error.statusCode ? error.message : 'Failed to create purchase order' })
  }
})

// PUT /api/purchase-orders/:id/status
router.put('/:id/status', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    const order = await PurchaseOrderService.updatePurchaseOrderStatus(id, status, req.user!.role === 'admin' ? undefined : getStoreId(req))

    res.json({
      code: 200,
      message: 'Purchase order status updated',
      data: order,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Update purchase order status error:', error)
    res.status(error.statusCode || 500).json({ code: error.statusCode || 500, message: error.statusCode ? error.message : 'Failed to update purchase order status' })
  }
})

// POST /api/purchase-orders/:id/receive
router.post('/:id/receive', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const order = await PurchaseOrderService.receivePurchaseOrder(id, req.user!.staffId, req.user!.role === 'admin' ? undefined : getStoreId(req))

    res.json({
      code: 200,
      message: 'Purchase order received and inventory updated',
      data: order,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Receive purchase order error:', error)
    res.status(error.statusCode || 500).json({ code: error.statusCode || 500, message: error.statusCode ? error.message : 'Failed to receive purchase order' })
  }
})

// DELETE /api/purchase-orders/:id
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body

    const order = await PurchaseOrderService.cancelPurchaseOrder(id, reason || 'Cancelled by admin', req.user!.role === 'admin' ? undefined : getStoreId(req))

    res.json({
      code: 200,
      message: 'Purchase order cancelled',
      data: order,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Cancel purchase order error:', error)
    res.status(error.statusCode || 500).json({ code: error.statusCode || 500, message: error.statusCode ? error.message : 'Failed to cancel purchase order' })
  }
})

export { router as purchaseOrderRouter }