import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { productAnalysisApi } from '../../services/api'
import { formatCurrency } from '../../utils/helpers'
import { TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react'

interface ABCProduct {
  productId: string
  productName: string
  category: string
  revenue: number
  orders: number
  percentage: number
  cumulative: number
  class: 'A' | 'B' | 'C'
}

export function ABCAnalysisPage() {
  const { t } = useTranslation()
  const [days, setDays] = useState(30)
  const [products, setProducts] = useState<ABCProduct[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const loadAnalysis = async () => {
    setIsLoading(true)
    try {
      const response = await productAnalysisApi.abc(days)
      if (response.data?.data?.list) {
        const data = response.data.data.list
        let cumulative = 0
        const totalRevenue = data.reduce((sum: number, p: any) => sum + p.revenue, 0)

        const withCumulative = data.map((item: any) => {
          cumulative += item.revenue
          const percentage = totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0
          let classLabel: 'A' | 'B' | 'C'
          const cumPct = totalRevenue > 0 ? (cumulative / totalRevenue) * 100 : 0
          if (cumPct <= 70) classLabel = 'A'
          else if (cumPct <= 90) classLabel = 'B'
          else classLabel = 'C'

          return {
            productId: item.productId,
            productName: item.productName,
            category: item.category || '-',
            revenue: item.revenue,
            orders: item.orders || 0,
            percentage,
            cumulative: cumPct,
            class: classLabel
          }
        })
        setProducts(withCumulative)
      }
    } catch (error) {
      console.error('Failed to load ABC analysis:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getClassColor = (cls: 'A' | 'B' | 'C') => {
    switch (cls) {
      case 'A': return 'bg-green-100 text-green-700 border-green-200'
      case 'B': return 'bg-yellow-100 text-yellow-700 border-yellow-200'
      case 'C': return 'bg-red-100 text-red-700 border-red-200'
    }
  }

  const getClassIcon = (cls: 'A' | 'B' | 'C') => {
    switch (cls) {
      case 'A': return <TrendingUp size={16} />
      case 'B': return <Minus size={16} />
      case 'C': return <TrendingDown size={16} />
    }
  }

  const classSummary = {
    A: products.filter(p => p.class === 'A').reduce((sum, p) => sum + p.revenue, 0),
    B: products.filter(p => p.class === 'B').reduce((sum, p) => sum + p.revenue, 0),
    C: products.filter(p => p.class === 'C').reduce((sum, p) => sum + p.revenue, 0)
  }
  const totalRevenue = classSummary.A + classSummary.B + classSummary.C

  return (
    <div className="p-6">
      <div className="flex items-center justify-end mb-6">
        <div className="flex items-center gap-3">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="p-2 border border-gray-200 rounded-lg"
          >
            <option value={7}>7 {t('productAnalysis.days')}</option>
            <option value={30}>30 {t('productAnalysis.days')}</option>
            <option value={90}>90 {t('productAnalysis.days')}</option>
            <option value={365}>365 {t('productAnalysis.year')}</option>
          </select>
          <button
            onClick={loadAnalysis}
            disabled={isLoading}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50"
          >
            {isLoading ? t('common.loading') : t('common.search')}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp size={16} className="text-green-600" />
            </div>
            <span className="font-medium text-green-700">Class A</span>
          </div>
          <p className="text-2xl font-bold text-green-700">
            {products.filter(p => p.class === 'A').length} {t('products.title')}
          </p>
          <p className="text-sm text-green-600">
            {totalRevenue > 0 ? Math.round((classSummary.A / totalRevenue) * 100) : 0}% {t('productAnalysis.revenue')}
          </p>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Minus size={16} className="text-yellow-600" />
            </div>
            <span className="font-medium text-yellow-700">Class B</span>
          </div>
          <p className="text-2xl font-bold text-yellow-700">
            {products.filter(p => p.class === 'B').length} {t('products.title')}
          </p>
          <p className="text-sm text-yellow-600">
            {totalRevenue > 0 ? Math.round((classSummary.B / totalRevenue) * 100) : 0}% {t('productAnalysis.revenue')}
          </p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
              <TrendingDown size={16} className="text-red-600" />
            </div>
            <span className="font-medium text-red-700">Class C</span>
          </div>
          <p className="text-2xl font-bold text-red-700">
            {products.filter(p => p.class === 'C').length} {t('products.title')}
          </p>
          <p className="text-sm text-red-600">
            {totalRevenue > 0 ? Math.round((classSummary.C / totalRevenue) * 100) : 0}% {t('productAnalysis.revenue')}
          </p>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-4 border-b">
          <h2 className="font-bold">{t('productAnalysis.productList')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">{t('productAnalysis.rank')}</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">{t('products.name')}</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">{t('products.category')}</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">{t('productAnalysis.orders')}</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">{t('productAnalysis.revenue')}</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">%</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Cum %</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">{t('productAnalysis.class')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map((product, index) => (
                <tr key={product.productId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{index + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium">{product.productName}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{product.category}</td>
                  <td className="px-4 py-3 text-sm text-right">{product.orders}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(product.revenue)}</td>
                  <td className="px-4 py-3 text-sm text-right">{product.percentage.toFixed(1)}%</td>
                  <td className="px-4 py-3 text-sm text-right">{product.cumulative.toFixed(1)}%</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getClassColor(product.class)}`}>
                      {getClassIcon(product.class)}
                      {product.class}
                    </span>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    <BarChart3 size={32} className="mx-auto mb-2 opacity-50" />
                    <p>{t('common.noData')}</p>
                    <button onClick={loadAnalysis} className="text-primary text-sm">{t('productAnalysis.clickToLoad')}</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}