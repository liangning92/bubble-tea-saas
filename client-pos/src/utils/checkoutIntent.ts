import { db, type LocalOrder } from '../db/offline'

export interface CheckoutIntent {
  version: 1
  localId: string
  orderId: number
  phase: 'prepared' | 'sent' | 'review'
  request: Record<string, any>
  cart: unknown[]
  createdAt: Date
}
const key = (storeId: string) => `checkout.intent:${encodeURIComponent(storeId)}`
export async function readCheckoutIntent(storeId: string): Promise<CheckoutIntent | null> {
  const entry = await db.config.get(key(storeId))
  if (!entry) return null
  const value = entry.value as CheckoutIntent
  if (value?.version !== 1 || value.request?.storeId !== storeId || !value.localId?.startsWith('LOCAL-') || !Number.isSafeInteger(value.orderId) || value.orderId < 1 ||
      value.request.orderNumber !== `OFFLINE-${value.localId.slice(6)}` || !Array.isArray(value.cart) ||
      !Array.isArray(value.request.items) || !value.request.items.length || value.request.items.some((item: any) => !item || typeof item !== 'object' || (item.addons !== undefined && (!Array.isArray(item.addons) || item.addons.some((addon: any) => !addon || typeof addon !== 'object')))) ||
      !['prepared', 'sent', 'review'].includes(value.phase)) throw new Error('CHECKOUT_RECOVERY_INVALID')
  return value
}

export async function prepareCheckout(request: Record<string, any>, cart: unknown[], totals: Pick<LocalOrder, 'subtotal' | 'ppn' | 'finalAmount'>): Promise<CheckoutIntent> {
  if (!request.storeId || !request.staffId || !request.items?.length) throw new Error('CHECKOUT_REQUEST_INVALID')
  const localId = `LOCAL-${crypto.randomUUID()}`
  const snapshot = JSON.parse(JSON.stringify({ ...request, orderNumber: `OFFLINE-${localId.slice(6)}` }))
  return db.transaction('rw', db.config, db.orders, async () => {
    if ((await readCheckoutRecovery(snapshot.storeId)).blocked) throw new Error('CHECKOUT_REVIEW_REQUIRED')
    const createdAt = new Date()
    const orderId = await db.orders.add({
      localId, checkoutRequest: snapshot, storeId: snapshot.storeId, staffId: snapshot.staffId,
      memberId: snapshot.memberId, channelId: snapshot.channelId, shiftSessionId: snapshot.shiftSessionId,
      items: snapshot.items, ...totals, totalAmount: totals.subtotal,
      discountAmount: snapshot.discountAmount, paymentMethod: snapshot.paymentMethod,
      taxEnabled: snapshot.taxEnabled, pointsRedeemed: snapshot.pointsRedeemed,
      orderNumber: snapshot.orderNumber, pickupNumber: snapshot.pickupNumber,
      customerCount: snapshot.customerCount || 1, status: 'prepared', syncAttempts: 0, createdAt
    }) as number
    const intent: CheckoutIntent = { version: 1, localId, orderId, phase: 'prepared', request: snapshot, cart: JSON.parse(JSON.stringify(cart)), createdAt }
    await db.config.put({ key: key(snapshot.storeId), value: intent, updatedAt: createdAt })
    return intent
  })
}

export async function claimCheckout(intent: CheckoutIntent): Promise<void> {
  await db.transaction('rw', db.config, db.orders, async () => {
    const current = await readCheckoutIntent(intent.request.storeId)
    if (!current || current.localId !== intent.localId || current.phase !== 'prepared') throw new Error('CHECKOUT_REVIEW_REQUIRED')
    const row = await db.orders.get(intent.orderId)
    if (!row || row.status !== 'prepared' || JSON.stringify(row.checkoutRequest) !== JSON.stringify(intent.request)) throw new Error('CHECKOUT_RECOVERY_INVALID')
    await db.orders.update(intent.orderId, { status: 'sending' })
    await db.config.put({ key: key(intent.request.storeId), value: { ...current, phase: 'sent' }, updatedAt: new Date() })
  })
}

export async function finishCheckout(intent: CheckoutIntent, result: 'accepted' | 'rejected' | 'review', serverId?: string): Promise<void> {
  await db.transaction('rw', db.config, db.orders, async () => {
    const current = await readCheckoutIntent(intent.request.storeId)
    if (!current || current.localId !== intent.localId) throw new Error('CHECKOUT_RECOVERY_INVALID')
    const row = await db.orders.get(intent.orderId)
    if (!row || row.localId !== intent.localId || JSON.stringify(row.checkoutRequest) !== JSON.stringify(intent.request)) throw new Error('CHECKOUT_RECOVERY_INVALID')
    const status = result === 'accepted' ? 'synced' : result === 'rejected' ? 'failed' : 'review'
    await db.orders.update(intent.orderId, { status, serverId, checkoutResolution: result, ...(result === 'accepted' ? { syncedAt: new Date() } : {}) })
    if (result === 'review') await db.config.put({ key: key(intent.request.storeId), value: { ...current, phase: 'review' }, updatedAt: new Date() })
    else await db.config.delete(key(intent.request.storeId))
  })
}

/** Prepared has durable evidence that no sender claimed it. Sent/unknown cannot be discarded. */
export async function discardPreparedCheckout(storeId: string): Promise<void> {
  await db.transaction('rw', db.config, db.orders, async () => {
    const current = await readCheckoutIntent(storeId)
    if (!current || current.phase !== 'prepared') throw new Error('CHECKOUT_REVIEW_REQUIRED')
    await db.orders.update(current.orderId, { status: 'failed', checkoutResolution: 'discarded' })
    await db.config.delete(key(storeId))
  })
}

export function definiteFirstRejection(error: any): boolean {
  const status = error?.response?.status
  const message = String(error?.response?.data?.message || '')
  return [400, 401, 403, 404, 422].includes(status) ||
    (status === 409 && ['OPEN_SHIFT_REQUIRED', 'SHIFT_DISABLED', 'PAYMENT_METHOD_DISABLED', 'PAYMENT_CONFIG_UNAVAILABLE'].includes(message))
}

export async function readCheckoutRecovery(storeId: string) {
  const intent = await readCheckoutIntent(storeId)
  const rows = await db.orders.where('status').anyOf('pending', 'syncing', 'sending', 'review', 'failed')
    .and(row => row.storeId === storeId && !['rejected', 'discarded'].includes(row.checkoutResolution || '')).toArray()
  return { intent, blocked: !!intent || rows.length > 0, rows }
}
