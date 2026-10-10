import { Link, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { languageIndex } from '../../../../shared/utils/activityLabels'

export type MarketingLink = { path: string; label: string }

export function MarketingTabs({ items, primary = false }: { items: MarketingLink[]; primary?: boolean }) {
  const { pathname } = useLocation()
  const active = [...items].sort((a, b) => b.path.length - a.path.length).find(item => pathname === item.path || pathname.startsWith(item.path + '/')) || items[0]
  return <nav aria-label={primary ? 'Marketing' : 'Marketing section'} className={primary ? 'marketing-primary-nav' : 'marketing-section-nav'}>
    {items.map(item => <Link key={item.path} to={item.path} aria-current={active?.path === item.path ? 'page' : undefined}
      className={primary ? `marketing-primary-link ${active?.path === item.path ? 'bg-primary text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}` : `marketing-section-link ${active?.path === item.path ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
      {item.label}
    </Link>)}
  </nav>
}

export function MarketingModule({ items, description }: { items: MarketingLink[]; description: string }) {
  const { pathname } = useLocation()
  const current = [...items].sort((a, b) => b.path.length - a.path.length).find(item => pathname === item.path || pathname.startsWith(item.path + '/')) || items[0]
  return <div className="min-w-0 space-y-5">
    <MarketingTabs items={items} />
    <header><h1 className="text-xl font-semibold text-gray-900">{current?.label}</h1><p className="mt-1 text-sm text-gray-500">{description}</p></header>
    <div className="marketing-content min-w-0"><Outlet /></div>
  </div>
}

export function useMarketingCopy() {
  const { i18n } = useTranslation()
  const index = languageIndex(i18n.language)
  return (zh: string, en: string, id: string) => [zh, en, id][index]
}

export function MarketingError({ retry }: { retry?: () => void }) {
  const l = useMarketingCopy()
  return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
    {l('数据加载失败，请重试。','Could not load data. Please retry.','Gagal memuat data. Coba lagi.')}
    {retry && <button type="button" className="btn-secondary ml-3" onClick={retry}>{l('重试','Retry','Coba lagi')}</button>}
  </div>
}

export function categoryDisplayName(name: string, l: (zh: string, en: string, id: string) => string) {
  const labels: Record<string, [string,string,string]> = {
    birthday: ['生日关怀','Birthday','Ulang tahun'], reactivation: ['老客唤醒','Reactivation','Aktivasi kembali'],
    loyalty: ['会员忠诚','Loyalty','Loyalitas'], seasonal: ['节日主题','Seasonal','Musiman'], welcome: ['拉新欢迎','New customers','Pelanggan baru'],
    points_expiring: ['积分到期','Points expiry','Poin kedaluwarsa'], opening: ['开业庆典','Store opening','Pembukaan toko'],
    new_product: ['新品推广','New products','Produk baru'], repurchase: ['复购激励','Repeat visits','Kunjungan ulang']
  }
  return labels[name] ? l(...labels[name]) : name
}
