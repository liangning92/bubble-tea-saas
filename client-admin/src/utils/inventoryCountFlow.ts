export const countStatuses = ['all', 'in_progress', 'pending_review', 'completed', 'cancelled', 'adjustments'] as const
export type CountStatusFilter = typeof countStatuses[number]
export function countStatusFilter(value: string | null): CountStatusFilter {
  return countStatuses.includes(value as CountStatusFilter) ? value as CountStatusFilter : 'all'
}
export function countDetailUrl(countId: string, itemId?: string) {
  const query = new URLSearchParams({ countId })
  if (itemId) query.set('itemId', itemId)
  return '/inventory/count?' + query.toString()
}

/** Preserve the structured count reference before replacing the display note. */
export function inventoryLogDisplay(log: any) {
  let data: any
  try { data = typeof log.note === 'string' ? JSON.parse(log.note) : null } catch { data = null }
  const isCount = log.reason === 'count_adjustment'
  const countId = isCount && typeof data?.countId === 'string' && data.countId ? data.countId : undefined
  const countItemId = countId && typeof data?.countItemId === 'string' ? data.countItemId : undefined
  const note = isCount && typeof data?.reason === 'string' ? data.reason
    : typeof data?.note === 'string' ? data.note : typeof data?.orderNumber === 'string' ? data.orderNumber : log.note
  const quantity = typeof log.quantity === 'number' ? log.quantity
    : typeof log.quantity === 'string' && log.quantity.trim() ? Number(log.quantity) : NaN
  return { ...log, note, countId, countItemId,
    staffId: isCount && typeof data?.actor === 'string' ? data.actor : log.staffId,
    stockDelta: Number.isFinite(quantity) ? (quantity === 0 ? 0 : log.type === 'stock_in' ? quantity : -quantity) : null,
    adjustmentValue: isCount && typeof data?.varianceAmountEstimate === 'number' && Number.isFinite(data.varianceAmountEstimate) ? data.varianceAmountEstimate : undefined
  }
}

export function isInventoryAdjustment(log: any) {
  return log.reason === 'count_adjustment' || log.reason === 'adjust' || log.type === 'adjustment'
    || (typeof log.note === 'string' && /^Adjustment:/i.test(log.note))
}
