type Log = { action: string; entityId?: string | null; metadata?: string | null; createdAt: Date }
export type CartLine = { id: string; productName: string; specName: string; options: string; quantity: number; unitPrice: number | null; lineTotal: number | null; addons: { name: string; quantity?: number }[] }
const amount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const quantity = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const metadata = (log: Log): any => { try { return JSON.parse(log.metadata || '{}') } catch { return {} } }
function snapshot(value: any): CartLine[] | null {
  if (value?.version !== 1 || !Array.isArray(value.items) || !amount(value.subtotal)) return null
  const items: CartLine[] = []
  for (const item of value.items) {
    if (typeof item.id !== 'string' || typeof item.productName !== 'string' || !item.productName || typeof item.specName !== 'string' || !quantity(item.quantity) || !amount(item.unitPrice) || !amount(item.lineTotal) || item.lineTotal !== item.unitPrice * item.quantity || !Array.isArray(item.addons) || item.addons.some((a: any) => typeof a.name !== 'string' || !quantity(a.quantity))) return null
    items.push({ id: item.id, productName: item.productName, specName: item.specName, options: typeof item.options === 'string' ? item.options : '', quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal, addons: item.addons.map((a: any) => ({ name: a.name, quantity: a.quantity })) })
  }
  if (value.subtotal !== items.reduce((sum, item) => sum + item.lineTotal!, 0)) return null
  return items
}
/** Replay only a single authenticated store/staff/session's timeline. Never look up today's catalogue prices for old cart records. */
export function projectCartState(logs: Log[]) {
  let items: CartLine[] = []
  let detailSource: 'snapshot' | 'legacy' | 'unavailable' = 'legacy'
  let unknownCount = 0
  for (const log of logs) {
    const meta = metadata(log)
    if (Object.prototype.hasOwnProperty.call(meta, 'cartSnapshot')) {
      const parsed = snapshot(meta.cartSnapshot)
      const previousCount = items.reduce((sum, item) => sum + item.quantity, 0) + unknownCount
      items = parsed || []
      unknownCount = parsed ? 0 : previousCount
      detailSource = parsed ? 'snapshot' : 'unavailable'
    } else if (['checkout_complete', 'suspend', 'cart_clear'].includes(log.action)) {
      items = []; unknownCount = 0; detailSource = 'legacy'
    } else if (log.action === 'cart_add') {
      detailSource = 'legacy'
      const qty = quantity(meta.quantity) ? meta.quantity : 1
      if (typeof meta.productName !== 'string' || !meta.productName) { unknownCount += qty; continue }
      const addons = Array.isArray(meta.addons) ? meta.addons.filter((a: unknown) => typeof a === 'string').map((name: string) => ({ name })) : []
      const unitPrice = amount(meta.unitPrice) ? meta.unitPrice : null
      items.push({ id: log.entityId || String(items.length), productName: meta.productName, specName: typeof meta.specName === 'string' ? meta.specName : '', options: '', quantity: qty, unitPrice, lineTotal: unitPrice === null ? null : unitPrice * qty, addons })
    } else if (['cart_update', 'resume'].includes(log.action)) {
      // Old clients did not retain mutation details: do not certify an earlier list as current.
      unknownCount = quantity(meta.itemCount) ? meta.itemCount : items.reduce((sum, item) => sum + item.quantity, 0) + unknownCount; items = []; detailSource = 'unavailable'
    }
  }
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0) + unknownCount
  const completePrices = !unknownCount && items.every(item => item.lineTotal !== null && (detailSource === 'snapshot' || item.addons.length === 0))
  return { items, itemCount, detailSource, detailsComplete: unknownCount === 0 && detailSource !== 'unavailable', subtotal: completePrices ? items.reduce((sum, item) => sum + item.lineTotal!, 0) : null }
}
