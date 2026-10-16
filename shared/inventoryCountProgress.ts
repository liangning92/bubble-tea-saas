export type CountProgressItem = { countedQty?: number | null; systemQty: number; variance?: number | null }
// A persisted zero is an observation. A blank or invalid value is never one.
export const isCounted = (item: CountProgressItem) => typeof item.countedQty === 'number' && Number.isFinite(item.countedQty) && item.countedQty >= 0
export const hasCountVariance = (item: CountProgressItem) => isCounted(item) && Math.round((item.countedQty! - item.systemQty) * 1e9) !== 0
export type CountItemFilter = 'all' | 'pending' | 'counted' | 'difference'
export const matchesCountFilter = (item: CountProgressItem, filter: CountItemFilter) => filter === 'all' || (filter === 'pending' ? !isCounted(item) : filter === 'counted' ? isCounted(item) : hasCountVariance(item))
export function countProgress(items: CountProgressItem[]) {
 const counted = items.filter(isCounted).length
 return { total: items.length, counted, pending: items.length - counted, difference: items.filter(hasCountVariance).length, percent: items.length ? Math.round(counted / items.length * 100) : 0 }
}
