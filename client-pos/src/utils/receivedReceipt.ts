import { db } from '../db/offline'
import { posApi } from '../services/api'
import type { CheckoutIntent } from './checkoutIntent'
import { assertCheckoutBackend, currentBackendIdentity, readBackendAuth } from './backendIdentity'

/** A cashier's payment report is retained separately from order admission and bank verification. */
export async function reportReceivedPayment(intent:CheckoutIntent, grandTotal:number, cashTender?:{receivedCash:number;changeGiven:number}) {
  const row = await db.orders.get(intent.orderId)
  if (!row || row.localId !== intent.localId || row.status !== 'sending') throw new Error('CHECKOUT_RECOVERY_INVALID')
  const occurredAt = row.paymentReportedAt || new Date()
  await db.orders.update(row.id!,{paymentReportedAt:occurredAt,occurredAt,cashTender})
  // Local payment evidence is durable before order admission. Its independent
  // backend review copy must never prevent an otherwise valid order/receipt.
  void posApi.retainReceivedReceipt({orderNumber:intent.request.orderNumber,occurredAt:occurredAt.toISOString(),grandTotal,cashTender,request:intent.request},intent.backendUrl).then(async response=>{
    if (!response.data?.data?.id || response.data.data.orderNumber!==intent.request.orderNumber) throw new Error('RECEIVED_RECEIPT_SAVE_FAILED')
    await db.orders.update(row.id!,{cloudJournalId:response.data.data.id})
  }).catch(error=>console.warn('[POS Backend Review Copy]',error?.code || error?.message))
}

const reviewTransfers = new Map<string,Promise<void>>()
/** Upload receipt evidence only. Never POST an order or decide whether money was paid. */
export function syncBackendCheckoutReviews(): Promise<void> {
  if (!navigator.onLine) return Promise.resolve()
  const auth = readBackendAuth()
  if (!auth.token || !auth.user?.storeId || !auth.user.id) return Promise.resolve()
  const backend = currentBackendIdentity()
  const key = `${backend}:${auth.user.storeId}:${auth.user.id}`
  const active = reviewTransfers.get(key)
  if (active) return active
  const task = (async()=>{
    const rows = await db.orders.where('status').anyOf('quarantined').and(row=>row.storeId===auth.user!.storeId && row.backendUrl===backend && !!row.paymentReportedAt && !row.cloudJournalId && !row.backendReviewRejectedAt && !!row.checkoutRequest).limit(10).toArray()
    for (const row of rows) {
      const current = readBackendAuth()
      if (current.token!==auth.token || current.user?.id!==auth.user!.id || current.user?.storeId!==auth.user!.storeId || currentBackendIdentity()!==backend) return
      assertCheckoutBackend(row.backendUrl,row.storeId)
      try {
        const response = await posApi.retainReceivedReceipt({orderNumber:row.orderNumber,occurredAt:new Date(row.occurredAt || row.paymentReportedAt!).toISOString(),grandTotal:row.finalAmount,cashTender:row.cashTender,request:row.checkoutRequest},row.backendUrl)
        if (!response.data?.data?.id || response.data.data.orderNumber!==row.orderNumber) throw Error('RECEIVED_RECEIPT_SAVE_FAILED')
        await db.orders.update(row.id!,{cloudJournalId:response.data.data.id})
      } catch (error: any) {
        const status = error?.response?.status
        if (![400,409,422].includes(status)) throw error
        // An invalid old record must not hold newer evidence behind it. Keep
        // the original and its reported failure for backend investigation.
        await db.orders.update(row.id!,{backendReviewRejectedAt:new Date(),backendReviewError:String(error?.response?.data?.message || error?.message).slice(0,200)})
      }
    }
  })().finally(()=>reviewTransfers.delete(key))
  reviewTransfers.set(key,task)
  return task
}
