import { parseBusinessDate, parseDateBoundary } from '../utils/businessDate'
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
  supplierId: z.string().optional(),
  source: z.enum(['admin','online']).optional(),
  onlineOrderNumber: z.string().max(150).optional(),
  requestId: z.string().uuid().optional(),
  expectedDate: z.string().optional(),
  note: z.string().optional(),
  items: z.array(z.object({
    inventoryId: z.string(),
    quantity: z.number().finite().positive(),
    inputUnit: z.string().max(30).optional(),
    unitCost: z.number().finite().min(0).optional(),
    paidAmount: z.number().int().min(0).optional()
  })).min(1)
})

// GET /api/purchase-orders
router.get('/', authenticate, authorize('admin', 'manager', 'staff'), async (req: AuthRequest, res) => {
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
router.get('/pending', authenticate, authorize('admin', 'manager', 'staff'), async (req: AuthRequest, res) => {
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
router.get('/:id', authenticate, authorize('admin', 'manager', 'staff'), async (req: AuthRequest, res) => {
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
router.post('/', authenticate, authorize('admin', 'manager', 'staff'), validateBody(createPOSchema), async (req: AuthRequest, res) => {
  try {
    const order = await PurchaseOrderService.createPurchaseOrder({
      ...req.body,
      source: req.user!.role==='staff' ? 'online' : req.body.source,
      createdBy: req.user!.staffId || req.user!.id,
      storeId: req.user!.role === 'admin' && !req.user!.employeeApp ? req.body.storeId : getStoreId(req),
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

router.put('/:id', authenticate, authorize('admin','manager','staff'), validateBody(createPOSchema.extend({expectedVersion:z.string().datetime(),reason:z.string().trim().min(1).max(1000)})), async(req:AuthRequest,res)=>{
 try{res.json({code:200,data:await PurchaseOrderService.editPurchaseOrder(req.params.id,{...req.body,storeId:getStoreId(req),expectedDate:req.body.expectedDate?new Date(req.body.expectedDate):undefined},req.user!.staffId||req.user!.id,req.body.expectedVersion,req.body.reason,!!req.user!.employeeApp||req.user!.role==='staff')})}catch(e:any){res.status(e.statusCode||500).json({code:e.statusCode||500,message:e.message})}
});
router.post('/:id/confirm-payment',authenticate,authorize('admin','manager'),validateBody(z.object({expectedVersion:z.string().datetime(),paidDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),reason:z.string().trim().min(1).max(1000)})),async(req:AuthRequest,res)=>{
 try{let paidAt:Date;try{paidAt=parseBusinessDate(req.body.paidDate)}catch{throw new PurchaseOrderService.PurchaseOrderError('INVALID_PAYMENT_DATE',400)}
 res.json({code:200,data:await PurchaseOrderService.confirmPurchasePayment(req.params.id,getStoreId(req),req.user!.staffId||req.user!.id,req.body.expectedVersion,paidAt,req.body.reason)})}catch(e:any){res.status(e.statusCode||500).json({code:e.statusCode||500,message:e.message})}
});
for(const action of ['reverse-receipt','refund'])router.post(`/:id/${action}`,authenticate,authorize('admin','manager'),validateBody(z.object({reason:z.string().trim().min(1).max(1000)})),async(req:AuthRequest,res)=>{
 try{const handler=action==='refund'?PurchaseOrderService.refundPurchasePayment:PurchaseOrderService.reversePurchaseReceipt;res.json({code:200,data:await handler(req.params.id,getStoreId(req),req.user!.staffId||req.user!.id,req.body.reason)})}catch(e:any){res.status(e.statusCode||500).json({code:e.statusCode||500,message:e.message})}
});

// PUT /api/purchase-orders/:id/status
router.put('/:id/status', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    const order = await PurchaseOrderService.updatePurchaseOrderStatus(id, status, req.user!.role === 'admin' && !req.user!.employeeApp ? undefined : getStoreId(req))

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
router.post('/:id/receive', authenticate, authorize('admin', 'manager', 'staff'),validateBody(z.object({items:z.array(z.object({itemId:z.string(),expiryDate:z.string().optional(),manufacturingDate:z.string().optional()})).optional()})), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const order = await PurchaseOrderService.receivePurchaseOrder(id, req.user!.staffId || req.user!.id, req.user!.role === 'admin' && !req.user!.employeeApp ? undefined : getStoreId(req),req.body.items)

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
router.delete('/:id', authenticate, authorize('admin','manager','staff'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body
    if(req.user!.employeeApp||req.user!.role==='staff'){const order=await PurchaseOrderService.getPurchaseOrderById(id);if(!order||order.storeId!==getStoreId(req)||order.createdBy!==(req.user!.staffId||req.user!.id))return res.status(404).json({code:404,message:'Purchase not found'})}

    const order = await PurchaseOrderService.cancelPurchaseOrder(id, reason || 'Cancelled by admin', req.user!.role === 'admin' && !req.user!.employeeApp ? undefined : getStoreId(req))

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