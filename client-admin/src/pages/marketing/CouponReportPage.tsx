import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2, Ticket, BarChart3 } from 'lucide-react'

interface CouponReport {
  couponId: string
  couponCode: string
  couponType: string
  totalIssued: number
  totalUsed: number
  usageRate: number
  totalDiscount: number
  avgDiscount: number
  byMonth: {
    month: string
    issued: number
    used: number
  }[]
}

export function CouponReportPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const storeId = user?.storeId || 'default'

  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month')

  // Fetch coupon reports
  const { data, isLoading } = useQuery({
    queryKey: ['coupon-reports', storeId, period],
    queryFn: () => marketingApi.couponReports(storeId, period)
  })

  const reports: CouponReport[] = data?.data?.data || []

  // Calculate summary
  const summary = reports.reduce((acc, r) => ({
    totalIssued: acc.totalIssued + r.totalIssued,
    totalUsed: acc.totalUsed + r.totalUsed,
    totalDiscount: acc.totalDiscount + r.totalDiscount
  }), { totalIssued: 0, totalUsed: 0, totalDiscount: 0 })

  const overallUsageRate = summary.totalIssued > 0 ? Math.round((summary.totalUsed / summary.totalIssued) * 100) : 0

  const formatCurrency = (value: number) => `Rp ${value.toLocaleString('id-ID')}`

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'discount_percent': return t('marketing.discount_percent')
      case 'discount_fixed': return t('marketing.discount_fixed')
      case 'free_product': return t('marketing.free_product')
      case 'free_delivery': return t('marketing.free_delivery')
      default: return type
    }
  }

  const getPeriodLabel = (p: string) => {
    switch (p) {
      case 'month': return t('marketing.thisMonth')
      case 'quarter': return t('marketing.thisQuarter')
      case 'year': return t('marketing.thisYear')
      default: return p
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 size={24} className="text-primary" />
          <h1 className="text-xl font-semibold">{t('marketing.couponReport')}</h1>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card text-center">
          <div className="text-3xl font-bold text-primary">{summary.totalIssued.toLocaleString()}</div>
          <div className="text-sm text-gray-500 mt-1">{t('marketing.totalIssued')}</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-green-600">{summary.totalUsed.toLocaleString()}</div>
          <div className="text-sm text-gray-500 mt-1">{t('marketing.totalUsed')}</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-info">{overallUsageRate}%</div>
          <div className="text-sm text-gray-500 mt-1">{t('marketing.usageRate')}</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-warning">{formatCurrency(summary.totalDiscount)}</div>
          <div className="text-sm text-gray-500 mt-1">{t('marketing.totalDiscount')}</div>
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Ticket size={48} className="mb-4 opacity-50" />
            <p>{t('common.noData')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">{t('marketing.couponCode')}</th>
                  <th className="pb-3 font-medium">{t('marketing.couponType')}</th>
                  <th className="pb-3 font-medium text-right">{t('marketing.issued')}</th>
                  <th className="pb-3 font-medium text-right">{t('marketing.used')}</th>
                  <th className="pb-3 font-medium text-right">{t('marketing.usageRate')}</th>
                  <th className="pb-3 font-medium text-right">{t('marketing.totalDiscount')}</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.couponId} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <Ticket size={16} className="text-primary" />
                        <span className="font-mono font-medium">{report.couponCode}</span>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className="text-sm">{getTypeLabel(report.couponType)}</span>
                    </td>
                    <td className="py-3 text-right">{report.totalIssued}</td>
                    <td className="py-3 text-right text-green-600 font-medium">{report.totalUsed}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${report.usageRate}%` }}
                          />
                        </div>
                        <span className="text-sm w-10">{report.usageRate}%</span>
                      </div>
                    </td>
                    <td className="py-3 text-right font-medium">{formatCurrency(report.totalDiscount)}</td>
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