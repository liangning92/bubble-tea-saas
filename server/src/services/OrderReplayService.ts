import { createHash } from 'crypto'
import prisma from '../config/database'
import type { CreateOrderData, OrderResult } from './OrderService'

export class OrderReplayConflict extends Error {
  constructor(public code: 'ORDER_IDEMPOTENCY_CONFLICT' | 'ORDER_REPLAY_UNVERIFIED' | 'ORDER_STORE_MISMATCH') {
    super(code)
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().filter(k => record[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(record[k])}`).join(',')}}`
}

/** Hash original validated input, never current prices, points or mutable policy. */
export function orderRequestFingerprint(data: CreateOrderData): string {
  const request = {
    storeId: data.storeId, staffId: data.staffId, orderNumber: data.orderNumber ?? null,
    channelId: data.channelId ?? null, memberId: data.memberId ?? null,
    pickupNumber: data.pickupNumber ?? null, channelName: data.channelName ?? null,
    shiftSessionId: data.shiftSessionId ?? null, dineInCount: data.dineInCount ?? null, customerCount: data.customerCount ?? 1,
    discountAmount: data.discountAmount ?? 0, pointsRedeemed: data.pointsRedeemed ?? 0,
    taxEnabled: data.taxEnabled ?? true, paymentMethod: data.paymentMethod,
    status: data.status ?? 'completed', platformOrderId: data.platformOrderId ?? null,
    tableNumber: data.tableNumber ?? null, callerPhone: data.callerPhone ?? null,
    driverPickupTime: data.driverPickupTime ? new Date(data.driverPickupTime).toISOString() : null,
    purchaseOrderNo: data.purchaseOrderNo ?? null, socialRef: data.socialRef ?? null, note: data.note ?? null,
    ...(data.qrisExternalId !== undefined ? {qrisExternalId:data.qrisExternalId} : {}),
    ...(data.paymentEvidenceId !== undefined ? {paymentEvidenceId:data.paymentEvidenceId} : {}),
    ...(data.activityOfflineToken?{activityOfflineToken:data.activityOfflineToken,activityOccurredAt:data.activityOccurredAt,activityChannelCode:data.activityChannelCode}:{}),
    ...(data.activityQuoteSignature ? {activityQuoteSignature:data.activityQuoteSignature,activityCouponId:data.activityCouponId,activityPointsRequested:data.activityPointsRequested,activityGroupId:data.activityGroupId,activityGiftSelections:data.activityGiftSelections} : {}),
    items: data.items.map(item => ({ productId: item.productId, productName: item.productName,
      specId: item.specId, specName: item.specName, quantity: item.quantity, unitPrice: item.unitPrice,
      addons: (item.addons ?? []).map(addon => ({ name: addon.name, price: addon.price,...(addon.qty!==undefined?{qty:addon.qty}:{}) })) }))
  }
  return 'v1:' + createHash('sha256').update(canonical(request)).digest('hex')
}

export function publicOrder<T extends object>(order: T): Omit<T, 'requestFingerprint' | 'requestReceipt' | 'replayed' | 'replayedBy'> {
  const { requestFingerprint: _fingerprint, requestReceipt: _receipt, replayed: _replayed, replayedBy: _replayedBy, ...result } = order as T & { requestFingerprint?: string | null; requestReceipt?: string | null; replayed?:boolean; replayedBy?:string }
  return result
}

export function encodeOrderReceipt(data: CreateOrderData, response: OrderResult): string {
  return JSON.stringify({ version: 1, requestFingerprint: orderRequestFingerprint(data),
    storeId: data.storeId, orderNumber: response.orderNumber, response: publicOrder(response) })
}

export async function findOrderReplay(data: CreateOrderData): Promise<OrderResult | null> {
  if (!data.orderNumber || /^[A-Z]\d{2,4}$/i.test(data.orderNumber)) return null
  const existing = await prisma.order.findUnique({ where: { orderNumber: data.orderNumber },
    select: { id: true, storeId: true, orderNumber: true, requestFingerprint: true, requestReceipt: true } })
  if (!existing) return null
  if (existing.storeId !== data.storeId) throw new OrderReplayConflict('ORDER_STORE_MISMATCH')
  if (!existing.requestFingerprint || !existing.requestReceipt) throw new OrderReplayConflict('ORDER_REPLAY_UNVERIFIED')
  const fingerprint = orderRequestFingerprint(data)
  if (fingerprint !== existing.requestFingerprint) throw new OrderReplayConflict('ORDER_IDEMPOTENCY_CONFLICT')
  let receipt: any
  try { receipt = JSON.parse(existing.requestReceipt) } catch { throw new OrderReplayConflict('ORDER_REPLAY_UNVERIFIED') }
  const response = receipt?.response
  if (receipt.version !== 1 || receipt.requestFingerprint !== fingerprint || receipt.storeId !== data.storeId ||
      receipt.orderNumber !== existing.orderNumber || response?.id !== existing.id || response?.orderNumber !== existing.orderNumber ||
      !Number.isSafeInteger(response.totalAmount) || !Number.isSafeInteger(response.ppnAmount) || !Number.isSafeInteger(response.grandTotal) ||
      !Array.isArray(response.items) || typeof response.createdAt !== 'string' || !Number.isFinite(Date.parse(response.createdAt))) {
    throw new OrderReplayConflict('ORDER_REPLAY_UNVERIFIED')
  }
  // Keep the service's existing Date contract; JSON HTTP serialization is identical.
  return { ...response, createdAt: new Date(response.createdAt) }
}
