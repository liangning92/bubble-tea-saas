import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { financeApi } from '../../services/api'
import { formatCurrency } from '../../utils/helpers'
import { format, isValid, parse } from 'date-fns'
import { Loader2, Download, Eye, X, FileSpreadsheet, FileText, Package } from 'lucide-react'

// Report sub-tabs: analysis + export
type ReportTab = 'profit' | 'income' | 'cashflow' | 'export'

export function FinanceReportsPage() {
  const { t, i18n } = useTranslation()
  const [reportTab, setReportTab] = useState<ReportTab>('profit')
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 29)
    return { startDate: format(start, 'yyyy-MM-dd'), endDate: format(end, 'yyyy-MM-dd') }
  })
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'))
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear())
  const [includeDepreciation, setIncludeDepreciation] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<any>(null)
  const [showPreview, setShowPreview] = useState(false)

  // Profit Analysis Query
  const { data: profitData, isLoading: profitLoading } = useQuery({
    queryKey: ['finance', 'profit', dateRange],
    queryFn: () => financeApi.profit({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate
    }),
    enabled: !!dateRange.startDate && !!dateRange.endDate
  })

  // Income Statement Query
  const { data: incomeData, isLoading: incomeLoading } = useQuery({
    queryKey: ['finance', 'incomeStatement', selectedMonth, includeDepreciation],
    queryFn: () => financeApi.incomeStatement({
      month: selectedMonth,
      includeDepreciation
    }),
  })

  // Cash Flow Query
  const { data: cashFlowData, isLoading: cashFlowLoading } = useQuery({
    queryKey: ['finance', 'cashFlow', dateRange],
    queryFn: () => financeApi.cashFlow({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate
    }),
    enabled: !!dateRange.startDate && !!dateRange.endDate
  })

  const profit = profitData?.data?.data
  const income = incomeData?.data?.data
  const cashFlow = cashFlowData?.data?.data

  const reportTabs = [
    { id: 'profit' as ReportTab, label: t('finance.profitAnalysis') },
    { id: 'income' as ReportTab, label: t('finance.incomeStatement') },
    { id: 'cashflow' as ReportTab, label: t('finance.cashFlow') },
    { id: 'export' as ReportTab, label: t('common.export') },
  ]

  const handleDateRangeChange = (start: string, end: string) => {
    const startDate = parse(start, 'yyyy-MM-dd', new Date())
    const endDate = parse(end, 'yyyy-MM-dd', new Date())
    if (!isValid(startDate) || !isValid(endDate)) {
      return
    }
    setDateRange({ startDate: start, endDate: end })
  }

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  const months = Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1).padStart(2, '0'),
    label: new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(new Date(2020, index, 1))
  }))

  const formatDate = (date: Date) => format(date, 'yyyy-MM-dd')

  const setQuickDateRange = (days: number) => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - Math.max(0, days - 1))
    handleDateRangeChange(formatDate(start), formatDate(end))
  }

  // Preview handlers
  const handlePreview = async (type: string) => {
    const monthPart = selectedMonth.includes('-') ? selectedMonth.split('-')[1] : selectedMonth.padStart(2, '0')
    const monthNum = parseInt(monthPart) || (new Date().getMonth() + 1)
    const yearNum = selectedYear || new Date().getFullYear()
    const monthStr = `${yearNum}-${String(monthNum).padStart(2, '0')}`

    try {
      let data = null
      if (type === 'income_statement') {
        const res = await financeApi.incomeStatement({ month: monthStr, includeDepreciation })
        data = res.data?.data
      } else if (type === 'balance_sheet') {
        const res = await financeApi.balanceSheet({ month: monthStr })
        data = res.data?.data
      } else if (type === 'cash_flow') {
        const lastDay = new Date(yearNum, monthNum, 0).getDate()
        const startDate = `${monthStr}-01`
        const endDate = `${monthStr}-${String(lastDay).padStart(2, '0')}`
        const res = await financeApi.cashFlow({ startDate, endDate })
        data = res.data?.data
      }
      setPreviewData({ type, data })
      setShowPreview(true)
    } catch (error) {
      console.error('Preview failed:', error)
    }
  }

  // Download handlers
  const handleDownload = async (type: string, format: string) => {
    setDownloading(`${type}-${format}`)
    try {
      const monthPart = selectedMonth.includes('-') ? selectedMonth.split('-')[1] : selectedMonth.padStart(2, '0')
      const monthNum = parseInt(monthPart) || (new Date().getMonth() + 1)
      const yearNum = selectedYear || new Date().getFullYear()
      const monthStr = `${yearNum}-${String(monthNum).padStart(2, '0')}`
      const response = await financeApi.downloadReport({
        type,
        month: monthStr,
        format,
        includeDepreciation
      })
      const blob = new Blob([response.data], {
        type: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${type}_${monthStr}.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Download failed:', error)
      alert(t('common.error'))
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('finance.financialReports')}</h1>
      </div>

      {/* Report Sub-tabs */}
      <div className="bg-white rounded-lg p-1 shadow-sm inline-flex">
        {reportTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setReportTab(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              reportTab === tab.id
                ? 'bg-primary text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profit Analysis */}
      {reportTab === 'profit' && (
        <div className="space-y-6">
          <div className="card">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm font-medium text-gray-700">{t('finance.selectDateRange')}:</span>
              <button onClick={() => setQuickDateRange(7)} className="btn btn-sm btn-outline">7 {t('finance.days')}</button>
              <button onClick={() => setQuickDateRange(30)} className="btn btn-sm btn-outline">30 {t('finance.days')}</button>
              <button onClick={() => setQuickDateRange(90)} className="btn btn-sm btn-outline">90 {t('finance.days')}</button>
              <div className="flex gap-2 ml-4">
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
            </div>
          </div>

          {profitLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : profit ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card text-center">
                  <p className="text-sm text-gray-500">{t('finance.revenue')}</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(profit.revenue || 0)}</p>
                </div>
                <div className="card text-center">
                  <p className="text-sm text-gray-500">{t('finance.cogs')}</p>
                  <p className="text-2xl font-bold text-red-600">{formatCurrency(profit.cogs || 0)}</p>
                </div>
                <div className="card text-center">
                  <p className="text-sm text-gray-500">{t('finance.grossProfit')}</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(profit.grossProfit || 0)}</p>
                </div>
                <div className="card text-center">
                  <p className="text-sm text-gray-500">{t('finance.grossMargin')}</p>
                  <p className="text-2xl font-bold text-green-600">{profit.grossMargin || 0}%</p>
                </div>
              </div>

              <div className="card">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('finance.operatingCosts')}</h3>
                <div className="space-y-3">
                  {profit.isEstimate ? <>
                    {(['staff', 'rent', 'utilities', 'marketing', 'other'] as const).map((key) => (
                      <div key={key} className="flex justify-between items-center py-2 border-b">
                        <span className="text-gray-600">{t(`finance.${key}`)}</span>
                        <span className="font-medium">{formatCurrency(profit.operatingCosts?.[key] || 0)}</span>
                      </div>
                    ))}
                  </> : <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-gray-600">{t('finance.operatingCosts')}</span>
                    <span className="font-medium">{formatCurrency(profit.operatingCosts?.actual || 0)}</span>
                  </div>}
                  <div className="flex justify-between items-center py-2 font-semibold">
                    <span>{t('finance.totalOperatingCosts')}</span>
                    <span>{formatCurrency(profit.totalOperatingCosts || 0)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="card text-center">
                  <p className="text-sm text-gray-500">{t('finance.netProfit')}</p>
                  <p className="text-3xl font-bold text-green-600">{formatCurrency(profit.netProfit || 0)}</p>
                </div>
                <div className="card text-center">
                  <p className="text-sm text-gray-500">{t('finance.netMargin')}</p>
                  <p className="text-3xl font-bold text-green-600">{profit.netMargin || 0}%</p>
                </div>
              </div>
            </>
          ) : (
            <div className="card text-center py-12 text-gray-500">
              {t('finance.selectDateRangePrompt')}
            </div>
          )}
        </div>
      )}

      {/* Income Statement */}
      {reportTab === 'income' && (
        <div className="space-y-6">
          <div className="card">
            <div className="flex flex-wrap gap-4 items-center justify-between">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">{t('finance.selectMonth')}:</label>
                  <select
                    value={selectedMonth ? selectedMonth.split('-')[1] : '01'}
                    onChange={(e) => setSelectedMonth(`${selectedYear}-${e.target.value}`)}
                    className="input w-32"
                  >
                    {months.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">{t('finance.selectYear')}:</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="input w-28"
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeDepreciation}
                  onChange={(e) => setIncludeDepreciation(e.target.checked)}
                  className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                />
                <span className="text-sm font-medium text-gray-700">{t('finance.includeDepreciation')}</span>
              </label>
            </div>
          </div>

          {incomeLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : income ? (
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">
                {t('finance.incomeStatement')} - {selectedMonth}
              </h3>

              <div className="space-y-2 mb-6">
                <h4 className="font-medium text-gray-700 border-b pb-2">{t('finance.revenue')}</h4>
                <div className="flex justify-between items-center py-1 pl-4">
                  <span className="text-gray-600">{t('finance.totalSales')}</span>
                  <span className="font-medium">{formatCurrency(income.revenue?.totalSales || 0)}</span>
                </div>
                <div className="flex justify-between items-center py-1 pl-4">
                  <span className="text-gray-600">{t('finance.ppnCollected')}</span>
                  <span className="font-medium text-red-600">-{formatCurrency(income.revenue?.ppnCollected || 0)}</span>
                </div>
                <div className="flex justify-between items-center py-1 pl-4 font-semibold border-t">
                  <span>{t('finance.netSales')}</span>
                  <span>{formatCurrency(income.revenue?.netSales || 0)}</span>
                </div>
              </div>

              <div className="space-y-2 mb-6">
                <h4 className="font-medium text-gray-700 border-b pb-2">{t('finance.costOfGoods')}</h4>
                <div className="flex justify-between items-center py-1 pl-4">
                  <span className="text-gray-600">{t('finance.totalCOGS')}</span>
                  <span className="font-medium text-red-600">-{formatCurrency(income.costOfGoods?.total || 0)}</span>
                </div>
              </div>

              <div className="flex justify-between items-center py-3 px-4 bg-green-50 rounded-lg mb-6">
                <div>
                  <span className="font-semibold text-green-700">{t('finance.grossProfit')}</span>
                  <span className="text-sm text-green-600 ml-2">({income.grossProfit?.margin || 0}%)</span>
                </div>
                <span className="font-bold text-green-700 text-xl">{formatCurrency(income.grossProfit?.amount || 0)}</span>
              </div>

              <div className="flex justify-between items-center py-3 px-4 bg-primary/10 rounded-lg">
                <div>
                  <span className="font-semibold text-primary">{t('finance.netProfit')}</span>
                  <span className="text-sm text-primary/70 ml-2">({income.netProfit?.margin || 0