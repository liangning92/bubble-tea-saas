import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { validateBody } from '../utils/validation'
import * as OrderService from '../services/OrderService'

const router = Router()

// Validation schema
const createOrderSchema = z.object({
  storeId: z.string(),
  channelId: z.string().optional(),
  staffId: z.string(),
  memberId: z.string().optional(),
  items: z.array(z.object({
    productId: z.string(),
    productName: z.string(),
    specId: z.string(),
    specName: z.string(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().int().min(0),
    addons: z.array(z.object({
      name: z.string(),
      price: z.number().int()
    })).optional().default([])
  })),
  discountAmount: z.number().int().optional().default(0),
  paymentMethod: z.enum(['cash', 'gopay', 'ovo', 'dana', 'shopeepay', 'member', 'bca_va', 'mandiri_va'])
})

// GET /api/orders
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId, status, paymentMethod, channelId, startDate, endDate, page, pageSize, date } = req.query

    const result = await OrderService.getOrders({
      storeId: storeId as string,
      userId: req.user!.id,
      userRole: req.user!.role,
      status: status as string,
      paymentMethod: paymentMethod as string,
      channelId: channelId as string,
      startDate: startDate as string,
      endDate: endDate as string,
      date: date as string,
      page: parseInt(page as string) || 1,
      pageSize: parseInt(pageSize as string) || 20
    })

    res.json({
      code: 200,
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get orders error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get orders' })
  }
})

// GET /api/orders/refund-requests - 必须在 /:id 之前
router.get('/refund-requests', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { status } = req.query
    const storeId = req.query.storeId as string || req.user!.storeId

    const where: any = {}
    if (status && status !== 'all') where.status = status

    const requests = await prisma.refundRequest.findMany({
      where,
      include: {
        order: {
          include: { items: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const filtered = requests.filter(r => r.order?.storeId === storeId)

    res.json({
      code: 200,
      data: { list: filtered },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get refund requests error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get refund requests' })
  }
})

// GET /api/orders/:id
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const order = await OrderService.getOrderById(id)

    if (!order) {
      return res.status(404).json({ code: 404, message: 'Order not found' })
    }

    res.json({
      code: 200,
      data: order,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get order error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get order' })
  }
})

// POST /api/orders
router.post('/', authenticate, validateBody(createOrderSchema), async (req: AuthRequest, res) => {
  try {
    const order = await OrderService.createOrder(req.body)

    res.status(201).json({
      code: 201,
      message: 'Order created',
      data: order,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Create order error:', error)
    // Pass through the actual error message (e.g., "库存不足: 生珍珠 (可用: 500, 需要: 750)")
    const message = error?.message || 'Failed to create order'
    res.status(500).json({ code: 500, message })
  }
})

// POST /api/orders/refund-request - POS端退款申请
router.post('/refund-request', authenticate, async (req: AuthRequest, res) => {
  try {
    const { orderId, reason, staffId } = req.body

    if (!orderId || !reason) {
      return res.status(400).json({ code: 400, message: 'Missing orderId or reason' })
    }

    const result = await OrderService.createRefundRequest({
      orderId,
      reason,
      requestedBy: staffId || req.user!.staffId || req.user!.id
    })

    res.status(201).json({
      code: 201,
      message: 'Refund request submitted',
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Refund request error:', error)
    res.status(500).json({ code: 500, message: 'Failed to submit refund request' })
  }
})

// PUT /api/orders/:id/status
router.put('/:id/status', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    const order = await OrderService.updateOrderStatus(id, status)

    res.json({
      code: 200,
      message: 'Order status updated',
      data: order,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Update order status error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update order status' })
  }
})

// POST /api/orders/:id/refund
router.post('/:id/refund', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body

    const order = await OrderService.refundOrder(id, reason)

    res.json({
      code: 200,
      message: 'Order refunded',
      data: order,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Refund order error:', error)
    res.status(500).json({ code: 500, message: 'Failed to refund order' })
  }
})

// POST /api/orders/refund-requests/:id/approve - 批准退款
router.post('/refund-requests/:id/approve', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { note } = req.body

    const request = await prisma.refundRequest.findUnique({
      where: { id },
      include: { order: true }
    })

    if (!request) {
      return res.status(404).json({ code: 404, message: 'Refund request not found' })
    }

    // Validate refund amount does not exceed order total
    if (request.amount > request.order.totalAmount) {
      return res.status(400).json({
        code: 400,
        message: `Refund amount (${request.amount}) cannot exceed order total (${request.order.totalAmount})`
      })
    }

    // Validate refund amount is positive
    if (request.amount <= 0) {
      return res.status(400).json({
        code: 400,
        message: 'Refund amount must be greater than 0'
      })
    }

    // Update refund request status
    await prisma.refundRequest.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: req.user!.staffId || req.user!.id,
        approvedAt: new Date(),
        note
      }
    })

    // Update order status to refunded
    await prisma.order.update({
      where: { id: request.orderId },
      data: { status: 'refunded' }
    })

    // Return inventory and reverse member points
    if (request.order) {
      await OrderService.refundOrder(request.orderId, note)
    }

    res.json({
      code: 200,
      message: 'Refund approved',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Approve refund error:', error)
    res.status(500).json({ code: 500, message: 'Failed to approve refund' })
  }
})

// POST /api/orders/refund-requests/:id/reject - 拒绝退款
router.post('/refund-requests/:id/reject', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { note } = req.body

    if (!note) {
      return res.status(400).json({ code: 400, message: 'Rejection reason is required' })
    }

    await prisma.refundRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        approvedBy: req.user!.staffId || req.user!.id,
        approvedAt: new Date(),
        note
      }
    })

    res.json({
      code: 200,
      message: 'Refund rejected',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Reject refund error:', error)
    res.status(500).json({ code: 500, message: 'Failed to reject refund' })
  }
})

// GET /api/orders/kds/list - KDS orders for kitchen display
router.get('/kds/list', authenticate, authorize('admin', 'manager', 'staff'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.query.storeId as string || req.user!.storeId
    const orders = await OrderService.getKDSOrders(storeId, {
      status: req.query.status as string,
      limit: parseInt(req.query.limit as string) || 50
    })

    res.json({
      code: 200,
      data: { list: orders },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get KDS orders error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get KDS orders' })
  }
})

export { router as orderRouter }