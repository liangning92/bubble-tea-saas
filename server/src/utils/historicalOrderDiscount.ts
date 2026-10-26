// Recover provenance only from the server's sale-time quote, never today's activity rules.
export function historicalOrderDiscount(order: { totalAmount: number; discountAmount: number; finalAmount: number; checkoutTaxAmount?: number | null }, snapshot: any) {
  const applied = snapshot?.applied
  if (!applied || !['activity', 'coupon', 'points'].includes(applied.kind) ||
      !Number.isSafeInteger(applied.discount) || applied.discount <= 0 ||
      typeof applied.id !== 'string' || typeof applied.name !== 'string' || !Array.isArray(snapshot.items)) return null
  let subtotal = 0
  for (const item of snapshot.items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || !Number.isSafeInteger(item.unitPrice) || item.unitPrice < 0) return null
    let addons = 0
    for (const addon of item.addons || []) {
      const qty = addon.qty ?? 1
      if (!Number.isSafeInteger(addon.price) || addon.price < 0 || !Number.isSafeInteger(qty) || qty <= 0) return null
      addons += addon.price * qty
    }
    subtotal += item.quantity * (item.unitPrice + addons)
  }
  if (subtotal !== order.totalAmount || snapshot.paidAmount !== subtotal - applied.discount) return null
  const automatic = applied.kind === 'points' ? 0 : applied.discount
  const points = applied.kind === 'points' ? applied.discount : 0
  if (!Number.isSafeInteger(order.discountAmount) || order.discountAmount < automatic || order.discountAmount + points > subtotal) return null
  if (Number.isSafeInteger(order.checkoutTaxAmount) && order.finalAmount !== subtotal - order.discountAmount - points + order.checkoutTaxAmount!) return null
  return {
    activityDiscountAmount: applied.kind === 'activity' ? applied.discount : 0,
    couponDiscountAmount: applied.kind === 'coupon' ? applied.discount : 0,
    pointsDiscountAmount: points,
    manualDiscountAmount: order.discountAmount - automatic,
    activityId: applied.id, activityName: applied.name, activitySource: applied.kind
  }
}
