import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { Loader2, TrendingUp, Ticket, Users, Gift } from 'lucide-react'

export function CampaignStatsPage() {
  const { t } = useTranslation()
  const { id } = useParams()

  const { data, isLoading } = useQuery({
    queryKey: ['campaign-stats', id],
    queryFn: () => marketingApi.campaignAnalytics(id!, {}),
    enabled: !!id
  })

  const stats = data?.data?.data

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">{t('common.noData')}</p>
      </div>
    )
  }

  const metrics = [
    {
      label: t('marketing.totalCouponsIssued'),
      value: stats.totalIssued || 0,
      icon: Ticket,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      label: t('marketing.totalCouponsUsed'),
      value: stats.totalUsed || 0,
      icon: Gift,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      label: t('marketing.totalMembersReached'),
      value: stats.uniqueMembers || 0,
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    },
    {
      label: t('marketing.avgUsageRate'),
      value: stats.usageRate ? `${stats.usageRate.toFixed(1)}%` : '0%',
      icon: TrendingUp,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100'
    }
  ]

  const dailyData = stats.daily || []

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('marketing.campaignStats')}</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {metrics.map((metric) => (
          <div key={metric.label} className="card">
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 ${metric.bgColor} rounded-lg flex items-center justify-center`}>
                <metric.icon size={20} className={metric.color} />
              </div>
              <span className="text-sm text-gray-500">{metric.label}</span>
            </div>
            <div className={`text-2xl font-bold ${metric.color}`}>{metric.value}</div>
          </div>
        ))}
      </div>

      {/* Daily Trend Chart */}
      <div className="card mb-6">
        <h3 className="font-semibold mb-4">{t('marketing.dailyTrend')}</h3>
        {dailyData.length > 0 ? (
          <div className="h-48 flex items-end gap-2">
            {dailyData.map((day: any, idx: number) => (
              <div key={idx} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full bg-primary/20 hover:bg-primary/30 transition-colors rounded-t"
                  style={{ height: `${Math.min(100, (day.used / (stats.maxDailyUsed || 1)) * 100)}%` }}
                  title={`${day.date}: ${day.used} used`}
                />
                <div className="text-xs text-gray-500 mt-1 truncate">{day.date?.slice(5)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">{t('common.noData')}</p>
        )}
      </div>

      {/* Top Performing Coupons */}
      <div className="card">
        <h3 className="font-semibold mb-4">{t('marketing.topCoupons')}</h3>
        {stats.topCoupons && stats.topCoupons.length > 0 ? (
          <div className="space-y-2">
            {stats.topCoupons.map((coupon: any, idx: number) => (
              <div key={coupon.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-medium">
                    {idx + 1}
                  </span>
                  <div>
                    <div className="font-medium font-mono">{coupon.code}</div>
                    <div className="text-sm text-gray-500">{coupon.name || coupon.campaignName}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{coupon.usedCount} / {coupon.usageLimit || '∞'}</div>
                  <div className="text-sm text-gray-500">{t('marketing.usage')}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">{t('common.noData')}</p>
        )}
      </div>
    </div>
  )
}