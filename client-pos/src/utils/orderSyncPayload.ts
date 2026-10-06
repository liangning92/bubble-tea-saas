import type { LocalOrder } from '../db/offline'

/** A retry is the original transport input, never reconstructed display data. */
export function orderSyncPayload(order: LocalOrder): Record<string, any> {
  const request = order.checkoutRequest
  if (!request || typeof request !== 'object' || request.storeId !== order.storeId ||
      request.orderNumber !== order.orderNumber || !/^OFFLINE-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(order.orderNumber) ||
      !Array.isArray(request.items) || !request.items.length) {
    throw new Error('CHECKOUT_SNAPSHOT_REQUIRED')
  }
  return JSON.parse(JSON.stringify(request))
}
