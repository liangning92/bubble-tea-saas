// Report recorded transactions only. Related order revenue is attribution, not incremental ROI.
export function summarizeActivityPerformance(activities: any[], snapshots: any[], orders: any[], grants: any[]) {
  const rows = new Map<string, any>()
  const ensure = (id: string, name = id) => {
    if (!rows.has(id)) rows.set(id, { id, name, orderCount: 0, paidAmount: 0, refundedAmount: 0, discountAmount: 0, rewardCount: 0, fulfilled: 0, pending: 0, needsAttention: 0 })
    return rows.get(id)
  }
  activities.forEach(activity => Object.assign(ensure(activity.id, activity.name), { type: activity.type, categoryId: activity.categoryId }))
  const orderMap = new Map(orders.map(order => [order.id, order]))
  const grantsByOrder = new Map<string, any[]>()
  for (const grant of grants) {
    if (!orderMap.has(grant.orderId)) continue
    const row = ensure(grant.activityId, grant.plan?.activity?.name)
    row.rewardCount++
    if (grant.status === 'fulfilled') row.fulfilled++
    if (['pending','ready'].includes(grant.status)) row.pending++
    if (['manual_review','unavailable'].includes(grant.status)) row.needsAttention++
    grantsByOrder.set(grant.orderId, [...(grantsByOrder.get(grant.orderId) || []), grant])
  }
  const seen = new Set<string>()
  const summary = { orderCount: 0, paidAmount: 0, refundedAmount: 0, discountAmount: 0 }
  for (const snapshot of snapshots) {
    const order = orderMap.get(snapshot.orderId)
    if (!order || seen.has(order.id)) continue
    seen.add(order.id)
    const ids = new Set<string>((grantsByOrder.get(order.id) || []).map(grant => grant.activityId))
    if (snapshot.applied?.kind === 'activity') ids.add(snapshot.applied.id)
    if (!ids.size) continue
    const refundTotal = (order.refundRequests || []).filter((refund: any) => refund.status === 'approved').reduce((sum: number, refund: any) => sum + refund.amount, 0)
    // Old full refunds can predate refund requests. Exclude their order value from net sales.
    const refunded = Math.min(order.finalAmount, order.status === 'refunded' && !refundTotal ? order.finalAmount : refundTotal)
    const paid = Math.max(0, order.finalAmount - refunded)
    const discount = snapshot.applied?.kind === 'activity' ? snapshot.applied.discount || 0 : 0
    summary.orderCount++; summary.paidAmount += paid; summary.refundedAmount += refunded; summary.discountAmount += discount
    for (const id of ids) {
      const row = ensure(id, snapshot.applied?.id === id ? snapshot.applied.name : id)
      row.orderCount++; row.paidAmount += paid; row.refundedAmount += refunded
      if (snapshot.applied?.id === id) row.discountAmount += discount
    }
  }
  return { summary, activities: [...rows.values()] }
}
