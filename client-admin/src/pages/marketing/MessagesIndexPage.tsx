import { MarketingModule, useMarketingCopy } from '../../components/marketing/MarketingLayout'

export function MessagesIndexPage() {
  const l = useMarketingCopy()
  return <MarketingModule items={[
    { path: '/marketing/messages/channels', label: l('营销渠道','Marketing channels','Kanal pemasaran') },
    { path: '/marketing/messages/settings', label: l('消息配置与模板','Settings and templates','Pengaturan dan template') },
    { path: '/marketing/messages/logs', label: l('发送记录','Delivery logs','Log pengiriman') },
    { path: '/marketing/messages/stats', label: l('发送统计','Delivery statistics','Statistik pengiriman') }
  ]} description={l('配置渠道与消息模板，查看发送结果和宣传效果。','Configure channels and templates, then review delivery results.','Atur kanal dan template, lalu tinjau hasil pengiriman.')} />
}
