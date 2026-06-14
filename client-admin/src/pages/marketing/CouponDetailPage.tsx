import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { ArrowLeft, Edit, Loader2, Ticket, Percent, Banknote, Gift, Truck, User } from 'lucide-react'

export function CouponDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['coupon', id],
    queryFn: () => marketingApi.getCoupon(id!),
    enabled: !!id
  })

  const coupon = data?.data?.data

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'discount_percent': return <Percent size={16} />
      case 'discount_fixed': return <Banknote size={16} />
      case 'free_product': return <Gift size={16} />
      case 'free_delivery': return <Truck size={16} />
      default: return <Ticket size={16} />
    }
  }

  const formatValue = (c: any) => {
    switch (c.type) {
      case 'discount_percent': return `${c.value}%`
      case 'discount_fixed': return `Rp ${c.value?.toLocaleString()}`
      case 'free_product': return t('marketing.freeProduct')
      case 'free_delivery': return t('marketing.freeDelivery')
      default: return c.value
    }
  }

  const formatDate = (date?: string) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('id-ID')
  }

  const formatDateTime = (date?: string) => {
    if (!date) return '-'
    return new Date(date).toLocaleString('id-ID')
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  if (!coupon) {
    return <div className="text-center py-12 text-gray-500">{t('common.noData')}</div>
  }

  const usedMembers = coupon.memberCoupons?.filter((mc: any) => mc.status === 'used') || []

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/marketing/coupons')} className="btn-ghost">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold font-mono">{coupon.code}</h1>
        <span className={`badge ${coupon.status === 'active' ? 'badge-success' : 'badge-gray'}`}>{coupon.status}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold mb-4">{t('marketing.couponDetails')}</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">{t('marketing.couponType')}</span>
              <span className="badge badge-primary flex items-center gap-1">
                {getTypeIcon(coupon.type)}
                {t(`marketing.couponTypes.${coupon.type}`) || coupon.type}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('marketing.value')}</span>
              <span className="font-semibold">{formatValue(coupon)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('marketing.minOrder')}</span>
              <span>{coupon.minOrder ? `Rp ${coupon.minOrder.toLocaleString()}` : '-'}</span>
            </div>
            {coupon.maxDiscount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">{t('marketing.maxDiscount')}</span>
                <span>Rp {coupon.maxDiscount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">{t('marketing.validFrom')}</span>
              <span>{formatDate(coupon.validFrom)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('marketing.validUntil')}</span>
              <span>{formatDate(coupon.validUntil)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('marketing.usageCount')}</span>
              <span>{coupon.usedCount} {coupon.usageLimit ? `/ ${coupon.usageLimit}` : ''}</span>
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <button onClick={() => navigate(`/marketing/coupons/${id}/edit`)} className="btn-secondary flex items-center gap-2">
              <Edit size={16} /> {t('common.edit')}
            </button>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4">{t('marketing.usedByMembers')} ({usedMembers.length})</h3>
          {usedMembers.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {usedMembers.map((mc: any) => (
                <div key={mc.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <User size={20} className="text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{mc.member?.name || 'Unknown'}</div>
                    <div className="text-sm text-gray-500">{mc.member?.phone || '-'}</div>
                  </div>
                  <div className="text-sm text-gray-500">{formatDateTime(mc.usedAt)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">{t('common.noData')}</p>
          )}
        </div>
      </div>
    </div>
  )
}