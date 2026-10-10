// Keep the wire contract aligned with shared/utils/tvScreenConfig.ts; contract tests cover both runtimes.
export interface TvBanner { url: string; title?: string; subtitle?: string }
export interface TvSpecial { productId?: string; autoPrice?: boolean; applicableChannels?: string[]; dayOfWeek: number; productName: string; originalPrice: number; specialPrice: number; tag: string; imageUrl: string; description: string }
export interface TvPrize { id: string; name: string; code: string; color: string; weight: number }
export interface TvScreenConfig {
  idleProductsEnabled: boolean; idleProductIds: string[]; idleProducts?: Array<{ id: string; name: string; image: string; price?: number }>
  idleMusic: { enabled: boolean; volume: number; tracks: TvBanner[] }
  soundEnabled?: boolean; activePromotions?: any[]; activityVersion?: number; evaluatedAt?: string
  enabled: boolean; storeName: string; welcomeText: string; carouselIntervalSeconds: number
  layout: { columns: Array<{ width: number; content: string }> }
  mediaFiles: TvBanner[]; dailySpecials: TvSpecial[]
  lottery: { enabled: boolean; triggerMinOrderAmount: number; title: string; subtitle: string; prizes: TvPrize[] }
  ticker: { enabled: boolean; text: string }
}
export const DEFAULT_TV_CONFIG: TvScreenConfig = {
  enabled: false, storeName: 'YOUME', welcomeText: 'Selamat Datang di YOUME', carouselIntervalSeconds: 6,
  layout: { columns: [{ width: 60, content: 'media' }, { width: 40, content: 'specials' }] },
  mediaFiles: [], dailySpecials: [],
  idleProductsEnabled: true, idleProductIds: [], idleMusic: { enabled: false, volume: 0.4, tracks: [] },
  lottery: { enabled: false, triggerMinOrderAmount: 50000, title: 'Putar Roda Hoki', subtitle: '', prizes: [] },
  ticker: { enabled: false, text: '' },
}
export function normalizeTvConfig(raw: any): TvScreenConfig {
  const source = raw && typeof raw === 'object' ? raw : {}
  const legacyBanners = Array.isArray(source.heroBanners) ? source.heroBanners.filter((b: any) => b.active !== false).map((b: any) => ({ url: b.imageUrl, title: b.title, subtitle: b.subtitle })) : []
  return {
    ...DEFAULT_TV_CONFIG, ...source,
    layout: { ...DEFAULT_TV_CONFIG.layout, ...source.layout },
    idleProductsEnabled: source.idleProductsEnabled !== false,
    idleProductIds: Array.isArray(source.idleProductIds) ? source.idleProductIds : [],
    idleMusic: { enabled: source.idleMusic?.enabled === true, volume: typeof source.idleMusic?.volume === 'number' && Number.isFinite(source.idleMusic.volume) ? Math.max(0, Math.min(1, source.idleMusic.volume)) : 0.4, tracks: Array.isArray(source.idleMusic?.tracks) ? source.idleMusic.tracks : [] },
    mediaFiles: Array.isArray(source.mediaFiles) ? source.mediaFiles : legacyBanners,
    dailySpecials: Array.isArray(source.dailySpecials) ? source.dailySpecials : Array.isArray(source.specials) ? source.specials : [],
    lottery: { ...DEFAULT_TV_CONFIG.lottery, ...source.lottery, prizes: Array.isArray(source.lottery?.prizes) ? source.lottery.prizes : [] },
    ticker: { ...DEFAULT_TV_CONFIG.ticker, ...source.ticker },
  }
}
export function pickTvPrize(prizes: TvPrize[], random = Math.random): { prize: TvPrize; index: number } | undefined {
  const weights = prizes.map(p => Number.isFinite(p.weight) && p.weight > 0 ? p.weight : 0)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (!total) return undefined
  let remaining = Math.min(0.9999999999999999, Math.max(0, random())) * total
  for (let index = 0; index < prizes.length; index++) {
    if (!weights[index]) continue
    remaining -= weights[index]
    if (remaining < 0) return { prize: prizes[index], index }
  }
  return undefined
}
