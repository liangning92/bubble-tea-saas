import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { reportApi } from '../../services/api'
import { formatCurrency } from '../../utils/helpers'
import { Loader2, TrendingUp, TrendingDown, DollarSign, ShoppingCart } from 'lucide-react'
import { format, subDays } from 'date-fns'

export function ChannelReportsPage() {
  const { t } = useTranslation()
  const { user: _user } = useAuthStore()
  const [dateRange, setDateRange] = useState({
    startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd')
  })

  const { data, isLoading } = useQuery({
    queryKey: ['channel-reports', dateRange],
    queryFn: () => reportApi.getChannelReports({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate
    })
  })

  const channels = data?.data?.list || []

  const totals = channels.reduce((acc: any, ch: any) => ({
    orderCount: acc.orderCount + ch.orderCount,
    totalRevenue: acc.totalRevenue + ch.totalRevenue,
    totalCost: acc.totalCost + ch.totalCost,
    totalProfit: acc.totalProfit + ch.totalProfit,
    commissionAmount: acc.commissionAmount + ch.commissionAmount
  }), { orderCount: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0, commissionAmount: 0 })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateRange.startDate}
            onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
            className="input w-36"
          />
          <span className="text-gray-500">-</span>
          <input
            type="date"
            value={dateRange.endDate}
            onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
            className="input w-36"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-100">
            <ShoppingCart size={24} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('channels.totalOrders') || 'Total Orders'}</p>
            <p className="text-2xl font-bold">{totals.orderCount}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 rounded-xl bg-green-100">
            <DollarSign size={24} className="text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('channels.totalRevenue') || 'Total Revenue'}</p>
            <p className="text-2xl font-bold">{formatCurrency(totals.totalRevenue)}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 rounded-xl bg-orange-100">
            <TrendingDown size={24} className="text-orange-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('channels.commission') || 'Commission'}</p>
            <p className="text-2xl font-bold text-orange-600">{formatCurrency(totals.commissionAmount)}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 rounded-xl bg-purple-100">
            <TrendingUp size={24} className="text-purple-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('channels.netRevenue') || 'Net Revenue'}</p>
            <p className="text-2xl font-bold text-purple-600">{formatCurrency(totals.totalRevenue - totals.commissionAmount)}</p>
          </div>
        </div>
      </div>

      {/* Channel Table */}
      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {t('common.noData') || 'No data'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">{t('channels.channel') || 'Channel'}</th>
                  <th className="pb-3 font-medium text-right">{t('channels.orders') || 'Orders'}</th>
                  <th className="pb-3 font-medium text-right">{t('channels.revenue') || 'Revenue'}</th>
                  <th className="pb-3 font-medium text-right">{t('channels.avgOrder') || 'Avg Order'}</th>
                  <th className="pb-3 font-medium text-right">{t('channels.commission') || 'Commission'}</th>
                  <th className="pb-3 font-medium text-right">{t('channels.netRevenue') || 'Net Revenue'}</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((channel: any) => (
                  <tr key={channel.channelId} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{channel.icon}</span>
                        <div>
                          <p className="font-medium text-gray-900">{channel.channelName}</p>
                          <p className="text-xs text-gray-400">{channel.channelCode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 text-right font-medium">
                      {channel.orderCount}
                    </td>
                    <td className="py-4 text-right font-medium">
                      {formatCurrency(channel.totalRevenue)}
                    </td>
                    <td className="py-4 text-right text-gray-500">
                      {channel.orderCount > 0 ? formatCurrency(channel.avgOrderValue) : '-'}
                    </td>
                    <td className="py-4 text-right">
                      <span className="text-orange-600 font-medium">
                        {formatCurrency(channel.commissionAmount)}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">
                        ({(channel.commission * 100).toFixed(0)}%)
                      </span>
                    </td>
                    <td className="py-4 text-right text-purple-600 font-medium">
                      {formatCurrency(channel.netRevenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
