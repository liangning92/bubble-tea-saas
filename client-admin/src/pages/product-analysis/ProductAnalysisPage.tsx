import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { productAnalysisApi } from '../../services/api'
import { formatCurrency } from '../../utils/helpers'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts'
import {
  Sparkles, TrendingUp, HelpCircle, AlertCircle,
  Layers, Award, BarChart2, DollarSign, Package
} from 'lucide-react'

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

export function ProductAnalysisPage() {
  const { t } = useTranslation()
  const [days, setDays] = useState(30)
  const [selectedQuadrant, setSelectedQuadrant] = useState<'all' | 'star' | 'plowhorse' | 'puzzle' | 'dog'>('all')

  // ABC Data
  const { data: abcData, isLoading: abcLoading } = useQuery({
    queryKey: ['product-analysis', 'abc', days],
    queryFn: () => productAnalysisApi.abc(days)
  })

  // Mix Data
  const { data: mixData, isLoading: mixLoading } = useQuery({
    queryKey: ['product-analysis', 'mix', days],
    queryFn: () => productAnalysisApi.mix(days)
  })

  // Matrix Data (Menu Engineering)
  const { data: matrixData, isLoading: matrixLoading } = useQuery({
    queryKey: ['product-analysis', 'matrix', days],
    queryFn: () => productAnalysisApi.matrix(days)
  })

  const { data: trendData, isLoading: trendLoading } = useQuery({
    queryKey: ['product-analysis', 'trend', days],
    queryFn: () => productAnalysisApi.trend(days)
  })


  const trendList = trendData?.data?.data?.list || []

  const abcList = abcData?.data?.data?.list || []
  const mixList = mixData?.data?.data?.list || []
  const matrixResult = matrixData?.data?.data || {
    benchmarks: { avgQuantity: 0, avgMargin: 0, totalRevenue: 0, totalQuantity: 0, productCount: 0 },
    counts: { star: 0, plowhorse: 0, puzzle: 0, dog: 0 },
    products: []
  }

  const { benchmarks, counts, products: matrixProducts } = matrixResult

  // Filter products by selected quadrant
  const filteredMatrixProducts = matrixProducts.filter((item: any) => {
    if (selectedQuadrant === 'all') return true
    return item.matrixType === selectedQuadrant
  })

  const totalRevenue = mixList.reduce((sum: number, item: any) => sum + (item.revenue || 0), 0)
  const totalItemsSold = mixList.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0)

  const getCategoryData = () => {
    const catMap: Record<string, { name: string; revenue: number; orders: number }> = {}
    mixList.forEach((item: any) => {
      const cat = item.category || t('productAnalysis.otherCategory')
      if (!catMap[cat]) catMap[cat] = { name: cat, revenue: 0, orders: 0 }
      catMap[cat].revenue += item.revenue || 0
      catMap[cat].orders += item.quantity || 0
    })
    return Object.values(catMap).sort((a, b) => b.revenue - a.revenue)
  }

  const categoryChartData = getCategoryData()

  // Quadrant style helpers
  const getQuadrantBadge = (type: string) => {
    switch (type) {
      case 'star':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Sparkles size={12} className="text-amber-500 fill-amber-500" />
            {t('productAnalysis.stars')}
          </span>
        )
      case 'plowhorse':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <TrendingUp size={12} className="text-blue-500" />
            {t('productAnalysis.plowhorses')}
          </span>
        )
      case 'puzzle':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <HelpCircle size={12} className="text-purple-500" />
            {t('productAnalysis.puzzles')}
          </span>
        )
      case 'dog':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle size={12} className="text-rose-500" />
            {t('productAnalysis.dogs')}
          </span>
        )
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 顶部标题与时间筛选 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 className="text-primary" size={24} />
            {t('productAnalysis.title')}
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            {t('productAnalysis.matrixDesc')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-400">统计周期:</span>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="input text-sm font-medium py-1.5 px-3 rounded-lg border-gray-200 focus:border-primary shadow-sm"
          >
            <option value={7}>近 7 {t('productAnalysis.days')}</option>
            <option value={30}>近 30 {t('productAnalysis.days')}</option>
            <option value={90}>近 90 {t('productAnalysis.days')}</option>
            <option value={365}>近 1 {t('productAnalysis.year')}</option>
          </select>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('productAnalysis.salesTrend')}</h2>
        {trendLoading ? <div className="text-center py-8">{t('common.loading')}</div> : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendList}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2} dot={false} name={t('productAnalysis.revenue')} />
                <Line type="monotone" dataKey="grossProfit" stroke="#6366f1" strokeWidth={2} dot={false} name={t('productAnalysis.grossProfit')} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-medium text-gray-500">{t('productAnalysis.totalRevenue')}</span>
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <DollarSign size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900 font-mono tracking-tight">{formatCurrency(totalRevenue)}</p>
          <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
            <span>筛选期内营业额汇总</span>
          </p>
        </div>

        <div className="card bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-medium text-gray-500">{t('productAnalysis.productsSold')}</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Package size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900 font-mono tracking-tight">{totalItemsSold} <span className="text-sm font-normal text-gray-500">{t('productAnalysis.orders')}</span></p>
          <p className="text-xs text-gray-400 mt-1.5">
            共销售 {mixList.length} 款不同品项
          </p>
        </div>

        <div className="card bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-medium text-gray-500">{t('productAnalysis.classA')} (核心贡献)</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Award size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 font-mono tracking-tight">
            {abcList.filter((i: any) => i.class === 'A').length} <span className="text-sm font-normal text-gray-500">款</span>
          </p>
          <p className="text-xs text-gray-400 mt-1.5">
            贡献了全店前 80% 的销售额
          </p>
        </div>

        <div className="card bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-medium text-gray-500">{t('productAnalysis.avgMargin')}基准</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Layers size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600 font-mono tracking-tight">{benchmarks.avgMargin}%</p>
          <p className="text-xs text-gray-400 mt-1.5">
            品项平均销量: {benchmarks.avgQuantity} 杯
          </p>
        </div>
      </div>

      {/* ==================== 菜单工程·波士顿四象限分析 (核心新特性) ==================== */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900">{t('productAnalysis.matrixTitle')}</h2>
              <span className="px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full">经营决策引擎</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              以全店平均销量（{benchmarks.avgQuantity} 杯）与平均毛利率（{benchmarks.avgMargin}%）为基准划分，制定精准定价与营销策略
            </p>
          </div>

          {/* 象限分类筛选切换器 */}
          <div className="flex flex-wrap gap-1.5 p-1 bg-gray-100/80 rounded-xl">
            <button
              onClick={() => setSelectedQuadrant('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                selectedQuadrant === 'all' ? 'bg-white text-gray-900 shadow-sm font-semibold' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('productAnalysis.allQuadrants')} ({matrixProducts.length})
            </button>
            <button
              onClick={() => setSelectedQuadrant('star')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1 ${
                selectedQuadrant === 'star' ? 'bg-white text-amber-700 shadow-sm font-semibold' : 'text-gray-600 hover:text-amber-700'
              }`}
            >
              <span>⭐ 明星</span>
              <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[10px]">{counts.star}</span>
            </button>
            <button
              onClick={() => setSelectedQuadrant('plowhorse')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1 ${
                selectedQuadrant === 'plowhorse' ? 'bg-white text-blue-700 shadow-sm font-semibold' : 'text-gray-600 hover:text-blue-700'
              }`}
            >
              <span>🐂 引流</span>
              <span className="px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 text-[10px]">{counts.plowhorse}</span>
            </button>
            <button
              onClick={() => setSelectedQuadrant('puzzle')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1 ${
                selectedQuadrant === 'puzzle' ? 'bg-white text-purple-700 shadow-sm font-semibold' : 'text-gray-600 hover:text-purple-700'
              }`}
            >
              <span>❓ 潜力</span>
              <span className="px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-800 text-[10px]">{counts.puzzle}</span>
            </button>
            <button
              onClick={() => setSelectedQuadrant('dog')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1 ${
                selectedQuadrant === 'dog' ? 'bg-white text-rose-700 shadow-sm font-semibold' : 'text-gray-600 hover:text-rose-700'
              }`}
            >
              <span>🐶 淘汰</span>
              <span className="px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-800 text-[10px]">{counts.dog}</span>
            </button>
          </div>
        </div>

        {/* 四宫格卡片概览 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* 明星 */}
          <div
            onClick={() => setSelectedQuadrant(selectedQuadrant === 'star' ? 'all' : 'star')}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
              selectedQuadrant === 'star' ? 'border-amber-400 bg-amber-50/50 shadow-sm' : 'border-gray-100 hover:border-amber-200 bg-gray-50/50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-amber-700 flex items-center gap-1">
                <Sparkles size={14} className="text-amber-500 fill-amber-500" />
                {t('productAnalysis.stars')}
              </span>
              <span className="text-xl font-black text-amber-600 font-mono">{counts.star}</span>
            </div>
            <p className="text-xs text-gray-500 font-medium">{t('productAnalysis.starDesc')}</p>
            <p className="text-[11px] text-amber-800/80 mt-2 bg-amber-100/60 p-2 rounded-lg leading-relaxed">
              {t('productAnalysis.starHint')}
            </p>
          </div>

          {/* 引流 (Plowhorses) */}
          <div
            onClick={() => setSelectedQuadrant(selectedQuadrant === 'plowhorse' ? 'all' : 'plowhorse')}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
              selectedQuadrant === 'plowhorse' ? 'border-blue-400 bg-blue-50/50 shadow-sm' : 'border-gray-100 hover:border-blue-200 bg-gray-50/50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-blue-700 flex items-center gap-1">
                <TrendingUp size={14} className="text-blue-500" />
                {t('productAnalysis.plowhorses')}
              </span>
              <span className="text-xl font-black text-blue-600 font-mono">{counts.plowhorse}</span>
            </div>
            <p className="text-xs text-gray-500 font-medium">{t('productAnalysis.plowhorseDesc')}</p>
            <p className="text-[11px] text-blue-800/80 mt-2 bg-blue-100/60 p-2 rounded-lg leading-relaxed">
              {t('productAnalysis.plowhorseHint')}
            </p>
          </div>

          {/* 潜力 (Puzzles) */}
          <div
            onClick={() => setSelectedQuadrant(selectedQuadrant === 'puzzle' ? 'all' : 'puzzle')}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
              selectedQuadrant === 'puzzle' ? 'border-purple-400 bg-purple-50/50 shadow-sm' : 'border-gray-100 hover:border-purple-200 bg-gray-50/50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-purple-700 flex items-center gap-1">
                <HelpCircle size={14} className="text-purple-500" />
                {t('productAnalysis.puzzles')}
              </span>
              <span className="text-xl font-black text-purple-600 font-mono">{counts.puzzle}</span>
            </div>
            <p className="text-xs text-gray-500 font-medium">{t('productAnalysis.puzzleDesc')}</p>
            <p className="text-[11px] text-purple-800/80 mt-2 bg-purple-100/60 p-2 rounded-lg leading-relaxed">
              {t('productAnalysis.puzzleHint')}
            </p>
          </div>

          {/* 淘汰 (Dogs) */}
          <div
            onClick={() => setSelectedQuadrant(selectedQuadrant === 'dog' ? 'all' : 'dog')}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
              selectedQuadrant === 'dog' ? 'border-rose-400 bg-rose-50/50 shadow-sm' : 'border-gray-100 hover:border-rose-200 bg-gray-50/50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-rose-700 flex items-center gap-1">
                <AlertCircle size={14} className="text-rose-500" />
                {t('productAnalysis.dogs')}
              </span>
              <span className="text-xl font-black text-rose-600 font-mono">{counts.dog}</span>
            </div>
            <p className="text-xs text-gray-500 font-medium">{t('productAnalysis.dogDesc')}</p>
            <p className="text-[11px] text-rose-800/80 mt-2 bg-rose-100/60 p-2 rounded-lg leading-relaxed">
              {t('productAnalysis.dogHint')}
            </p>
          </div>
        </div>

        {/* 菜单工程明细表格 */}
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-gray-50/80 text-gray-500 border-b border-gray-100 font-medium text-xs">
                <th className="py-3 px-4">{t('products.name')}</th>
                <th className="py-3 px-3">象限定位</th>
                <th className="py-3 px-3 text-right">销量 (杯)</th>
                <th className="py-3 px-3 text-right">均价</th>
                <th className="py-3 px-3 text-right">{t('productAnalysis.cost')}</th>
                <th className="py-3 px-3 text-right">{t('productAnalysis.revenue')}</th>
                <th className="py-3 px-3 text-right">{t('productAnalysis.margin')}</th>
                <th className="py-3 px-4">{t('productAnalysis.actionStrategy')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {matrixLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : filteredMatrixProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                filteredMatrixProducts.map((item: any) => (
                  <tr key={item.productId} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-gray-900">
                      <div>{item.productName}</div>
                      {item.code && <span className="text-xs font-mono text-gray-400">{item.code}</span>}
                    </td>
                    <td className="py-3.5 px-3">
                      {getQuadrantBadge(item.matrixType)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-medium text-gray-900">
                      {item.quantity}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-gray-600">
                      {formatCurrency(item.avgPrice)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-gray-500">
                      {formatCurrency(item.avgCost)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-bold text-gray-900">
                      {formatCurrency(item.revenue)}
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <span className={`font-mono font-bold ${
                        item.margin >= benchmarks.avgMargin ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {item.margin}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-600 max-w-xs">
                      {t(item.actionHint)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('productAnalysis.productMargins')}</h2>
        {mixLoading ? <div className="text-center py-8">{t('common.loading')}</div> : (
          <div className="overflow-x-auto"><table className="w-full">
            <thead><tr className="text-left text-sm text-gray-500 border-b"><th className="pb-3">{t('products.name')}</th><th>{t('productAnalysis.category')}</th><th className="text-right">{t('productAnalysis.revenue')}</th><th className="text-right">{t('productAnalysis.cost')}</th><th className="text-right">{t('productAnalysis.grossMargin')}</th></tr></thead>
            <tbody>{mixList.map((item: any) => <tr key={item.productId} className="border-b last:border-0"><td className="py-3 font-medium">{item.productName}</td><td>{item.category}</td><td className="text-right">{formatCurrency(item.revenue)}</td><td className="text-right">{formatCurrency(item.cost)}</td><td className="text-right">{item.margin || 0}%</td></tr>)}</tbody>
          </table></div>
        )}
      </div>

      {/* ==================== 修复后的 ABC 营收贡献分析表格 ==================== */}
      <div className="card bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{t('productAnalysis.abcTitle')}</h2>
            <p className="text-xs text-gray-500 mt-1">{t('productAnalysis.abcDesc')}</p>
          </div>
        </div>

        {abcLoading ? (
          <div className="text-center py-12 text-gray-400">{t('common.loading')}</div>
        ) : abcList.length === 0 ? (
          <div className="text-center py-12 text-gray-400">{t('common.noData')}</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50/80 text-gray-500 border-b border-gray-100 font-medium text-xs">
                  <th className="py-3 px-4 w-16">{t('productAnalysis.rank')}</th>
                  <th className="py-3 px-4">{t('products.name')}</th>
                  <th className="py-3 px-4 w-28 text-center">{t('productAnalysis.class')}</th>
                  <th className="py-3 px-4 text-right">{t('productAnalysis.revenue')}</th>
                  <th className="py-3 px-4 text-right">% {t('productAnalysis.total')}</th>
                  <th className="py-3 px-4 text-right">{t('productAnalysis.orders')} (杯)</th>
                  <th className="py-3 px-4 text-right">{t('productAnalysis.margin')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {abcList.map((item: any, index: number) => {
                  const displayName = item.productName || item.name || '-'
                  const displayClass = item.class || item.category || 'C'
                  const displayPercent = typeof item.percentage === 'number'
                    ? (item.percentage * 100).toFixed(1)
                    : '0.0'

                  return (
                    <tr key={item.productId || index} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-gray-400">{index + 1}</td>
                      <td className="py-3.5 px-4 font-semibold text-gray-900">
                        {displayName}
                        {item.code && <span className="text-xs font-mono text-gray-400 ml-2">[{item.code}]</span>}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          displayClass === 'A' ? 'bg-emerald-100 text-emerald-800' :
                          displayClass === 'B' ? 'bg-amber-100 text-amber-800' :
                          'bg-rose-100 text-rose-800'
                        }`}>
                          {displayClass} 类
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-gray-900">{formatCurrency(item.revenue || 0)}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-gray-500">{displayPercent}%</td>
                      <td className="py-3.5 px-4 text-right font-mono text-gray-700">{item.quantity || 0}</td>
                      <td className="py-3.5 px-4 text-right font-mono font-medium text-gray-600">
                        {item.margin !== undefined ? `${item.margin}%` : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 图表展示区：销量 TOP 10 与 品类占比 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h2 className="text-base font-bold text-gray-900 mb-4">{t('productAnalysis.mixTitle')} (TOP 10)</h2>
          {mixLoading ? (
            <div className="text-center py-16 text-gray-400">{t('common.loading')}</div>
          ) : mixList.length === 0 ? (
            <div className="text-center py-16 text-gray-400">{t('common.noData')}</div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mixList.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                  <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="productName" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), t('productAnalysis.revenue')]}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h2 className="text-base font-bold text-gray-900 mb-4">{t('productAnalysis.categoryMix')}</h2>
          {mixLoading ? (
            <div className="text-center py-16 text-gray-400">{t('common.loading')}</div>
          ) : categoryChartData.length === 0 ? (
            <div className="text-center py-16 text-gray-400">{t('common.noData')}</div>
          ) : (
            <div className="h-72 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryChartData}
                    dataKey="revenue"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={95}
                    innerRadius={50}
                    paddingAngle={3}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {categoryChartData.map((_: any, index: number) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), t('productAnalysis.revenue')]}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}