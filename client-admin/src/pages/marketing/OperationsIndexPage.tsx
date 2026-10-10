import { MarketingModule, useMarketingCopy } from '../../components/marketing/MarketingLayout'

export function OperationsIndexPage() {
  const l = useMarketingCopy()
  return <MarketingModule items={[
    { path: '/marketing/operations/automation', label: l('自动任务','Automation','Otomatisasi') },
    { path: '/marketing/operations/automation/rules', label: l('任务规则','Task rules','Aturan tugas') },
    { path: '/marketing/operations/automation/logs', label: l('执行记录','Execution logs','Log eksekusi') },
    { path: '/marketing/operations/notifications', label: l('通知记录','Notifications','Notifikasi') },
    { path: '/marketing/operations/analytics', label: l('活动效果','Activity performance','Kinerja aktivitas') },
    { path: '/marketing/operations/analytics/coupons', label: l('券使用报表','Coupon reports','Laporan kupon') },
    { path: '/marketing/operations/analytics/campaigns', label: l('历史活动报表','Historical campaign reports','Laporan kampanye lama') },
    { path: '/marketing/operations/analytics/referral', label: l('邀请转化','Referral conversion','Konversi undangan') }
  ]} description={l('查看活动执行、自动任务、通知与效果，及时处理异常。','Review activity execution, automation and results; resolve outstanding issues.','Tinjau eksekusi aktivitas, otomatisasi, dan hasil; tangani masalah.')} />
}
