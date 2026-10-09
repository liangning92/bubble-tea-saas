import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, Megaphone, Gift, Monitor, ClipboardList } from 'lucide-react'
import { activitiesApi } from '../../services/api'
import { MarketingError, useMarketingCopy } from '../../components/marketing/MarketingLayout'

export function MarketingOverviewPage() {
  const l = useMarketingCopy()
  const activities = useQuery({ queryKey: ['unified-activities'], queryFn: () => activitiesApi.list().then(response => response.data.data), refetchInterval: 15000 })
  const grants = useQuery({ queryKey: ['activity-grants'], queryFn: () => activitiesApi.entitlements().then(response => response.data.data), refetchInterval: 15000 })
  const terminals = useQuery({ queryKey: ['activity-terminals'], queryFn: () => activitiesApi.terminals().then(response => response.data.data), refetchInterval: 15000 })
  const rows = activities.data || [], rewards = grants.data || [], devices = terminals.data || []
  const stats = [
    { label: l('进行中的活动','Active activities','Aktivitas aktif'), count: rows.filter((row: any) => row.state === 'active').length, path: '/marketing/promotions/activities?status=active', icon: Megaphone },
    { label: l('待发布与待确认','Drafts and reviews','Draf dan tinjauan'), count: rows.filter((row: any) => ['draft','review'].includes(row.state)).length, path: '/marketing/promotions/activities?status=draft', icon: ClipboardList },
    { label: l('待兑现权益','Rewards to fulfil','Hadiah untuk diserahkan'), count: rewards.filter((row: any) => row.status === 'ready').length, path: '/marketing/promotions/activities?tab=grants', icon: Gift },
    { label: l('在线终端','Online terminals','Terminal online'), count: devices.filter((row: any) => row.online).length, path: '/marketing/promotions/activities?tab=terminals', icon: Monitor }
  ]
  const steps = [
    { title: l('准备活动资源','Prepare resources','Siapkan sumber'), text: l('确认商品、券模板和赠品可用。','Check products, coupon templates and gifts.','Periksa produk, template kupon, dan hadiah.'), links: [['/products',l('商品目录','Products','Produk')],['/marketing/promotions/coupons',l('券模板','Coupons','Kupon')],['/marketing/points/rewards',l('赠品目录','Gifts','Hadiah')]] },
    { title: l('配置并发布活动','Configure and publish','Atur dan terbitkan'), text: l('选择活动形式、类别、商品与时间，预览后发布。','Choose an offer, category, products and schedule; preview before publishing.','Pilih promo, kategori, produk, dan jadwal; pratinjau sebelum terbit.'), links: [['/marketing/promotions/activities?create=1',l('创建活动','Create activity','Buat aktivitas')],['/marketing/promotions/campaign-categories',l('管理类别','Manage categories','Kelola kategori')]] },
    { title: l('检查执行与宣传','Check execution and publicity','Periksa eksekusi dan publikasi'), text: l('收银与电视自动同步，查看终端连接及宣传配置。','POS and TV sync automatically. Check connections and publicity.','POS dan TV sinkron otomatis. Periksa koneksi dan publikasi.'), links: [['/marketing/promotions/activities?tab=terminals',l('终端同步','Terminal sync','Sinkronisasi terminal')],['/settings/tv-screen',l('电视设置','TV settings','Pengaturan TV')],['/marketing/messages/settings',l('消息模板','Message templates','Template pesan')]] },
    { title: l('兑现权益与复盘','Fulfil and review','Serahkan dan tinjau'), text: l('处理赠品与奖品，查看成交和优惠数据，调整下次活动。','Fulfil gifts and prizes, review sales and discounts, then refine the next offer.','Serahkan hadiah, tinjau penjualan dan diskon, lalu perbaiki promo berikutnya.'), links: [['/marketing/promotions/activities?tab=grants',l('权益记录','Rewards','Hadiah')],['/marketing/operations/analytics',l('活动效果','Performance','Kinerja')]] }
  ]
  return <div className="space-y-5">
    <header className="marketing-toolbar"><div><h1 className="text-xl font-semibold">{l('营销总览','Marketing overview','Ringkasan pemasaran')}</h1><p className="mt-1 text-sm text-gray-500">{l('从准备、发布到兑现与复盘，集中管理门店活动。','Manage store offers from preparation and launch through fulfilment and review.','Kelola promo toko dari persiapan dan penerbitan hingga penyerahan dan tinjauan.')}</p></div><Link className="btn-primary" to="/marketing/promotions/activities?create=1">{l('创建活动','Create activity','Buat aktivitas')}</Link></header>
    {(activities.isError || grants.isError || terminals.isError) && <MarketingError retry={() => { activities.refetch(); grants.refetch(); terminals.refetch() }} />}
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">{stats.map(stat => <Link key={stat.path} className="card hover:border-primary transition-colors" to={stat.path}><stat.icon size={20} className="text-primary mb-3" /><p className="text-2xl font-semibold">{activities.isLoading || grants.isLoading || terminals.isLoading ? '…' : stat.count}</p><p className="mt-1 text-sm text-gray-500">{stat.label}</p></Link>)}</div>
    <div className="grid md:grid-cols-2 gap-4">{steps.map((step, index) => <section key={step.title} className="card"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">{index + 1}</span><h2 className="font-semibold">{step.title}</h2></div><p className="my-3 text-sm text-gray-500">{step.text}</p><div className="flex flex-wrap gap-3">{step.links.map(([path,label]) => <Link key={path} to={path} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">{label}<ArrowRight size={14} /></Link>)}</div></section>)}</div>
    {rewards.some((row: any) => ['unavailable','manual_review'].includes(row.status)) && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{l('有库存不足或退款后需人工处理的权益。','Some rewards need attention because of unavailable stock or refunds.','Beberapa hadiah perlu ditangani karena stok habis atau pengembalian dana.')} <Link to="/marketing/promotions/activities?tab=grants" className="underline">{l('查看并处理','Review rewards','Tinjau hadiah')}</Link></div>}
  </div>
}
