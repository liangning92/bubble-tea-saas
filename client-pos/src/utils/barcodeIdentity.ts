export interface ScanIdentity { version: 1; storeId: string; productId: string }
export interface CatalogSpec { id: string; name: string; price: number }
export interface CatalogProduct {
  id: string
  name: string
  storeId?: string
  status?: string
  deletedAt?: string | null
  category?: { id: string; name: string }
  image?: string
  specs: CatalogSpec[]
  addons: { addonId: string; addon: { id: string; name: string; price: number } }[]
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const identity = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
export const validCatalogPrice = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
export function validCatalogSpec(value: unknown): value is CatalogSpec {
  return record(value) && identity(value.id) && identity(value.name) && validCatalogPrice(value.price)
}
/** Serialized prices/names/spec defaults are never authoritative at this boundary. */
export function decodeScanIdentity(raw: string, storeId: string): ScanIdentity | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (!record(value) || value.version !== 1 || !identity(storeId) || value.storeId !== storeId || !identity(value.productId)) return null
    return { version: 1, storeId, productId: value.productId }
  } catch { return null }
}
/** Only the freshly authenticated current-store directory response is accepted. */
export function resolveScanProduct(scan: ScanIdentity, list: unknown, storeId: string): CatalogProduct | null {
  if (scan.storeId !== storeId || !Array.isArray(list)) return null
  const matches = list.filter(p => record(p) && p.id === scan.productId)
  if (matches.length !== 1) return null
  const product = matches[0]
  if (product.storeId !== storeId || product.status !== 'active' || product.deletedAt != null || !identity(product.name)) return null
  if (!Array.isArray(product.specs) || product.specs.length === 0 || !product.specs.every((s: unknown) => validCatalogSpec(s) && (!record(s) || s.productId === undefined || s.productId === product.id))) return null
  if (new Set(product.specs.map((s: CatalogSpec) => s.id)).size !== product.specs.length) return null
  if (!Array.isArray(product.addons) || !product.addons.every((pa: unknown) => record(pa) && identity(pa.addonId) && record(pa.addon) && pa.addon.id === pa.addonId && identity(pa.addon.name) && validCatalogPrice(pa.addon.price))) return null
  return product as CatalogProduct
}
