import { db } from '../db/offline'
import { posApi } from '../services/api'
import type { CheckoutIntent } from './checkoutIntent'

/** A cashier's payment report is retained separately from order admission and bank verification. */
export async function reportReceivedPayment(intent:CheckoutIntent, grandTotal:number, cashTender?:{receivedCash:number;changeGiven:number}) {
  const row = await db.orders.get(intent.orderId)
  if (!row || row.localId !== intent.localId || row.status !== 'sending') throw new Error('CHECKOUT_RECOVERY_INVALID')
  const occurredAt = row.paymentReportedAt || new Date()
  await db.orders.update(row.id!,{paymentReportedAt:occurredAt,occurredAt,cashTender})
  const response = await posApi.retainReceivedReceipt({orderNumber:intent.request.orderNumber,occurredAt:occurredAt.toISOString(),grandTotal,cashTender,request:intent.request},intent.backendUrl)
  if (!response.data?.data?.id || response.data.data.orderNumber!==intent.request.orderNumber) throw new Error('RECEIVED_RECEIPT_SAVE_FAILED')
  await db.orders.update(row.id!,{cloudJournalId:response.data.data.id})
}
