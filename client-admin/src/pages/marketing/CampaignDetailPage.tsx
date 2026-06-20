import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { ArrowLeft, Edit, Loader2, Ticket, TrendingUp } from 'lucide-react'

export function CampaignDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => marketingApi.getCampaign(id!),
    enabled: !!id
  })

  const campaign = data?.data

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="text-center py-12 text-gray-500">
        {t('common.noData')}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/marketing/campaigns')} className="btn-ghost">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold">{campaign.name}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold mb-4">{t('marketing.campaignDetails')}</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">{t('marketing.type')}</span>
              <span className="badge badge-primary">{t(`marketing.campaignTypes.${campaign.type}`)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('marketing.triggerType')}</span>
              <span>{t(`marketing.triggerTypes.${campaign.triggerType}`)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('marketing.status')}</span>
              <span className={`badge ${campaign.status === 'active' ? 'badge-success' : 'badge-gray'}`}>
                {campaign.status === 'active' ? t('common.active') : t('common.inactive')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('marketing.startDate')}</span>
              <span>{campaign.startDate ? new Date(campaign.startDate).toLocaleDateString('id-ID') : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('marketing.endDate')}</span>
              <span>{campaign.endDate ? new Date(campaign.endDate).toLocaleDateString('id-ID') : '-'}</span>
            </div>
            {campaign.description && (
              <div>
                <span className="text-gray-500">{t('marketing.description')}</span>
                <p className="mt-1 text-gray-700">{campaign.description}</p>
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-6">
            <button onClick={() => navigate(`/marketing/campaigns/${id}/edit`)} className="btn-secondary flex items-center gap-2">
              <Edit size={16} /> {t('common.edit')}
            </button>
           <button onClick={() => navigate(`/marketing/campaigns/${id}/stats`)} className="btn-primary flex items-center gap-2">
              <TrendingUp size={16} /> {t('marketing.viewStats')}
            </button>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4">{t('marketing.associatedCoupons')}</h3>
          {campaign.coupons?.length > 0 ? (
            <div className="space-y-2">
              {campaign.coupons.map((coupon: any) => (
                <div key={coupon.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Ticket size={16} className="text-primary" />
                    <span className="font-mono font-medium">{coupon.code}</span>
                  </div>
                  <span className="text-sm text-gray-600">
                    {coupon.usedCount} / {coupon.usageLimit || '∞'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">{t('common.noData')}</p>
          )}
        </div>
      </div>
    </div>
  )
}