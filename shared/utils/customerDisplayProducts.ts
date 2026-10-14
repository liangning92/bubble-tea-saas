export interface DisplayCatalogProduct {
  id: string; name: string; code?: string; category?: {name:string} | null; image?: string | null
  specs: { id: string; name?: string; price: number; isDefault?: boolean }[]
}
export interface ProductDisplayMedia {
  url: string; filename: string; mimetype: string; isVideo: boolean
  productId?: string; specId?: string; productName?: string; productPrice?: number; productSpecName?: string
}
export function resolveDisplayProducts<T extends ProductDisplayMedia>(files: T[], products: DisplayCatalogProduct[]): T[] {
  const catalog = new Map(products.map(product => [product.id, product]))
  return files.flatMap(file => {
    if (!file.productId) return [file]
    const product = catalog.get(file.productId)
    const spec = file.specId ? product?.specs.find(spec => spec.id === file.specId) : product?.specs.find(spec => spec.isDefault) || product?.specs[0]
    if (!product?.image || !spec || !Number.isFinite(spec.price) || spec.price < 0) return []
    let url = product.image
    try { url = new URL(url, file.url).href } catch { /* Already normalized by the catalog or caller. */ }
    const productSpecName = product.specs.length > 1 ? spec.name : undefined
    return [{ ...file, url, filename: productSpecName ? `${product.name} · ${productSpecName}` : product.name, isVideo: false, productName: product.name, productPrice: spec.price, productSpecName }]
  })
}
