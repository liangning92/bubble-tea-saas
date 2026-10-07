import {requireVerifiedReceiptIncome} from './ReceiptFinancialEvidenceService'
import {netReceivedAmount} from '../utils/refundAllocation'
import { randomUUID } from 'crypto'
import prisma from '../config/database'

export type PaymentMethod = 'cash' | 'gopay' | 'ovo' | 'dana' | 'shopeepay' | 'member' | 'bca_va' | 'mandiri_va'

export interface PaymentConfig {
  storeId: string
  provider: string
  merchantId?: string
  apiKey?: string
  isActive: boolean
  feeRate: number
}

export interface CreatePaymentData {
  orderId: string
  method: PaymentMethod
  amount: number
}

export interface PaymentResult {
  success: boolean
  paymentId?: string
  qrCode?: string
  deeplink?: string
  status: string
  message: string
}

// Get available payment methods for a store
export async function getAvailablePayments(storeId: string) {
  const payments = await prisma.config.findMany({
    where: {
      storeId,
      category: 'payment'
    }
  })

  const defaultPayments = [
    { code: 'cash', name: 'Tunai', icon: 'cash', fee: 0 },
    { code: 'gopay', name: 'GoPay', icon: 'gopay', fee: 2.5 },
    { code: 'ovo', name: 'OVO', icon: 'ovo', fee: 2.5 },
    { code: 'dana', name: 'DANA', icon: 'dana', fee: 2.0 },
    { code: 'shopeepay', name: 'ShopeePay', icon: 'sp', fee: 2.0 }
  ]

  // Merge with store-specific configs
  return defaultPayments.map(p => {
    const config = payments.find(pp => pp.key === `payment_${p.code}`)
    return {
      ...p,
      enabled: config ? JSON.parse(config.value).isActive : true,
      customFee: config ? JSON.parse(config.value).feeRate : p.fee
    }
  })
}

// Payment completion requires the order transaction or a verified provider callback.
export async function createPayment(_data:CreatePaymentData):Promise<PaymentResult>{
 return {success:false,status:'unavailable',message:'Use the verified checkout or configured QRIS provider'}
}
export async function simulatePaymentCallback(_paymentId:string,_status:'success'|'failed'){
 throw new Error('SIMULATED_PAYMENT_CALLBACK_DISABLED')
}

// Get payment status
export async function getPaymentStatus(paymentId: string) {
  const payment = await prisma.config.findFirst({
    where: { id: paymentId }
  })

  if (!payment) {
    return { status: 'not_found' }
  }

  const paymentData = JSON.parse(payment.value)
  return {
    paymentId: payment.id,
    orderId: paymentData.orderId,
    method: paymentData.method,
    amount: paymentData.amount,
    status: paymentData.status,
    createdAt: paymentData.createdAt,
    completedAt: paymentData.completedAt
  }
}

// Calculate payment fee
export function calculatePaymentFee(amount: number, method: PaymentMethod): number {
  const feeRates: Record<string, number> = {
    cash: 0,
    member: 0,
    gopay: 0.025,
    ovo: 0.025,
    dana: 0.02,
    shopeepay: 0.02,
    bca_va: 4500,
    mandiri_va: 4500
  }

  const rate = feeRates[method] || 0

  if (rate < 1) {
    // Percentage fee
    return Math.round(amount * rate)
  } else {
    // Fixed fee
    return rate
  }
}

// Get daily payment summary
export async function getPaymentSummary(storeId: string, date: Date) {
  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(date)
  endOfDay.setHours(23, 59, 59, 999)

  const orders = await prisma.order.findMany({
    where: {
      storeId,
      createdAt: { gte: startOfDay, lte: endOfDay },
      status: { in: ['completed', 'paid'] }
    },
    include: {refundRequests:true}
  })
  await requireVerifiedReceiptIncome(orders)

  const summary: Record<string, { count: number; amount: number }> = {}

  orders.forEach(order => {
    if (!summary[order.paymentMethod]) {
      summary[order.paymentMethod] = { count: 0, amount: 0 }
    }
    summary[order.paymentMethod].count++
    summary[order.paymentMethod].amount += netReceivedAmount(order)
  })

  return {
    date: date.toISOString().slice(0, 10),
    totalOrders: orders.length,
    totalAmount: orders.reduce((sum, o) => sum + netReceivedAmount(o), 0),
    byMethod: summary
  }
}

// ============================================
// Xendit QRIS Integration
// ============================================

interface XenditConfig {
  apiKey: string
  enabled: boolean
}

async function getXenditConfig(storeId: string): Promise<XenditConfig | null> {
  const config = await prisma.config.findUnique({
    where: { storeId_key: { storeId, key: 'api.apiSettings' } }
  })
  if (!config) return null
  const settings = JSON.parse(config.value)
  return {
    apiKey: settings.xenditApiKey,
    enabled: settings.xenditEnabled
  }
}

export async function createQrisPayment(storeId: string, orderId: string, amount: number): Promise<{
  success: boolean
  qrString?: string
  qrImage?: string
  externalId?: string
  expiresAt?: string
  error?: string
}> {
  const order = await prisma.order.findUnique({where:{id:orderId}})
  if(!order || order.storeId!==storeId)return {success:false,error:'PAYMENT_ORDER_NOT_FOUND'}
  if(order.finalAmount!==amount || order.paymentMethod!=='qris')return {success:false,error:'PAYMENT_ORDER_MISMATCH'}
  if(order.status!=='pending')return {success:false,error:'PAYMENT_ORDER_STATE_INVALID'}
  const xenditConfig = await getXenditConfig(storeId)
  if (!xenditConfig || !xenditConfig.enabled) {
    return { success: false, error: 'Xendit QRIS not enabled' }
  }

  const externalId = `QRIS2-${randomUUID()}`
  const apiBaseUrl = process.env.API_BASE_URL
  if (!process.env.XENDIT_CALLBACK_TOKEN) return {success:false,error:'XENDIT_CALLBACK_TOKEN environment variable not configured'}
  if (!apiBaseUrl) {
    return { success: false, error: 'API_BASE_URL environment variable not configured' }
  }
  const callbackUrl = `${apiBaseUrl}/api/payments/qris/webhook`

  try {
    const response = await fetch('https://api.xendit.co/qr_codes', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(xenditConfig.apiKey + ':').toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        external_id: externalId,
        type: 'DYNAMIC',
        amount: amount,
        currency: 'IDR',
        callback_url: callbackUrl
      })
    })

    if (!response.ok) {
      const errorData = await response.json() as { message?: string }
      return { success: false, error: errorData.message || 'Failed to create QRIS' }
    }

    const data = await response.json() as {
      external_id: string
      id: string
      qr_string: string
      qr_image: string
      expires_at?: string
    }

    // Save to database
    await prisma.qrisPayment.create({
      data: {
        storeId,
        externalId: data.external_id,
        orderId,
        xenditId: data.id,
        amount,
        status: 'pending',
        qrString: data.qr_string,
        qrImage: data.qr_image,
        expiresAt: data.expires_at ? new Date(data.expires_at) : null
      }
    })

    return {
      success: true,
      qrString: data.qr_string,
      qrImage: data.qr_image,
      externalId: data.external_id,
      expiresAt: data.expires_at
    }
  } catch (error: any) {
    console.error('Xendit QRIS error:', error)
    return { success: false, error: error.message || 'Network error' }
  }
}

export async function handleQrisWebhook(payload: {
  external_id: string
  status: string
  amount?: number
  paid_at?: string
}): Promise<{ success: boolean; orderId?: string }> {
  const { external_id, status } = payload
  const providerStatus = status.toUpperCase()
  const newStatus = ['PAID', 'COMPLETED'].includes(providerStatus) ? 'completed' :
    providerStatus === 'EXPIRED' ? 'expired' : providerStatus === 'FAILED' ? 'failed' : null

  return prisma.$transaction(async (tx) => {
    const payment = await tx.qrisPayment.findUnique({ where: { externalId: external_id } })
    if (!payment) return { success: false }
    if (payload.amount !== undefined && payload.amount !== payment.amount) return { success: false }
    // A settled callback replay must still reconcile a previously linked order.
    if(payment.status==='completed' && newStatus!=='completed')return {success:true,orderId:payment.orderId||undefined}
    // Ignore informational/unrecognized events; never turn them into a failure.
    if (!newStatus) return { success: true }

    const changed = payment.status==='completed' ? {count:1} : await tx.qrisPayment.updateMany({
      where: { id: payment.id, status: payment.status },
      data: { status: newStatus, callbackData: JSON.stringify(payload) }
    })
    // Another callback won. Ask the provider to retry against the new state.
    if (changed.count !== 1) throw new Error('PAYMENT_STATE_CHANGED')

    // POS creates a QR before creating the order. Never interpret its client
    // reference as a database id; only an explicit stored relationship is trusted.
    if (newStatus === 'completed' && payment.orderId) {
      const order = await tx.order.findUnique({ where: { id: payment.orderId } })
      if (!order || order.storeId !== payment.storeId || order.finalAmount !== payment.amount) {
        throw new Error('PAYMENT_ORDER_MISMATCH')
      }
      if (!['pending', 'completed', 'paid'].includes(order.status)) throw new Error('PAYMENT_ORDER_STATE_INVALID')
      if (order.status === 'pending') {
        const updated = await tx.order.updateMany({
          where: { id: order.id, storeId: payment.storeId, status: { in: ['pending'] } },
          data: { status: 'completed' }
        })
        if (updated.count !== 1) throw new Error('PAYMENT_ORDER_STATE_CHANGED')
      }
    }
    return { success: true, orderId: payment.orderId || undefined }
  })
}

export async function getQrisPaymentStatus(externalId: string) {
  const payment = await prisma.qrisPayment.findUnique({
    where: { externalId }
  })

  if (!payment) {
    return { status: 'not_found' }
  }

  return {
    storeId: payment.storeId,
    status: payment.status,
    amount: payment.amount,
    createdAt: payment.createdAt,
    expiresAt: payment.expiresAt
  }
}
