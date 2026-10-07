export type RefundReasonCode = 'customer_dissatisfied' | 'paid_unprepared'
export function validateRefundItems(orderItemIds: string[], selectedItemIds: unknown): string[] {
  if (!Array.isArray(selectedItemIds) || selectedItemIds.length === 0 || selectedItemIds.some(id => typeof id !== 'string' || !orderItemIds.includes(id)) || new Set(selectedItemIds).size !== selectedItemIds.length) throw new Error('INVALID_REFUND_ITEMS')
  return selectedItemIds
}
export function validateRefundApproval(request: {reasonCode: string; selectedItemIds: string; amount: number}, order: {items: {id:string}[]; finalAmount:number}, role: string, verifiedPrepared: boolean, verifiedUnprepared = false) {
  if (request.reasonCode === 'paid_unprepared') {
    if (role !== 'admin') throw new Error('ADMIN_APPROVAL_REQUIRED')
    if (!verifiedUnprepared) throw new Error('REFUND_CLASSIFICATION_REQUIRED')
  }
  if (request.reasonCode !== 'paid_unprepared' && (request.reasonCode !== 'customer_dissatisfied' || !verifiedPrepared)) throw new Error('REFUND_CLASSIFICATION_REQUIRED')
  let selected: unknown
  try { selected = JSON.parse(request.selectedItemIds) } catch { throw new Error('INVALID_REFUND_ITEMS') }
  const itemIds = validateRefundItems(order.items.map(item => item.id), selected)
  if (itemIds.length !== order.items.length || (request.amount !== 0 && request.amount !== order.finalAmount)) throw new Error('PARTIAL_REFUND_POLICY_REQUIRED')
}
