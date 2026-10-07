import { findOrderReplay, OrderReplayConflict, publicOrder } from '../services/OrderReplayService'
import { OrderBusinessRejection } from '../services/OrderBusinessRejection'
import { checkPaymentMethod } from '../services/POSConfigPolicy'
import {quoteItemRefund,requestItemRefund,approveItemRefund,itemRefundRecord} from '../services/ItemRefundService'
import { allowedPreviousOrderStatuses } from '../utils/orderStatusPolicy'
import { validateRefundApproval } from '../utils/refundPolicy'
import { Router, Response } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest, canAccessStore } from '../middlewares/auth'
import { getStoreId } from '../utils/storeHelper'
import { validateBody } from '../utils/validation'
import * as OrderService from '../services/OrderService'
import prisma from '../config/database'

const router = Router()

function checkOrderAccess(req: AuthRequest, res: Response, order: { storeId: string } | null) {
  if (!order) {
    res.status(404).json({ code: 404, message: 'Order not found' })
    return false
  }
  if (!canAccessStore(req.user!, order.storeId)) {
    res.status(403).json({ code: 403, message: 'Access denied: Store mismatch' })
    return false
  }
  return true
}

// Validation schema
const createOrderSchema = z.object({
  storeId: z.string(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  shiftSessionId: z.string().optional(),
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
  })).min(1),
  discountAmount: z.number().int().min(0).optional().default(0),
  pointsRedeemed: z.number().int().min(0).optional().default(0),
  qrisExternalId: z.string().max(100).optional(),
  paymentEvidenceId: z.string().max(100).optional(),
  taxEnabled: z.boolean().optional().default(true),
  paymentMethod: z.enum(['cash', 'qris', 'gopay', 'ovo', 'dana', 'shopeepay', 'debit', 'card', 'member', 'bca_va', 'mandiri_va']),
  status: z.enum(['completed', 'suspended']).optional().default('completed'),
  customerCount: z.number().int().optional().default(1),
  dineInCount: z.number().int().optional(),
  tableNumber: z.string().optional(),
  callerPhone: z.string().max(50).optional(),
  driverPickupTime: z.coerce.date().optional(),
  purchaseOrderNo: z.string().max(100).optional(),
  socialRef: z.string().max(200).optional(),
  note: z.string().max(2000).optional(),
  platformOrderId: z.string().optional(),
  orderNumber: z.string().optional(),
  pickupNumber: z.string().optional()
})

// GET /api/orders
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId, status, paymentMethod, channelId, startDate, endDate, page, pageSize, date, search } = req.query

    const result = await OrderService.getOrders({
      storeId: storeId as string,
      userId: req.user!.id,
      userRole: req.user!.role,
      status: status as string,
      paymentMethod: paymentMethod as string,
      channelId: channelId as string,
      search: search as string,
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
    const storeId = getStoreId(req)

    const where: any = { order: { storeId } }
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

    const filtered = requests.filter(r => r.order?.storeId === storeId).map(r => ({ ...r, order: publicOrder(r.order) }))

    res.json({
      code: 200,
      data: { list: filtered.map(request => ({ ...request, orderNumber: request.order.orderNumber })) },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get refund requests error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get refund requests' })
  }
})

// Original recorded allocation only; never current catalogue prices.
router.get('/:id/refund-quote',authenticate,async(req:AuthRequest,res)=>{
 try { const order=await prisma.order.findUnique({where:{id:req.params.id}});if(!checkOrderAccess(req,res,order))return
 res.json({code:200,data:await quoteItemRefund(req.params.id,order!.storeId)})
 }catch(error:any){res.status(409).json({code:409,message:error.message})}
})

// GET /api/orders/:id
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const order = await OrderService.getOrderById(id)

    if (!checkOrderAccess(req, res, order)) return

    res.json({
      code: 200,
      data: publicOrder(order),
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get order error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get order' })
  }
})

// POST /api/orders
router.post('/', authenticate, authorize('admin', 'manager', 'cashier'), validateBody(createOrderSchema), async (req: AuthRequest, res) => {
  const rejectAdmission = (message: string) => {
    // Capture the business reason even when an older POS cannot report checkout_failed.
    console.warn('[Checkout rejected]', JSON.stringify({ code: message, storeId: req.user!.storeId, orderNumber: req.body.orderNumber || null, paymentMethod: req.body.paymentMethod }))
    return res.status(409).json({ code: 409, message })
  }
  try {
    // Enforce the cash session at the API boundary so a client cannot bypass it.
    const storeId = req.user!.storeId
    if (!storeId || req.body.storeId !== storeId) {
      return res.status(403).json({ code: 403, message: 'Store access denied' })
    }
    const replay = await findOrderReplay(req.body)
    if (replay) return res.status(201).json({ code: 201, message: 'Order created', data: replay, timestamp: new Date().toISOString() })
    const openShift = await prisma.shiftSession.findFirst({
      where: { storeId, status: 'open' },
      select: { id: true, shift: true }
    })
    if (!openShift) {
      return rejectAdmission('OPEN_SHIFT_REQUIRED')
    }
    if (openShift.shift === 'off') return rejectAdmission('SHIFT_DISABLED')
    const paymentError = await checkPaymentMethod(storeId, req.body.paymentMethod)
    if (paymentError) return rejectAdmission(paymentError)
    // Existing sessions are historical records, but a disabled shift cannot accept new sales.
    const activeShift = await prisma.shift.findFirst({ where: { storeId, key: openShift.shift, isActive: true } })
    if (!activeShift) return rejectAdmission('SHIFT_DISABLED')
    const order = await OrderService.createOrder(req.body, { actorId: req.user!.id, storeId, allowCreate: true })

    res.status(201).json({
      code: 201,
      message: 'Order created',
      data: publicOrder(order),
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    if (error instanceof OrderReplayConflict) return res.status(error.code === 'ORDER_STORE_MISMATCH' ? 403 : 409).json({ code: error.code === 'ORDER_STORE_MISMATCH' ? 403 : 409, message: error.code })
    if (error instanceof OrderBusinessRejection && error.rolledBack) {
      return res.status(409).json({ code: 409, message: error.code, details: error.message, rejection: { code: error.code, outcome: 'not_committed', orderNumber: req.body.orderNumber } })
    }
    console.error('Create order error:', error)
    // Pass through the actual error message (e.g., "库存不足: 生珍珠 (可用: 500, 需要: 750)")
    const message = error?.message || 'Failed to create order'
    res.status(500).json({ code: 500, message })
  }
})

// POST /api/orders/bulk-sync - each input uses the single-order schema and replay contract.
router.post('/bulk-sync', authenticate, authorize('admin', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const input = req.body.orders
    if (!Array.isArray(input) || !input.length) return res.status(400).json({ code: 400, message: 'Invalid or empty orders array' })
    const storeId = req.user!.storeId
    if (!storeId || input.some(order => order?.storeId !== storeId)) return res.status(403).json({ code: 403, message: 'Store access denied' })
    const parsed = z.array(createOrderSchema).safeParse(input)
    if (!parsed.success) return res.status(400).json({ code: 400, message: 'Invalid order request' })
    const results = []
    // Zod checked required fields; strictNullChecks=false widens its inferred object properties.
    const orders = parsed.data as OrderService.CreateOrderData[]
    for (const [index, order] of orders.entries()) {
      try {
        // Authentication/store checks precede this replay; mutable admission follows it.
        const replay = await findOrderReplay(order)
        if (replay) { results.push({ index, localId: order.orderNumber, success: true, data: replay }); continue }
        const session = order.shiftSessionId
          ? await prisma.shiftSession.findFirst({ where: { id: order.shiftSessionId, storeId }, select: { id: true, shift: true } })
          : await prisma.shiftSession.findFirst({ where: { storeId, status: 'open' }, select: { id: true, shift: true } })
        if (!session) throw new Error('OPEN_SHIFT_REQUIRED')
        if (session.shift === 'off') throw new Error('SHIFT_DISABLED')
        const active = await prisma.shift.findFirst({ where: { storeId, key: session.shift, isActive: true }, select: { id: true } })
        if (!active) throw new Error('SHIFT_DISABLED')
        const paymentError = await checkPaymentMethod(storeId, order.paymentMethod)
        if (paymentError) throw new Error(paymentError)
        results.push({ index, localId: order.orderNumber, success: true, data: await OrderService.createOrder(order) })
      } catch (error: any) {
        results.push({ index, localId: order.orderNumber, success: false, error: error.message || 'Failed to create order' })
      }
    }
    return res.json({ code: 200, message: 'Bulk sync completed', data: { results }, timestamp: new Date().toISOString() })
  } catch (error: any) {
    return res.status(500).json({ code: 500, message: error.message || 'Failed to process bulk sync' })
  }
})

// POST /api/orders/refund-request - POS端退款申请
router.post('/refund-request', authenticate, async (req: AuthRequest, res) => {
  try {
    const { orderId, reason, staffId } = req.body

    if (!orderId || !reason) {
      return res.status(400).json({ code: 400, message: 'Missing orderId or reason' })
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!checkOrderAccess(req, res, order)) return
    if(req.body.amount!==undefined)return res.status(400).json({code:400,message:'REFUND_AMOUNT_SERVER_CALCULATED'})
    if(req.body.items!==undefined){
      const body=z.object({requestId:z.string(),orderId:z.string(),reason:z.string().trim().min(1).max(2000),reasonCode:z.string(),items:z.array(z.object({itemId:z.string(),quantity:z.number().int().positive()})).min(1).max(500)}).parse(req.body)
      const result=await requestItemRefund({requestId:body.requestId!,orderId:body.orderId!,reason:body.reason!,reasonCode:body.reasonCode!,items:body.items,storeId:order!.storeId,requestedBy:req.user!.staffId||req.user!.id})
      return res.status(201).json({code:201,data:result})
    }
    const result = await OrderService.createRefundRequest({
      orderId,
      reason,
      requestedBy: req.user!.staffId || req.user!.id,
      reasonCode: req.body.reasonCode, selectedItemIds: req.body.selectedItemIds, requestId: req.body.requestId
    })

    res.status(201).json({
      code: 201,
      message: 'Refund request submitted',
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if(error instanceof z.ZodError)return res.status(400).json({code:400,message:'INVALID_REFUND_ITEMS'})
    if(error instanceof Error && /^(REFUND_|UNPREPARED_|REPLICA_)/.test(error.message))return res.status(409).json({code:409,message:error.message})
    if (error instanceof Error && ['INVALID_REFUND_ITEMS', 'REFUND_CLASSIFICATION_REQUIRED'].includes(error.message)) return res.status(400).json({ code: 400, message: error.message })
    console.error('Refund request error:', error)
    res.status(500).json({ code: 500, message: 'Failed to submit refund request' })
  }
})

// PUT /api/orders/:id/status
router.put('/:id/status', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    const existing = await prisma.order.findUnique({ where: { id } })
    if (!checkOrderAccess(req, res, existing)) return
    allowedPreviousOrderStatuses(status)
    const order = await OrderService.updateOrderStatus(id, status)

    res.json({
      code: 200,
      message: 'Order status updated',
      data: publicOrder(order),
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof Error && ['ORDER_FINANCIAL_STATUS_PROTECTED','ORDER_STATUS_TRANSITION_CONFLICT'].includes(error.message)) return res.status(409).json({ code: 409, message: error.message })
    console.error('Update order status error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update order status' })
  }
})

// DELETE /api/orders/:id - Delete a suspended order (used when resuming order)
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    // Only allow deleting suspended orders
    const order = await prisma.order.findUnique({ where: { id } })
    if (!checkOrderAccess(req, res, order)) return
    if (order.status !== 'suspended') {
      return res.status(400).json({ code: 400, message: 'Only suspended orders can be deleted' })
    }

    await prisma.order.delete({ where: { id } })

    res.json({
      code: 200,
      message: 'Order deleted',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Delete order error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete order' })
  }
})

// POST /api/orders/:id/refund
router.post('/:id/refund', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body

    const existing = await prisma.order.findUnique({ where: { id } })
    if (!checkOrderAccess(req, res, existing)) return
    return res.status(409).json({ code: 409, message: 'REFUND_REQUEST_REQUIRED' })
  } catch (error: any) {
    if (error?.message === 'ORDER_ALREADY_REFUNDED') {
      return res.status(400).json({ code: 400, message: 'Order already refunded' })
    }
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
      include: { order: { include: { items: true } } }
    })

    if (!request) {
      return res.status(404).json({ code: 404, message: 'Refund request not found' })
    }

    if (!checkOrderAccess(req, res, request.order)) return

    if(itemRefundRecord(request.selectedItemIds)){
      const result=await approveItemRefund(request.id,{storeId:request.order.storeId,id:req.user!.staffId||req.user!.id,role:req.user!.role},req.body.verifiedPrepared===true,note)
      return res.json({code:200,data:result,message:'Refund accounting approved; external payment is manual'})
    }
    const refundAmount = request.amount === 0 ? request.order.finalAmount : request.amount
    // Compare with actual received total, including tax and discounts.
    if (refundAmount > request.order.finalAmount) {
      return res.status(400).json({
        code: 400,
        message: `Refund amount (${request.amount}) cannot exceed received total (${request.order.finalAmount})`
      })
    }

    // Validate refund amount is positive
    if (!Number.isSafeInteger(refundAmount) || refundAmount <= 0) {
      return res.status(400).json({
        code: 400,
        message: 'Refund amount must be greater than 0'
      })
    }

    if(request.status==='approved')return res.json({code:200,message:'Refund already approved'})
    if (request.status !== 'pending') {
      return res.status(400).json({ code: 400, message: 'Refund request already processed' })
    }

    validateRefundApproval(request, request.order, req.user!.role, req.body.verifiedPrepared === true, req.body.verifiedUnprepared === true)

    // Classification and explicit administrator verification determine physical stock reversal.
    await OrderService.refundOrder(request.orderId, note || request.reason, req.user!.staffId, refundAmount, {
      requestId: request.id,
      approvedBy: req.user!.staffId || req.user!.id,
      restoreUnprepared: request.reasonCode === 'paid_unprepared',
      note
    })

    res.json({
      code: 200,
      message: 'Refund approved',
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    if (error?.message === 'ORDER_ALREADY_REFUNDED') {
      return res.status(400).json({ code: 400, message: 'Order already refunded' })
    }
    if (['ADMIN_APPROVAL_REQUIRED','UNPREPARED_STOCK_POLICY_REQUIRED','REFUND_CLASSIFICATION_REQUIRED','INVALID_REFUND_ITEMS','PARTIAL_REFUND_POLICY_REQUIRED'].includes(error?.message)) return res.status(error.message === 'ADMIN_APPROVAL_REQUIRED' ? 403 : 409).json({ code: 409, message: error.message })
    if(/^(REFUND_|REPLICA_)/.test(error?.message||''))return res.status(409).json({code:409,message:error.message})
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

    const request = await prisma.refundRequest.findUnique({ where: { id }, include: { order: { include: { items: true } } } })
    if (!checkOrderAccess(req, res, request?.order || null)) return
    if (request.status !== 'pending') return res.status(409).json({ code: 409, message: 'Refund request already processed' })
    const rejected = await prisma.refundRequest.updateMany({
      where: { id, status: 'pending' },
      data: {
        status: 'rejected',
        approvedBy: req.user!.staffId || req.user!.id,
        approvedAt: new Date(),
        note
      }
    })

    if (rejected.count !== 1) return res.status(409).json({ code: 409, message: 'Refund request already processed' })
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
    const storeId = getStoreId(req)
    const orders = await OrderService.getKDSOrders(storeId, {
      status: req.query.status as string,
      limit: parseInt(req.query.limit as string) || 50
    })

    res.json({
      code: 200,
      data: { list: orders.map(publicOrder) },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get KDS orders error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get KDS orders' })
  }
})

export { router as orderRouter }
