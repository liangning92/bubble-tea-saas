import { MarketingModule, useMarketingCopy } from '../../components/marketing/MarketingLayout'

export function PromotionsIndexPage() {
  const l = useMarketingCopy()
  return <MarketingModule items={[
    { path: '/marketing/promotions/activities', label: l('活动','Activities','Aktivitas') },
    { path: '/marketing/promotions/coupons', label: l('优惠券模板','Coupon templates','Template kupon') },
    { path: '/marketing/promotions/referrals', label: l('邀请计划','Referral plans','Program undangan') },
    { path: '/marketing/promotions/campaign-categories', label: l('活动类别','Activity categories','Kategori aktivitas') }
  ]} description={l('管理活动规则、适用范围与宣传，券模板和类别作为活动资源。','Manage offers, eligibility and publicity. Coupons and categories are shared resources.','Kelola aturan, peserta, dan publikasi. Kupon dan kategori adalah sumber aktivitas.')} />
}
