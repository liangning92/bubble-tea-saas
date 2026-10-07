import { useTranslation } from 'react-i18next'
import { useDashboardContext } from '../utils/dashboardNavigation'

export function DashboardReadFailure({retry,scope = false}: {retry?:()=>unknown;scope?:boolean}) {
  const {t} = useTranslation()
  return <div role="alert" data-testid="dashboard-read-failure" className="card p-4 text-red-700">
    <p>{t(scope ? 'dashboardNavigation.contextUnavailable' : 'dashboardNavigation.loadFailed')}</p>
    {retry && <button type="button" className="btn-secondary mt-2" onClick={()=>{void retry()}}>{t('common.reload')}</button>}
  </div>
}

export function DashboardContextNotice({current = false,range}: {current?:boolean;range?:{startDate?:string;endDate?:string}}) {
  const {t} = useTranslation()
  const context = useDashboardContext()
  const startDate=range?.startDate ?? context.startDate
  const endDate=range?.endDate ?? context.endDate
  return <p data-testid="dashboard-context" className="text-sm text-gray-500 mb-4">
    {t('dashboardNavigation.store')}: {context.storeId} · {current ? t('dashboardNavigation.currentOnly') : startDate ? `${startDate} — ${endDate}` : t('dashboardNavigation.allDates')}
    {context.asOf && <> · {t('dashboardNavigation.asOf')}: {context.asOf}</>}
  </p>
}

export function DashboardFeatureUnavailable() {
  const {t}=useTranslation()
  const context=useDashboardContext()
  if (!context.valid) return <DashboardReadFailure scope />
  return <div><DashboardContextNotice /><section role="status" data-testid="dashboard-feature-unavailable" className="card p-4"><h1>{t('dashboard.consumptionAnomaly')}</h1><p>{t('dashboardNavigation.featureUnavailable')}</p></section></div>
}
