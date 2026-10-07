import { Router, Request, Response } from 'express'
// @ts-ignore - existing multer dependency has no type package
import multer from 'multer'
import prisma from '../config/database'
import { savePaymentEvidence, getPaymentEvidence, evidenceMetadata } from '../services/PaymentEvidenceService'
import { createQrisPayment, handleQrisWebhook, getQrisPaymentStatus } from '../services/PaymentService'
import { z } from 'zod'
import { timingSafeEqual } from 'crypto'
import { authenticate, AuthRequest, canAccessStore } from '../middlewares/auth'

const router = Router()
router.use((req, res, next) => {
  if (req.path === '/qris/webhook') return next()
  return authenticate(req as AuthRequest, res, next)
})

// Private manual-payment evidence, never exposed through public /uploads.
const evidenceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1 } }).single('photo')
router.post('/evidence', (req: AuthRequest, res: Response) => {
  evidenceUpload(req, res, async error => {
    if (error) return res.status(400).json({ code: 400, message: 'INVALID_PAYMENT_IMAGE' })
    try {
      const amount = z.coerce.number().int().positive().max(1000000000).parse(req.body.amount)
      const data = await savePaymentEvidence(req.user!.storeId, req.user!.id, amount, req.file?.buffer)
      res.status(201).json({ code: 201, data })
    } catch (error) {
      const known = ['INVALID_PAYMENT_IMAGE', 'INVALID_PAYMENT_EVIDENCE', 'PAYMENT_EVIDENCE_ALREADY_USED']
      const message = error instanceof Error && known.includes(error.message) ? error.message : 'INVALID_PAYMENT_EVIDENCE'
      const status = message === 'PAYMENT_EVIDENCE_ALREADY_USED' ? 409 : 400
      res.status(status).json({ code: status, message })
    }
  })
})
router.get('/evidence/:id', async (req: AuthRequest, res: Response) => {
  try {
    const record = await getPaymentEvidence(req.params.id, req.user!.storeId)
    if (!record) return res.status(404).json({ code: 404, message: 'Not found' })
    res.setHeader('Content-Type', record.mimeType)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Content-Disposition', 'attachment; filename="payment-evidence"')
    res.send(record.image)
  } catch { res.status(500).json({ code: 500, message: 'Evidence unavailable' }) }
})
router.get('/order/:orderId/evidence', async (req: AuthRequest, res: Response) => {
  try {
    const data = await prisma.paymentEvidence.findFirst({
      where: { orderId: req.params.orderId, storeId: req.user!.storeId }, select: evidenceMetadata
    })
    if (!data) return res.status(404).json({ code: 404, message: 'Not found' })
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ code: 200, data })
  } catch { res.status(500).json({ code: 500, message: 'Evidence unavailable' }) }
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
