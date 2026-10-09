import { MarketingModule, useMarketingCopy } from '../../components/marketing/MarketingLayout'

export function MembersIndexPage() {
  const l = useMarketingCopy()
  return <MarketingModule items={[
    { path: '/marketing/members', label: l('会员列表','Members','Member') },
    { path: '/marketing/members/tier-benefits', label: l('等级权益','Tier benefits','Manfaat level') },
    { path: '/marketing/members/balance', label: l('会员储值','Member balance','Saldo member') }
  ]} description={l('查看会员，维护等级权益与储值记录，为会员活动提供基础信息。','Manage members, tier benefits and balances for member activities.','Kelola member, manfaat level, dan saldo untuk aktivitas member.')} />
}
