export interface ProductSalesRow { productId: string; quantity: number; revenue: number }
interface SalesPage { list: ProductSalesRow[]; total: number; pageSize: number }

// Load every analysis page before ranking; a partial result must never look like zero sales.
export async function loadProductSales(fetchPage: (page: number) => Promise<SalesPage>) {
  const first = await fetchPage(1)
  const pages = Math.ceil(first.total / first.pageSize)
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, index) => fetchPage(index + 2)))
  const rows = [first, ...rest].flatMap(page => page.list)
  const totalRevenue = rows.reduce((total, row) => total + row.revenue, 0)
  return new Map(rows.map(row => [row.productId, { ...row, revenueShare: totalRevenue > 0 ? row.revenue / totalRevenue * 100 : 0 }]))
}
