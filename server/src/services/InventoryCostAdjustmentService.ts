/** Non-cash consumption value corrections, posted in the correction period. */
export async function inventoryConsumptionCostEntries(db: any, storeId: string, startDate: Date, endDate: Date): Promise<Array<{amount:number;at:Date}>> {
  const rows = await db.stockOutLog.findMany({ where: { inventory: { storeId }, reason: 'receipt_cost_adjustment', createdAt: { gte: startDate, lte: endDate } }, select: { note: true, createdAt: true } })
  return rows.map((row: any) => {
    const detail = JSON.parse(row.note || '{}'), amount = Number(detail.totalAmount)
    if (detail.kind !== 'receipt-cost-adjustment' || !Number.isFinite(amount)) throw Error('INVALID_INVENTORY_COST_ADJUSTMENT')
    return { amount, at: row.createdAt }
  })
}
/** Order snapshots stay immutable; aggregate totals include the signed adjustment once. */
export async function inventoryConsumptionCostAdjustment(db: any, storeId: string, startDate: Date, endDate: Date): Promise<number> {
  return (await inventoryConsumptionCostEntries(db, storeId, startDate, endDate)).reduce((sum, entry) => sum + entry.amount, 0)
}
