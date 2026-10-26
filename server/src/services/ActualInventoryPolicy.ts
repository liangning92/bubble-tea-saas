/** Versioned cutover: historical estimates stay evidence, never silently restored. */
export const ACTUAL_STOCK_KEY = 'inventory_actual_out_v2'
export const ACTUAL_CALIBRATED_PREFIX = 'inventory_actual_calibrated_v2:'
export async function actualInventorySince(db: any, storeId: string): Promise<Date | null> {
  const row = await db.config.findUnique({where:{storeId_key:{storeId,key:ACTUAL_STOCK_KEY}}})
  if (!row) return null
  const date = new Date(row.value)
  if (!Number.isFinite(date.getTime())) throw Error('INVALID_INVENTORY_POLICY')
  return date
}
