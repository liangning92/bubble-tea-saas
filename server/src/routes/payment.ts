import { Router, Request, Response } from 'express'
import { createQrisPayment, handleQrisWebhook, getQrisPaymentStatus } from '../services/PaymentService'
import { z } from 'zod'
import { timingSafeEqual } from 'crypto'
import { authenticate, AuthRequest, canAccessStore } from '../middlewares/auth'

const router = Router()
router.use((req, res, next) => {
  if (req.path === '/qris/webhook') return next()
  return authenticate(req as AuthRequest, res, next)
})

// Create QRIS payment
router.post('/qris/create', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ storeId: z.string().min(1), orderId: z.string().min(1).max(100), amount: z.number().int().positive().max(1000000000) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payment request' })
    const { storeId, orderId, amount } = parsed.data
    const authReq = req as AuthRequest
    if (!authReq.user || !canAccessStore(authReq.user, storeId)) {
      return res.status(403).json({ error: 'Access denied: Store mismatch' })
    }

    const result = await createQrisPayment(storeId, orderId, amount)

    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    res.json({
      success: true,
      data: {
        qrString: result.qrString,
        qrImage: result.qrImage,
        externalId: result.externalId,
        expiresAt: result.expiresAt
      }
    })
  } catch (error: any) {
    console.error('Create QRIS error:', error)
    res.status(500).json({ error: error.message })
  }
})

// QRIS webhook from Xendit
router.post('/qris/webhook', async (req: Request, res: Response) => {
  try {
    const expectedToken = process.env.XENDIT_CALLBACK_TOKEN || ''
    const suppliedToken = req.get('x-callback-token') || ''
    if (!expectedToken) return res.status(503).json({ error: 'Payment webhook is not configured' })
    if (Buffer.byteLength(expectedToken) !== Buffer.byteLength(suppliedToken) ||
        !timingSafeEqual(Buffer.from(expectedToken), Buffer.from(suppliedToken))) {
      return res.status(401).json({ error: 'Invalid webhook token' })
    }
    const payload = req.body
    const parsed = z.object({
      external_id: z.string().min(1).max(200),
      status: z.string().min(1).max(40),
      amount: z.number().optional(),
      paid_at: z.string().optional()
    }).safeParse(payload)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid webhook payload' })

    const result = await handleQrisWebhook(parsed.data as { external_id: string; status: string; amount?: number; paid_at?: string })

    if (result.success) {
      res.json({ success: true })
    } else {
      res.status(404).json({ success: false, error: 'Payment not found' })
    }
  } catch (error: any) {
    console.error('QRIS webhook error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get QRIS payment status
router.get('/qris/status/:externalId', async (req: AuthRequest, res: Response) => {
  try {
    const { externalId } = req.params
    const status = await getQrisPaymentStatus(externalId)
    if (status.storeId && (!req.user || !canAccessStore(req.user, status.storeId))) {
      return res.status(403).json({ error: 'Access denied: Store mismatch' })
    }
    res.json(status)
  } catch (error: any) {
    console.error('Get QRIS status error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
