import type { LocalOrder } from '../db/offline'
import { syncOrderNumberPattern } from './orderNumber'

/** A retry is the original transport input, never reconstructed display data. */
export function orderSyncPayload(order: LocalOrder): Record<string, any> {
  const request = order.checkoutRequest
  if (!request || typeof request !== 'object' || request.storeId !== order.storeId ||
      request.orderNumber !== order.orderNumber || !syncOrderNumberPattern.test(order.orderNumber) ||
      !Array.isArray(request.items) || !request.items.length) {
    throw new Error('CHECKOUT_SNAPSHOT_REQUIRED')
  }
  return JSON.parse(JSON.stringify(request))
}
