// Compare immutable synced receipts without relying on object key or line order.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}
function addons(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? []
  try { return JSON.parse(value) } catch { return value }
}
export function orderSnapshot(order: Record<string, unknown>): string {
  const pick = (keys: string[]) => Object.fromEntries(keys.map(key => [key, order[key] ?? null]))
  return canonical({
    ...pick(['storeId','orderNumber','staffId','memberId','channelId','paymentMethod','totalAmount','finalAmount']),
    status: order.status ?? 'completed', discountAmount: order.discountAmount ?? 0,
    customerCount: order.customerCount ?? 1,
    items: (Array.isArray(order.items) ? order.items : []).map((item: Record<string, unknown>) => canonical({
      productId:item.productId, productName:item.productName, specId:item.specId,
      specName:item.specName, quantity:item.quantity, unitPrice:item.unitPrice,
      addons:addons(item.addons), bomCost:item.bomCost ?? 0
    })).sort()
  })
}

export function saleLines(items: Array<{ productId: string; specId?: string; quantity: number; unitPrice: number; addons?: unknown }>): string {
  return canonical(items.map(item => canonical({ productId: item.productId, specId: item.specId ?? null,
    quantity: item.quantity, unitPrice: item.unitPrice, addons: addons(item.addons) })).sort())
}
