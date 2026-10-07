import { assertCheckoutBackend, assertBackendAuth, currentBackendIdentity } from './backendIdentity'
import { db, type LocalOrder } from '../db/offline'
import { withCheckoutSyncLock } from './checkoutSyncClaim'

export interface CheckoutIntent {
  version: 1
  localId: string
  orderId: number
  backendUrl?: string
  phase: 'prepared' | 'sent' | 'review'
  request: Record<string, any>
  cart: unknown[]
  createdAt: Date
}
const key = (storeId: string) => `checkout.intent:${encodeURIComponent(storeId)}`
const generationKey = (storeId: string) => `checkout.generation:${encodeURIComponent(storeId)}`
export async function readCheckoutGeneration(storeId: string): Promise<string> {
  const entry = await db.config.get(generationKey(storeId))
  if (!entry) return '0'
  if (typeof entry.value !== 'string' || !entry.value) throw new Error('CHECKOUT_RECOVERY_INVALID')
  return entry.value
}
async function advanceCheckoutGeneration(storeId: string): Promise<void> {
  await db.config.put({key:generationKey(storeId),value:crypto.randomUUID(),updatedAt:new Date()})
}
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

export async function prepareCheckout(request: Record<string, any>, cart: unknown[], totals: Pick<LocalOrder, 'subtotal' | 'ppn' | 'finalAmount'>, basketGeneration = '0'): Promise<CheckoutIntent> {
  if (!request.storeId || !request.staffId || !request.items?.length) throw new Error('CHECKOUT_REQUEST_INVALID')
  const backendUrl = currentBackendIdentity()
  assertBackendAuth(backendUrl, request.storeId)
  const localId = `LOCAL-${crypto.randomUUID()}`
  const snapshot = JSON.parse(JSON.stringify({ ...request, orderNumber: `OFFLINE-${localId.slice(6)}` }))
  return db.transaction('rw', db.config, db.orders, async () => {
    const recovery = await readCheckoutRecovery(snapshot.storeId)
    if (recovery.generation !== basketGeneration) throw new Error('CHECKOUT_BASKET_STALE')
    if (recovery.blocked || recovery.confirmed.length) throw new Error('CHECKOUT_REVIEW_REQUIRED')
    const createdAt = new Date()
    const orderId = await db.orders.add({
      localId, backendUrl, checkoutRequest: snapshot, storeId: snapshot.storeId, staffId: snapshot.staffId,
      memberId: snapshot.memberId, channelId: snapshot.channelId, shiftSessionId: snapshot.shiftSessionId,
      items: snapshot.items, ...totals, totalAmount: totals.subtotal,
      discountAmount: snapshot.discountAmount, paymentMethod: snapshot.paymentMethod,
      taxEnabled: snapshot.taxEnabled, pointsRedeemed: snapshot.pointsRedeemed,
      orderNumber: snapshot.orderNumber, pickupNumber: snapshot.pickupNumber,
      customerCount: snapshot.customerCount || 1, status: 'prepared', syncAttempts: 0, createdAt
    }) as number
    const intent: CheckoutIntent = { version: 1, localId, orderId, backendUrl, phase: 'prepared', request: snapshot, cart: JSON.parse(JSON.stringify(cart)), createdAt }
    await db.config.put({ key: key(snapshot.storeId), value: intent, updatedAt: createdAt })
    return intent
  })
}

export async function claimCheckout(intent: CheckoutIntent): Promise<void> {
  assertCheckoutBackend(intent.backendUrl, intent.request.storeId)
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
    else {
      await db.config.delete(key(intent.request.storeId))
      if (result === 'accepted') await advanceCheckoutGeneration(intent.request.storeId)
    }
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

export function definiteFirstRejection(error: any, orderNumber?: string): boolean {
  const status = error?.response?.status
  const message = String(error?.response?.data?.message || '')
  if (status === 409 && orderNumber && error.response.data?.rejection?.code === 'INVENTORY_INSUFFICIENT' &&
      error.response.data.rejection.outcome === 'not_committed' && error.response.data.rejection.orderNumber === orderNumber) return true
  return [400, 401, 403, 404, 422].includes(status) ||
    (status === 409 && ['OPEN_SHIFT_REQUIRED', 'SHIFT_DISABLED', 'PAYMENT_METHOD_DISABLED', 'PAYMENT_CONFIG_UNAVAILABLE'].includes(message))
}

export async function readCheckoutRecovery(storeId: string) {
  const intent = await readCheckoutIntent(storeId)
  const rows = await db.orders.where('status').anyOf('pending', 'syncing', 'sending', 'review', 'failed')
    .and(row => row.storeId === storeId && !['rejected', 'discarded'].includes(row.checkoutResolution || '')).toArray()
  const confirmed = await db.orders.where('status').equals('synced').and(row => row.storeId === storeId && !!row.recoveredConfirmation && !row.recoveryAcknowledged).toArray()
  const quarantined = await db.orders.where('status').equals('quarantined').and(row => row.storeId === storeId).toArray()
  return { intent, blocked: !!intent || rows.length > 0, rows, confirmed, quarantined, generation:await readCheckoutGeneration(storeId) }
}

/** A fresh successful response confirms this original UUID; it does not certify legacy replay. */
export async function confirmRetriedCheckout(order: LocalOrder, server: {id: string; orderNumber: string; grandTotal?: number; [field: string]: unknown}): Promise<void> {
  await db.transaction('rw', db.config, db.orders, async () => {
    const row = await db.orders.get(order.id!)
    if (!row || row.status !== 'syncing' || !order.syncClaim || row.syncClaim?.id !== order.syncClaim.id || server.orderNumber !== row.orderNumber || JSON.stringify(row.checkoutRequest) !== JSON.stringify(order.checkoutRequest)) throw new Error('CHECKOUT_RECOVERY_INVALID')
    if (row.locallyAcceptedAt && !Number.isSafeInteger(server.grandTotal)) throw new Error('CHECKOUT_RESPONSE_UNVERIFIED')
    const amountMismatch = !!row.locallyAcceptedAt && server.grandTotal !== row.finalAmount
    const active = await db.config.get(key(row.storeId))
    if (active?.value.localId === row.localId) {
      if (JSON.stringify(active.value.request) !== JSON.stringify(row.checkoutRequest)) throw new Error('CHECKOUT_RECOVERY_INVALID')
      await db.config.delete(key(row.storeId))
    }
    if (!row.locallyAcceptedAt) await advanceCheckoutGeneration(row.storeId)
    await db.orders.update(row.id!, {status:amountMismatch ? 'review' : 'synced', checkoutResolution:'accepted', serverId:server.id, cloudReceipt:JSON.parse(JSON.stringify(server)), syncedAt:new Date(), ...(row.locallyAcceptedAt ? {} : {recoveredConfirmation:{serverId:server.id,orderNumber:server.orderNumber,receivedAt:new Date()}}), error:amountMismatch ? 'CHECKOUT_AMOUNT_RECONCILIATION_REQUIRED' : undefined})
  })
}

/** An acknowledgement of a verified 201 starts an EMPTY next basket, not another charge for the saved one. */
export async function acknowledgeRecoveredCheckout(storeId: string, actorId: string): Promise<void> {
  if (!actorId) throw new Error('CHECKOUT_ACTOR_REQUIRED')
  await db.transaction('rw', db.config, db.orders, async () => {
    const recovery = await readCheckoutRecovery(storeId)
    if (recovery.blocked || !recovery.confirmed.length) throw new Error('CHECKOUT_REVIEW_REQUIRED')
    for (const row of recovery.confirmed) await db.orders.update(row.id!, {recoveryAcknowledged:{actorId,at:new Date()}})
  })
}

/** Quarantine is NOT a paid/unpaid decision. Keep all evidence and forbid automatic resubmission. */
export async function quarantineCheckoutRecovery(storeId: string, actorId: string, expected: string): Promise<void> {
  if (!actorId) throw new Error('CHECKOUT_ACTOR_REQUIRED')
  await withCheckoutSyncLock(storeId, () => db.transaction('rw', db.config, db.orders, async () => {
    const recovery = await readCheckoutRecovery(storeId)
    if (recovery.confirmed.length || !recovery.blocked || (!navigator.locks && recovery.rows.some(row => row.status === 'syncing' && row.syncClaim && row.syncClaim.expiresAt > Date.now()))) throw new Error('CHECKOUT_REVIEW_REQUIRED')
    if (JSON.stringify({intent:recovery.intent?.localId,rows:recovery.rows.map(row=>[row.id,row.localId,row.status])}) !== expected) throw new Error('CHECKOUT_REVIEW_REQUIRED')
    const audit = {actorId,at:new Date(),decision:'isolate_unknown_not_paid_or_unpaid',intent:recovery.intent,rows:recovery.rows}
    await db.config.add({key:`checkout.quarantine:${encodeURIComponent(storeId)}:${crypto.randomUUID()}`,value:audit,updatedAt:new Date()})
    for (const row of recovery.rows) await db.orders.update(row.id!, {status:'quarantined',quarantineAudit:{actorId,at:audit.at}})
    await advanceCheckoutGeneration(storeId)
    await db.config.delete(key(storeId))
  }))
}
