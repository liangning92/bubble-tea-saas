/** Cost differences are posted once, in the correction period; order snapshots stay immutable. */
export async function inventoryConsumptionCostAdjustment(db: any, storeId: string, startDate: Date, endDate: Date): Promise<number> {
  const rows = await db.stockOutLog.findMany({ where: { inventory: { storeId }, reason: 'receipt_cost_adjustment', createdAt: { gte: startDate, lte: endDate } }, select: { note: true } })
  return rows.reduce((sum: number, row: any) => {
    const detail = JSON.parse(row.note || '{}'), amount = Number(detail.totalAmount)
    if (detail.kind !== 'receipt-cost-adjustment' || !Number.isFinite(amount)) throw Error('INVALID_INVENTORY_COST_ADJUSTMENT')
    return sum + amount
  }, 0)
}
