/** Both ledger generations represent sales; reversals carry signed quantities/amounts. */
export function isSalesStockOut(log: { type: string; reason?: string }) {
  return log.type === 'stock_out' && ['sold', 'sale_estimate', 'sale_estimate_reversal'].includes(log.reason || '')
}

/** Prefer the frozen operation amount, including explicit zero and signed reversals. */
export function stockLogCost(log: { totalAmount?: number | null; quantity: number; unitCost?: number | null; inventory?: { avgCost?: number } }) {
  return Number(log.totalAmount ?? Math.round(Number(log.quantity || 0) * Number(log.unitCost ?? log.inventory?.avgCost ?? 0)))
}
