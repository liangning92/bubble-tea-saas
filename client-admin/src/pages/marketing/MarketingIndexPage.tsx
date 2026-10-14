import { useEmployeePermission } from '../../contexts/EmployeeAccess'
import { Outlet } from 'react-router-dom'
import { MarketingTabs, useMarketingCopy } from '../../components/marketing/MarketingLayout'

export function MarketingIndexPage() {
  const l = useMarketingCopy()
  const canReadMedia=useEmployeePermission('marketing.read')
  return <div className="marketing-workspace min-w-0 space-y-5">
    <MarketingTabs primary items={[
      ...(canReadMedia?[{path:'/marketing/media',label:l('媒体库','Media library','Pustaka media')},{path:'/marketing/tv-screen',label:l('电视大屏','TV displays','Layar TV')}]:[]),
      { path: '/marketing/overview', label: l('营销总览','Overview','Ringkasan') },
      { path: '/marketing/promotions', label: l('促销','Promotions','Promosi') },
      { path: '/marketing/members', label: l('会员','Members','Member') },
      { path: '/marketing/points', label: l('积分','Points','Poin') },
      { path: '/marketing/messages', label: l('消息','Messages','Pesan') },
      { path: '/marketing/operations', label: l('运营','Operations','Operasional') }
    ]} />
    <Outlet />
  </div>
}
