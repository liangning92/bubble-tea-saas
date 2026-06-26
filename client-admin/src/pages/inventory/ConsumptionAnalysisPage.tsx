import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { inventoryApi } from '../../services/api'
import { Loader2, AlertTriangle, AlertCircle, CheckCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react'

type VarianceStatus = 'normal' | 'warning' | 'critical'

interface ConsumptionItem {
  inventoryId: string
  inventoryName: string
  unit: string
  theoreticalConsumption: number
  actualConsumption: number
  variance: number
  variancePercent: number
  varianceStatus: VarianceStatus
  orderCount: number
  lastOrderDate: string | null
}

export function ConsumptionAnalysisPage() {
  const { t } = useTranslation()
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' })
  const [varianceThreshold, setVarianceThreshold] = useState(10)
  const [selectedStatus, setSelectedStatus] = useState<VarianceStatus | 'all'>('all')

  // Quick date range selectors
  const setQuickDateRange = (days: number) => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - days)
    setDateRange({
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    })
  }

  const { data: analysisData, isLoading } = useQuery({
    queryKey: ['consumption-analysis', dateRange.startDate, dateRange.endDate, varianceThreshold],
    queryFn: () => inventoryApi.consumptionAnalysis({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      varianceThreshold
    }),
    enabled: !!dateRange.startDate && !!dateRange.endDate
  })

  const { data: summaryData } = useQuery({
    queryKey: ['anomaly-summary', dateRange.startDate, dateRange.endDate, varianceThreshold],
    queryFn: () => inventoryApi.anomalySummary({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      varianceThreshold
    }),
    enabled: !!dateRange.startDate && !!dateRange.endDate
  })

  const analysis: ConsumptionItem[] = analysisData?.data?.data?.list || []
  const summary = summaryData?.data || { total: 0, normal: 0, warning: 0, critical: 0, criticalItems: [] }

  // Filter by status
  const filteredAnalysis = selectedStatus === 'all'
    ? analysis
    : analysis.filter(item => item.varianceStatus === selectedStatus)

  const getStatusIcon = (status: VarianceStatus) => {
    switch (status) {
      case 'critical':
        return <AlertCircle className="text-red-500" size={20} />
      case 'warning':
        return <AlertTriangle className="text-orange-500" size={20} />
      case 'normal':
        return <CheckCircle className="text-green-500" size={20} />
    }
  }

  const getStatusColor = (status: VarianceStatus) => {
    switch (status) {
      case 'critical':
        return 'bg-red-50 border-red-200'
      case 'warning':
        return 'bg-orange-50 border-orange-200'
      case 'normal':
        return 'bg-green-50 border-green-200'
    }
  }

  const getVarianceColor = (variance: number) => {
    if (variance > 0) return 'text-red-600' // 实际消耗多于理论
    if (variance < 0) return 'text-blue-600' // 实际消耗少于理论
    return 'text-gray-600'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
      </div>

      {/* Date Range & Controls */}
      <div className="card">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex gap-2">
            <button
              onClick={() => setQuickDateRange(7)}
              className="btn btn-sm btn-outline"
            >
              7 {t('common.days') || 'days'}
            </button>
            <button
              onClick={() => setQuickDateRange(14)}
              className="btn btn-sm btn-outline"
            >
              14 {t('common.days') || 'days'}
            </button>
            <button
              onClick={() => setQuickDateRange(30)}
              className="btn btn-sm btn-outline"
            >
              30 {t('common.days') || 'days'}
            </button>
          </div>

          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
              className="input input-sm w-36"
            />
            <span className="text-gray-500">-</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
              className="input input-sm w-36"
            />
          </div>

          <div className="flex gap-2 items-center ml-auto">
            <label className="text-sm text-gray-600">
              {t('inventory.varianceThreshold') || 'Variance Threshold'}:
            </label>
            <select
              value={varianceThreshold}
              onChange={(e) => setVarianceThreshold(parseInt(e.target.value))}
              className="input input-sm w-24"
            >
              <option value={5}>±5%</option>
              <option value={10}>±10%</option>
              <option value={15}>±15%</option>
              <option value={20}>±20%</option>
             <option value={30}>±30%</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card text-center border-2 border-green-200">
          <CheckCircle className="mx-auto mb-2 text-green-500" size={32} />
          <div className="text-3xl font-bold text-green-600">{summary.normal}</div>
          <div className="text-sm text-gray-500">{t('inventory.normal') || 'Normal'}</div>
        </div>

        <div className="card text-center border-2 border-orange-200">
          <AlertTriangle className="mx-auto mb-2 text-orange-500" size={32} />
          <div className="text-3xl font-bold text-orange-600">{summary.warning}</div>
          <div className="text-sm text-gray-500">{t('inventory.warning') || 'Warning'}</div>
        </div>

        <div className="card text-center border-2 border-red-200">
          <AlertCircle className="mx-auto mb-2 text-red-500" size={32} />
          <div className="text-3xl font-bold text-red-600">{summary.critical}</div>
          <div className="text-sm text-gray-500">{t('inventory.critical') || 'Abnormal'}</div>
        </div>

        <div className="card text-center">
          <div className="text-3xl font-bold text-gray-600">{summary.total}</div>
          <div className="text-sm text-gray-500">{t('inventory.total') || 'Total'}</div>
        </div>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2">
        <button
          onClick={() => setSelectedStatus('all')}
          className={`btn btn-sm ${selectedStatus === 'all' ? 'btn-primary' : 'btn-outline'}`}
        >
          {t('common.all') || 'All'}
        </button>
        <button
          onClick={() => setSelectedStatus('critical')}
          className={`btn btn-sm ${selectedStatus === 'critical' ? 'btn-primary' : 'btn-outline'}`}
        >
          {t('inventory.critical') || 'Abnormal'}
        </button>
        <button
          onClick={() => setSelectedStatus('warning')}
          className={`btn btn-sm ${selectedStatus === 'warning' ? 'btn-primary' : 'btn-outline'}`}
        >
          {t('inventory.warning') || 'Warning'}
        </button>
        <button
          onClick={() => setSelectedStatus('normal')}
          className={`btn btn-sm ${selectedStatus === 'normal' ? 'btn-primary' : 'btn-outline'}`}
        >
          {t('inventory.normal') || 'Normal'}
        </button>
      </div>

      {/* Analysis Table */}
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : !dateRange.startDate || !dateRange.endDate ? (
        <div className="card text-center py-12 text-gray-500">
          {t('inventory.selectDateRange') || 'Select date range'}
        </div>
      ) : filteredAnalysis.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">
          <CheckCircle size={48} className="mx-auto mb-4 text-green-300" />
          <p>{t('inventory.noAnomalies') || 'No anomalies found'}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3 px-4">{t('inventory.material') || 'Raw Material'}</th>
                <th className="pb-3 px-4 text-right">{t('inventory.theoreticalConsumption') || 'Theoretical'}</th>
                <th className="pb-3 px-4 text-right">{t('inventory.actualConsumption') || 'Actual'}</th>
                <th className="pb-3 px-4 text-right">{t('inventory.variance') || 'Variance'}</th>
                <th className="pb-3 px-4 text-right">{t('inventory.variancePercent') || 'Variance %'}</th>
                <th className="pb-3 px-4 text-center">{t('inventory.status') || 'Status'}</th>
                <th className="pb-3 px-4 text-right">{t('inventory.orderCount') || 'Orders'}</th>
              </tr>
            </thead>
            <tbody>
              {filteredAnalysis.map((item) => (
                <tr key={item.inventoryId} className={`border-b border-border last:border-0 ${item.varianceStatus !== 'normal' ? getStatusColor(item.varianceStatus as VarianceStatus) : ''}`}>
                  <td className="py-3 px-4 font-medium">{item.inventoryName}</td>
                  <td className="py-3 px-4 text-right text-gray-600">
                    {item.theoreticalConsumption.toFixed(2)} {item.unit}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600">
                    {item.actualConsumption.toFixed(2)} {item.unit}
                  </td>
                  <td className={`py-3 px-4 text-right font-medium ${getVarianceColor(item.variance)}`}>
                    {item.variance >= 0 ? '+' : ''}{item.variance.toFixed(2)} {item.unit}
                  </td>
                  <td className={`py-3 px-4 text-right font-bold ${item.variancePercent > 20 ? 'text-red-600' : item.variancePercent > 10 ? 'text-orange-600' : 'text-gray-600'}`}>
                    {item.variance >= 0 ? '+' : ''}{item.variancePercent.toFixed(1)}%
                    {item.variance > 0 ? <TrendingUp size={14} className="inline ml-1" /> : item.variance < 0 ? <TrendingDown size={14} className="inline ml-1" /> : <Minus size={14} className="inline ml-1" />}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      item.varianceStatus === 'critical' ? 'bg-red-100 text-red-700' :
                      item.varianceStatus === 'warning' ? 'bg-orange-100 text-orange-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {getStatusIcon(item.varianceStatus as VarianceStatus)}
                      {t(`inventory.${item.varianceStatus}`) || item.varianceStatus}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600">
                    {item.orderCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Critical Items Detail */}
      {summary.criticalItems && summary.criticalItems.length > 0 && (
        <div className="card border-red-200">
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-red-600">
            <AlertCircle size={20} />
            {t('inventory.criticalItemsDetail') || 'Abnormal items detail'}
          </h3>
          <div className="space-y-3">
            {summary.criticalItems.map((item: ConsumptionItem) => (
              <div key={item.inventoryId} className="bg-red-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-red-700">{item.inventoryName}</div>
                    <div className="text-sm text-red-600">
                      {t('inventory.theoreticalVsActual') || 'Theoretical'}：{item.theoreticalConsumption.toFixed(2)} {item.unit} vs {t('inventory.actualConsumption') || 'Actual'}：{item.actualConsumption.toFixed(2)} {item.unit}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-red-600">
                      {item.variance >= 0 ? '+' : ''}{item.variancePercent.toFixed(1)}%
                    </div>
                    <div className="text-sm text-gray-500">
                      {item.variance >= 0 ? t('inventory.overConsumption') || 'Over-consumed' : t('inventory.underConsumption') || 'Under-consumed'}
                      {Math.abs(item.variance).toFixed(2)} {item.unit}
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  {t('inventory.relatedOrders') || 'Related orders'}：{item.orderCount} |
                  {item.lastOrderDate && `${t('inventory.lastOrder') || 'Last order'}：${new Date(item.lastOrderDate).toLocaleDateString()}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}