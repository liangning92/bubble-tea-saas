import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2, Gift, TrendingUp, ArrowDown } from 'lucide-react'

interface ReferralFunnel {
  codesGenerated: number
  codesUsed: number
  newRegistrations: number
  firstPurchase: number
  repeatPurchase: number
  totalReferralRevenue: number
  rewardCost: number
  roi: number
  byMonth: {
    month: string
    codesGenerated: number
    codesUsed: number
    newMembers: number
    revenue: number
  }[]
  topReferrers: {
    memberId: string
    memberName: string
    phone: string
    referralCount: number
    rewardEarned: number
  }[]
}

export function ReferralFunnelPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const storeId = user?.storeId || 'default'

  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month')

  // Fetch referral funnel data
  const { data, isLoading } = useQuery({
    queryKey: ['referral-funnel', storeId, period],
    queryFn: () => marketingApi.referralFunnel(storeId, period)
  })

  const funnel: ReferralFunnel = data?.data?.data || {
    codesGenerated: 0,
    codesUsed: 0,
    newRegistrations: 0,
    firstPurchase: 0,
    repeatPurchase: 0,
    totalReferralRevenue: 0,
    rewardCost: 0,
    roi: 0,
    byMonth: [],
    topReferrers: []
  }

  const formatCurrency = (value: number) => `Rp ${value.toLocaleString('id-ID')}`

  const getPeriodLabel = (p: string) => {
    switch (p) {
      case 'month': return t('marketing.thisMonth')
      case 'quarter': return t('marketing.thisQuarter')
      case 'year': return t('marketing.thisYear')
      default: return p
    }
  }

  // Funnel steps
  const funnelSteps = [
    { key: 'codesGenerated', label: t('marketing.codesGenerated'), value: funnel.codesGenerated, color: 'bg-blue-500' },
    { key: 'codesUsed', label: t('marketing.codesUsed'), value: funnel.codesUsed, color: 'bg-indigo-500' },
    { key: 'newRegistrations', label: t('marketing.newRegistrations'), value: funnel.newRegistrations, color: 'bg-purple-500' },
    { key: 'firstPurchase', label: t('marketing.firstPurchase'), value: funnel.firstPurchase, color: 'bg-pink-500' },
    { key: 'repeatPurchase', label: t('marketing.repeatPurchase'), value: funnel.repeatPurchase, color: 'bg-green-500' }
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <TrendingUp size={24} className="text-primary" />
          <h1 className="text-xl font-semibold">{t('marketing.referralFunnel')}</h1>
        </div>

        {/* Period Filter */}
        <div className="flex gap-2">
          {(['month', 'quarter', 'year'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${period === p ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              {getPeriodLabel(p)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="card text-center">
              <div className="text-3xl font-bold text-primary">{funnel.codesUsed}</div>
              <div className="text-sm text-gray-500 mt-1">{t('marketing.referralsCompleted')}</div>
            </div>
            <div className="card text-center">
              <div className="text-3xl font-bold text-green-600">{funnel.totalReferralRevenue}</div>
              <div className="text-sm text-gray-500 mt-1">{t('marketing.referralRevenue')}</div>
            </div>
            <div className="card text-center">
              <div className="text-3xl font-bold text-warning">{formatCurrency(funnel.rewardCost)}</div>
              <div className="text-sm text-gray-500 mt-1">{t('marketing.rewardCost')}</div>
            </div>
            <div className="card text-center">
              <div className="text-3xl font-bold text-info">{funnel.roi}%</div>
              <div className="text-sm text-gray-500 mt-1">ROI</div>
            </div>
          </div>

          {/* Funnel Visualization */}
          <div className="card mb-6">
            <h3 className="font-semibold mb-4">{t('marketing.conversionFunnel')}</h3>
            <div className="space-y-3">
              {funnelSteps.map((step, index) => {
                const widthPercent = funnelSteps[0].value > 0 ? Math.round((step.value / funnelSteps[0].value) * 100) : 0
                const dropOff = index > 0 && funnelSteps[index - 1].value > 0
                  ? Math.round(((funnelSteps[index - 1].value - step.value) / funnelSteps[index - 1].value) * 100)
                  : 0

                return (
                  <div key={step.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{step.label}</span>
                      <span className="text-sm">
                        <span className="font-bold">{step.value}</span>
                        <span className="text-gray-400 ml-2">({widthPercent}%)</span>
                      </span>
                    </div>
                    <div className="w-full h-8 bg-gray-100 rounded-lg overflow-hidden">
                      <div
                        className={`h-full ${step.color} transition-all duration-500`}
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>
                    {dropOff > 0 && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-red-500">
                        <ArrowDown size={12} />
                        <span>{dropOff}% drop-off</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Referrers */}
            <div className="card">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Gift size={18} className="text-primary" />
                {t('marketing.topReferrers')}
              </h3>
              {funnel.topReferrers.length > 0 ? (
                <div className="space-y-3">
                  {funnel.topReferrers.slice(0, 10).map((referrer, index) => (
                    <div key={referrer.memberId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${index < 3 ? 'bg-primary text-white' : 'bg-gray-300 text-gray-700'}`}>
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium">{referrer.memberName}</div>
                          <div className="text-xs text-gray-500">{referrer.phone}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-primary">{referrer.referralCount}</div>
                        <div className="text-xs text-gray-500">{t('marketing.referrals')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500 py-8">{t('common.noData')}</p>
              )}
            </div>

            {/* Monthly Trend */}
            <div className="card">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <TrendingUp size={18} className="text-primary" />
                {t('marketing.monthlyTrend')}
              </h3>
              {funnel.byMonth.length > 0 ? (
                <div className="space-y-3">
                  {funnel.byMonth.map((month) => (
                    <div key={month.month} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="text-sm font-medium">{month.month}</div>
                      <div className="flex items-center gap-6 text-sm">
                        <div>
                          <span className="text-gray-500">{t('marketing.codes')}:</span>{' '}
                          <span className="font-medium">{month.codesUsed}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">{t('marketing.members')}:</span>{' '}
                          <span className="font-medium">{month.newMembers}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Revenue:</span>{' '}
                          <span className="font-medium text-green-600">{formatCurrency(month.revenue)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500 py-8">{t('common.noData')}</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}