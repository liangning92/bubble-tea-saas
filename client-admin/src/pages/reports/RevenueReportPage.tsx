import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { financeApi } from '../../services/api'
import { formatCurrency } from '../../utils/helpers'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'
import { Loader2 } from 'lucide-react'

export function RevenueReportPage() {
  const { t } = useTranslation()
  const [days, setDays] = useState(30)

  const { data: revenueData } = useQuery({
    queryKey: ['finance', 'revenue', days],
    queryFn: () => financeApi.revenue({ days }),
  })

  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ['finance', 'daily', days],
    queryFn: () => financeApi.daily({ days }),
  })

  const { data: hourlyData, isLoading: hourlyLoading } = useQuery({
    queryKey: ['finance', 'hourly', days],
    queryFn: () => financeApi.hourly({ days }),
  })

  const revenue = revenueData?.data
  const daily = dailyData?.data?.data?.list || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('reports.revenue')}</h1>
        <div className="flex gap-2">
          <select value={days} onChange={(e) => setDays(parseInt(e.target.value))} className="input w-32">
            <option value={7}>7 {t('reports.days')}</option>
            <option value={30}>30 {t('reports.days')}</option>
            <option value={90}>90 {t('reports.days')}</option>
            <option value={365}>1 {t('reports.year')}</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-2xl font-bold text-primary">{formatCurrency(revenue?.totalRevenue || 0)}</p>
          <p className="text-sm text-gray-500">{t('reports.totalRevenue')}</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-green-600">{formatCurrency(revenue?.totalProfit || 0)}</p>
          <p className="text-sm text-gray-500">{t('reports.profit')}</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-blue-600">{revenue?.orderCount || 0}</p>
          <p className="text-sm text-gray-500">{t('reports.orders')}</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-orange-600">{formatCurrency(revenue?.avgOrderValue || 0)}</p>
          <p className="text-sm text-gray-500">{t('reports.avgOrder')}</p>
        </div>
      </div>

      {/* Daily Trend Chart */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('reports.dailyTrend')}</h2>
        {dailyLoading ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000000).toFixed(0)}jt`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#22c55e" name={t('reports.revenue')} />
                <Line type="monotone" dataKey="profit" stroke="#3b82f6" name={t('reports.profit')} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Hourly Distribution */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('reports.hourlyDist')}</h2>
        <div className="h-64">
          {hourlyLoading ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData?.data?.data?.list || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="orders" fill="#22c55e" name={t('reports.orders')} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}