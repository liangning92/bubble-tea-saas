import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { reportApi } from '../../services/api'
import { formatCurrency } from '../../utils/helpers'
import { Loader2, Percent, AlertCircle } from 'lucide-react'
import { format, subDays } from 'date-fns'

export function ChannelCommissionPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [dateRange, setDateRange] = useState({
    startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd')
  })

  const { data, isLoading } = useQuery({
    queryKey: ['channel-commissions', dateRange],
    queryFn: () => reportApi.getCommissionReports({
      storeId: user?.storeId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate
    }),
    enabled: !!user?.storeId
  })

  const commissionData = data?.data?.data
  const summaries = commissionData?.list || []
  const totals = commissionData?.totalCommission || 0

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

      {/* Summary */}
      <div className="card mb-6 bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200">
        <div className="flex items-center gap-4">
          <div className="p-4 rounded-xl bg-orange-100">
            <Percent size={32} className="text-orange-600" />
          </div>
          <div>
            <p className="text-sm text-orange-600 font-medium">{t('channels.totalCommission') || 'Total Commission'}</p>
            <p className="text-3xl font-bold text-orange-700">{formatCurrency(totals)}</p>
            <p className="text-xs text-orange-500 mt-1">
              {t('channels.commissionPeriod') || 'Period'}: {dateRange.startDate} ~ {dateRange.endDate}
            </p>
          </div>
        </div>
      </div>

      {/* Commission Table */}
      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : summaries.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">{t('common.noData') || 'No commission data for this period'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">{t('channels.channel') || 'Channel'}</th>
                  <th className="pb-3 font-medium text-right">{t('channels.rate') || 'Rate'}</th>
                  <th className="pb-3 font-medium text-right">{t('channels.orders') || 'Orders'}</th>
                  <th className="pb-3 font-medium text-right">{t('channels.grossRevenue') || 'Gross Revenue'}</th>
                  <th className="pb-3 font-medium text-right">{t('channels.commissionAmount') || 'Commission'}</th>
                  <th className="pb-3 font-medium text-right">{t('channels.netRevenue') || 'Net Revenue'}</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((item: any) => (
                  <tr key={item.channelId} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{item.icon}</span>
                        <span className="font-medium">{item.channelName}</span>
                      </div>
                    </td>
                    <td className="py-4 text-right">
                      <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-lg text-sm font-medium">
                        {(item.commissionRate * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-4 text-right font-medium">
                      {item.orderCount}
                    </td>
                    <td className="py-4 text-right font-medium text-gray-700">
                      {formatCurrency(item.grossRevenue)}
                    </td>
                    <td className="py-4 text-right">
                      <span className="text-red-600 font-bold">
                        -{formatCurrency(item.commissionAmount)}
                      </span>
                    </td>
                    <td className="py-4 text-right text-green-600 font-bold">
                      {formatCurrency(item.netRevenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold">
                  <td className="py-4">
                    {t('common.total') || 'Total'}
                  </td>
                  <td></td>
                  <td className="py-4 text-right">
                    {summaries.reduce((sum: number, item: any) => sum + item.orderCount, 0)}
                  </td>
                  <td className="py-4 text-right">
                    {formatCurrency(summaries.reduce((sum: number, item: any) => sum + item.grossRevenue, 0))}
                  </td>
                  <td className="py-4 text-right text-red-600">
                    -{formatCurrency(totals)}
                  </td>
                  <td className="py-4 text-right text-green-600">
                    {formatCurrency(summaries.reduce((sum: number, item: any) => sum + item.netRevenue, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
