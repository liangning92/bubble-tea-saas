import { MarketingModule, useMarketingCopy } from '../../components/marketing/MarketingLayout'

export function PointsIndexPage() {
  const l = useMarketingCopy()
  return <MarketingModule items={[
    { path: '/marketing/points/rule', label: l('积分规则','Points rules','Aturan poin') },
    { path: '/marketing/points/expiry', label: l('积分有效期','Points expiry','Masa berlaku poin') },
    { path: '/marketing/points/rewards', label: l('赠品与兑换','Rewards and gifts','Hadiah dan penukaran') }
  ]} description={l('维护基础积分规则、有效期和可兑换赠品，活动可直接引用。','Maintain points rules, expiry and rewards used by activities.','Kelola aturan poin, masa berlaku, dan hadiah untuk aktivitas.')} />
}
