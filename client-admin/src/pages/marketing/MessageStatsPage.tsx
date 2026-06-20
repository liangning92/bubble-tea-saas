import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2, MessageSquare, TrendingUp, Clock, BarChart3 } from 'lucide-react'

interface MessageStats {
  totalSent: number
  totalDelivered: number
  totalFailed: number
  deliveryRate: number
  clickRate: number
  byChannel: {
    channel: string
    sent: number
    delivered: number
    failed: number
    deliveryRate: number
  }[]
  byType: {
    type: string
    sent: number
    delivered: number
    failed: number
  }[]
  dailyStats: {
    date: string
    sent: number
    delivered: number
    failed: number
  }[]
}

export function MessageStatsPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const storeId = user?.storeId || 'default'

  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week')

  // Fetch message stats
  const { data, isLoading } = useQuery({
    queryKey: ['message-stats', storeId, period],
    queryFn: () => marketingApi.messageStats(storeId, period)
  })

  const stats: MessageStats = data?.data || {
    totalSent: 0,
    totalDelivered: 0,
    totalFailed: 0,
    deliveryRate: 0,
    clickRate: 0,
    byChannel: [],
    byType: [],
    dailyStats: []
  }

  const getPeriodLabel = (p: string) => {
    switch (p) {
      case 'today': return t('marketing.today')
      case 'week': return t('marketing.thisWeek')
      case 'month': return t('marketing.thisMonth')
      default: return p
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 size={24} className="text-primary" />
          <h1 className="text-xl font-semibold">{t('marketing.messageStats')}</h1>
        </div>

        {/* Period Filter */}
        <div className="flex gap-2">
          {(['today', 'week', 'month'] as const).map(p => (
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card text-center">
          <div className="text-3xl font-bold text-primary">{stats.totalSent.toLocaleString()}</div>
          <div className="text-sm text-gray-500 mt-1">{t('marketing.totalSent')}</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-green-600">{stats.totalDelivered.toLocaleString()}</div>
          <div className="text-sm text-gray-500 mt-1">{t('marketing.totalDelivered')}</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-red-600">{stats.totalFailed.toLocaleString()}</div>
          <div className="text-sm text-gray-500 mt-1">{t('marketing.totalFailed')}</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-info">{stats.deliveryRate}%</div>
          <div className="text-sm text-gray-500 mt-1">{t('marketing.deliveryRate')}</div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* By Channel */}
          <div className="card">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <MessageSquare size={18} className="text-primary" />
              {t('marketing.statsByChannel')}
            </h3>
            {stats.byChannel.length > 0 ? (
              <div className="space-y-3">
                {stats.byChannel.map((ch) => (
                  <div key={ch.channel} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${ch.channel === 'whatsapp' ? 'bg-green-500' : ch.channel === 'sms' ? 'bg-blue-500' : 'bg-gray-400'}`} />
                      <span className="font-medium capitalize">{ch.channel}</span>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <span className="text-gray-500">{ch.sent} sent</span>
                      <span className="text-green-600">{ch.delivered} delivered</span>
                      <span className="text-gray-600">{ch.deliveryRate}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">{t('common.noData')}</p>
            )}
          </div>

          {/* By Type */}
          <div className="card">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <TrendingUp size={18} className="text-primary" />
              {t('marketing.statsByType')}
            </h3>
            {stats.byType.length > 0 ? (
              <div className="space-y-3">
                {stats.byType.map((type) => (
                  <div key={type.type} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                        <MessageSquare size={16} className="text-primary" />
                      </div>
                      <span className="font-medium">{t(`marketing.msgType${type.type.charAt(0).toUpperCase() + type.type.slice(1)}`)}</span>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <span className="text-gray-500">{type.sent} sent</span>
                      <span className="text-green-600">{type.delivered} delivered</span>
                      <span className="text-red-600">{type.failed} failed</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">{t('common.noData')}</p>
            )}
          </div>

          {/* Daily Stats */}
          <div className="card md:col-span-2">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Clock size={18} className="text-primary" />
              {t('marketing.dailyTrend')}
            </h3>
            {stats.dailyStats.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-gray-500 border-b">
                      <th className="pb-3 font-medium">{t('marketing.date')}</th>
                      <th className="pb-3 font-medium">{t('marketing.sent')}</th>
                      <th className="pb-3 font-medium">{t('marketing.delivered')}</th>
                      <th className="pb-3 font-medium">{t('marketing.failed')}</th>
                      <th className="pb-3 font-medium">{t('marketing.deliveryRate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.dailyStats.map((day) => (
                      <tr key={day.date} className="border-b last:border-0">
                        <td className="py-3">{new Date(day.date).toLocaleDateString('id-ID')}</td>
                        <td className="py-3">{day.sent}</td>
                        <td className="py-3 text-green-600">{day.delivered}</td>
                        <td className="py-3 text-red-600">{day.failed}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${day.sent > 0 ? (day.delivered / day.sent) * 100 : 0}%` }}
                              />
                            </div>
                            <span className="text-sm">{day.sent > 0 ? Math.round((day.delivered / day.sent) * 100) : 0}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">{t('common.noData')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}