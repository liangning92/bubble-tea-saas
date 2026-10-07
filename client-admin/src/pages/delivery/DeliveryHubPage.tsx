import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Truck, RefreshCw, Loader2, Unplug, AlertCircle } from 'lucide-react'
import { deliveryApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import {PageHelp} from '../../components/PageHelp'

const PLATFORM_STYLES = {
  grabfood: 'border-green-200 bg-green-50 text-green-700',
  gofood: 'border-red-200 bg-red-50 text-red-700',
  shopee: 'border-orange-200 bg-orange-50 text-orange-700'
}

export function DeliveryHubPage() {
  const { t } = useTranslation()
  const storeId = useAuthStore(state => state.user?.storeId)
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['delivery-platforms', storeId],
    queryFn: async () => (await deliveryApi.platforms(storeId!)).data.data.platforms,
    enabled: Boolean(storeId),
    retry: false
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Truck aria-hidden="true" />{t('delivery.title')}
        </h1>
        <button type="button" onClick={() => void refetch()} disabled={!storeId || isFetching} className="btn btn-secondary flex items-center gap-2">
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} aria-hidden="true" />
          {t('common.refresh')}
        </button>
      </div>


      {!storeId || isError ? (
        <div role="alert" className="card flex items-start gap-3 border-amber-200 bg-amber-50">
          <AlertCircle className="shrink-0 text-amber-600" aria-hidden="true" />
          <p>{t(!storeId ? 'deliveryIntegration.storeRequired' : 'deliveryIntegration.loadFailed')}</p>
        </div>
      ) : isLoading ? (
        <div role="status" className="card flex items-center justify-center gap-2 py-10">
          <Loader2 className="animate-spin" aria-hidden="true" />{t('common.loading')}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {(data || []).map(connection => (
            <div key={connection.platform} className="card space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">{t(`delivery.${connection.platform}`)}</h2>
                <span className={`rounded-full border px-3 py-1 text-sm ${PLATFORM_STYLES[connection.platform]}`}>
                  {t('deliveryIntegration.notConnected')}
                </span>
              </div>
              <PageHelp><ul className="space-y-2 text-sm text-gray-500">
                <li>{t('deliveryIntegration.orders')}</li>
                <li>{t('deliveryIntegration.statusUpdates')}</li>
                <li>{t('deliveryIntegration.menuSync')}</li>
              </ul></PageHelp>
            </div>
          ))}
        </div>
      )}

      <div className="card flex flex-col items-center gap-3 py-10 text-center">
        <Unplug size={40} className="text-gray-400" aria-hidden="true" />
        <h2 className="text-lg font-semibold">{t('deliveryIntegration.waitingTitle')}</h2>
      </div>
    </div>
  )
}
