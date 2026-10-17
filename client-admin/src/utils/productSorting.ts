export const productSortKeys = ['default', 'profit', 'margin', 'price', 'sales', 'revenue'] as const
export type ProductSortKey = typeof productSortKeys[number]
export type ProductSortDirection = 'asc' | 'desc'

interface SortableProduct {
  salesQuantity?: number
  revenueShare?: number
  costPrice?: number | null
  specs?: Array<{ price?: number | null }>
}

// Match the price/cost basis of the product list; compare full precision, not rounded labels.
export function productSortValue(product: SortableProduct, key: ProductSortKey): number | null {
  if (key === 'sales') return Number.isFinite(product.salesQuantity) ? product.salesQuantity! : null
  if (key === 'revenue') return Number.isFinite(product.revenueShare) ? product.revenueShare! : null
  const price = Number(product.specs?.[0]?.price || 0)
  const cost = Number(product.costPrice || 0)
  if (!Number.isFinite(price) || !Number.isFinite(cost)) return null
  if (key === 'price') return price
  if (key === 'profit') return price - cost
  if (key === 'margin') return cost && price ? (price - cost) / price : null
  return null
}

export function sortProducts<T extends SortableProduct>(products: T[], key: ProductSortKey, direction: ProductSortDirection): T[] {
  if (key === 'default') return products
  const sign = direction === 'asc' ? 1 : -1
  return products.map((product, index) => ({ product, index, value: productSortValue(product, key) }))
    .sort((a, b) => {
      if (a.value === null) return b.value === null ? a.index - b.index : 1
      if (b.value === null) return -1
      return sign * (a.value - b.value) || a.index - b.index
    }).map(item => item.product)
}
