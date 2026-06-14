import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { productAnalysisApi } from '../../services/api'
import { formatCurrency } from '../../utils/helpers'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const COLORS = ['#22c55e', '#eab308', '#ef4444']

export function ProductAnalysisPage() {
  const { t } = useTranslation()
  const [days, setDays] = useState(30)

  const { data: abcData, isLoading: abcLoading } = useQuery({
    queryKey: ['product-analysis', 'abc', days],
    queryFn: () => productAnalysisApi.abc(days)
  })

  const { data: mixData, isLoading: mixLoading } = useQuery({
    queryKey: ['product-analysis', 'mix', days],
    queryFn: () => productAnalysisApi.mix(days)
  })

  const abcList = abcData?.data?.data?.list || []
  const mixList = mixData?.data?.data?.list || []

  const totalRevenue = mixList.reduce((sum: number, item: any) => sum + (item.revenue || 0), 0)

  const getCategoryData = () => {
    const catMap: any = {}
    mixList.forEach((item: any) => {
      const cat = item.category || 'Other'
      if (!catMap[cat]) catMap[cat] = { name: cat, revenue: 0, orders: 0 }
      catMap[cat].revenue += item.revenue || 0
      catMap[cat].orders += item.quantity || 0
    })
    return Object.values(catMap).sort((a: any, b: any) => b.revenue - a.revenue)
  }

  const categoryChartData = getCategoryData()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value))}
          className="input w-40"
        >
          <option value={7}>7 {t('productAnalysis.days')}</option>
          <option value={30}>30 {t('productAnalysis.days')}</option>
          <option value={90}>90 {t('productAnalysis.days')}</option>
          <option value={365}>1 {t('productAnalysis.year')}</option>
        </select>
      </div>

      {/* ABC Analysis */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('productAnalysis.abcTitle')}</h2>
        <p className="text-sm text-gray-500 mb-4">{t('productAnalysis.abcDesc')}</p>
        {abcLoading ? (
          <div className="text-center py-8">{t('common.loading')}</div>
        ) : abcList.length === 0 ? (
          <div className="text-center py-8 text-gray-500">{t('common.noData')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">{t('productAnalysis.rank')}</th>
                  <th className="pb-3 font-medium">{t('products.name')}</th>
                  <th className="pb-3 font-medium">{t('productAnalysis.class')}</th>
                  <th className="pb-3 font-medium">{t('productAnalysis.revenue')}</th>
                  <th className="pb-3 font-medium">% {t('productAnalysis.total')}</th>
                  <th className="pb-3 font-medium">{t('productAnalysis.orders')}</th>
                </tr>
              </thead>
              <tbody>
                {abcList.map((item: any, index: number) => (
                  <tr key={item.productId} className="border-b last:border-0">
                    <td className="py-3 text-gray-500">{index + 1}</td>
                    <td className="py-3 font-medium text-gray-900">{item.productName}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        item.class === 'A' ? 'bg-green-100 text-green-700' :
                        item.class === 'B' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {item.class}
                      </span>
                    </td>
                    <td className="py-3 font-medium">{formatCurrency(item.revenue)}</td>
                    <td className="py-3 text-gray-500">{(item.percentage * 100).toFixed(1)}%</td>
                    <td className="py-3 text-gray-500">{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Product Mix Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('productAnalysis.mixTitle')}</h2>
          {mixLoading ? (
            <div className="text-center py-8">{t('common.loading')}</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mixList.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis type="category" dataKey="productName" width={100} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="revenue" fill="#22c55e" name={t('productAnalysis.revenue')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('productAnalysis.categoryMix')}</h2>
          {mixLoading ? (
            <div className="text-center py-8">{t('common.loading')}</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryChartData}
                    dataKey="revenue"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {categoryChartData.map((_: any, index: number) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-2xl font-bold text-primary">{formatCurrency(totalRevenue)}</p>
          <p className="text-sm text-gray-500">{t('productAnalysis.totalRevenue')}</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-primary">{mixList.length}</p>
          <p className="text-sm text-gray-500">{t('productAnalysis.productsSold')}</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-green-600">
            {abcList.filter((i: any) => i.class === 'A').length}
          </p>
          <p className="text-sm text-gray-500">{t('productAnalysis.classA')}</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-yellow-600">
            {abcList.filter((i: any) => i.class === 'B').length}
          </p>
          <p className="text-sm text-gray-500">{t('productAnalysis.classB')}</p>
        </div>
      </div>
    </div>
  )
}