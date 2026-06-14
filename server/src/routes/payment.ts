import { Router, Request, Response } from 'express'
import { createQrisPayment, handleQrisWebhook, getQrisPaymentStatus } from '../services/PaymentService'
import { z } from 'zod'

const router = Router()

// Create QRIS payment
router.post('/qris/create', async (req: Request, res: Response) => {
  try {
    const { storeId, orderId, amount } = req.body

    if (!storeId || !orderId || !amount) {
      return res.status(400).json({ error: 'Missing required fields' })
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
    const payload = req.body
    console.log('QRIS webhook received:', payload)

    const result = await handleQrisWebhook({
      external_id: payload.external_id,
      status: payload.status,
      amount: payload.amount,
      paid_at: payload.paid_at
    })

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
router.get('/qris/status/:externalId', async (req: Request, res: Response) => {
  try {
    const { externalId } = req.params
    const status = await getQrisPaymentStatus(externalId)
    res.json(status)
  } catch (error: any) {
    console.error('Get QRIS status error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router