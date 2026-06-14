import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2, TrendingUp, Ticket } from 'lucide-react'

export function MarketingAnalyticsPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const storeId = user?.storeId || 'default'

  const { data, isLoading } = useQuery({
    queryKey: ['marketing-roi'],
    queryFn: () => marketingApi.marketingROI({ storeId })
  })

  const roi = data?.data?.data

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
  }

  return (
    <div>
      {roi?.summary ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="card text-center">
              <div className="text-2xl font-bold text-primary">{roi.summary.totalCampaigns}</div>
              <div className="text-sm text-gray-500">{t('marketing.totalCampaigns')}</div>
            </div>
            <div className="card text-center">
              <div className="text-2xl font-bold text-info">{roi.summary.totalCouponsIssued}</div>
              <div className="text-sm text-gray-500">{t('marketing.couponsIssued')}</div>
            </div>
            <div className="card text-center">
              <div className="text-2xl font-bold text-success">{roi.summary.totalCouponsUsed}</div>
              <div className="text-sm text-gray-500">{t('marketing.couponsUsed')}</div>
            </div>
            <div className="card text-center">
              <div className="text-2xl font-bold text-warning">{roi.summary.totalROI}</div>
              <div className="text-sm text-gray-500">ROI</div>
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-4">{t('marketing.campaignPerformance')}</h3>
            {roi.campaigns?.length > 0 ? (
              <div className="space-y-3">
                {roi.campaigns.map((c: any) => (
                  <div key={c.campaignId} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Ticket size={16} className="text-primary" />
                        <span className="font-medium">{c.campaignName}</span>
                      </div>
                      <span className={`badge ${c.status === 'active' ? 'badge-success' : 'badge-gray'}`}>{c.status}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">{t('marketing.issued')}</span>
                        <div className="font-medium">{c.couponsIssued}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">{t('marketing.used')}</span>
                        <div className="font-medium">{c.couponsUsed}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">{t('marketing.revenue')}</span>
                        <div className="font-medium">Rp {c.revenue?.toLocaleString()}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">ROI</span>
                        <div className="font-medium text-success">{c.roi}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">{t('common.noData')}</p>
            )}
          </div>
        </>
      ) : (
        <div className="card text-center py-12 text-gray-500">
          <TrendingUp size={48} className="mx-auto mb-4 opacity-50" />
          <p>{t('common.noData')}</p>
        </div>
      )}
    </div>
  )
}