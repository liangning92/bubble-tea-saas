import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { financeApi } from '../../services/api'
import { Download, FileSpreadsheet, FileText, Loader2, Package } from 'lucide-react'
import { format } from 'date-fns'

export function FinancialReportsDownloadPage() {
  const { t } = useTranslation()
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'MM'))
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear())
  const [includeDepreciation, setIncludeDepreciation] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)
  const months = [
    { value: '01', label: 'January' }, { value: '02', label: 'February' },
    { value: '03', label: 'March' }, { value: '04', label: 'April' },
    { value: '05', label: 'May' }, { value: '06', label: 'June' },
    { value: '07', label: 'July' }, { value: '08', label: 'August' },
    { value: '09', label: 'September' }, { value: '10', label: 'October' },
    { value: '11', label: 'November' }, { value: '12', label: 'December' },
  ]

  const handleDownload = async (type: string, format: string) => {
    setDownloading(`${type}-${format}`)
    try {
      const monthStr = `${selectedYear}-${selectedMonth.padStart(2, '0')}`
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

  const reportTypes = [
    {
      id: 'income_statement',
      label: t('finance.incomeStatement'),
      desc: t('finance.incomeStatementDesc'),
      icon: FileSpreadsheet,
      color: 'blue',
      formats: ['xlsx', 'pdf']
    },
    {
      id: 'balance_sheet',
      label: t('finance.balanceSheet'),
      desc: t('finance.balanceSheetDesc'),
      icon: FileText,
      color: 'green',
      formats: ['xlsx']
    },
    {
      id: 'cash_flow',
      label: t('finance.cashFlow'),
      desc: t('finance.cashFlowDesc'),
      icon: Package,
      color: 'purple',
      formats: ['xlsx']
    },
    {
      id: 'monthly',
      label: t('finance.monthlyPackage'),
      desc: t('finance.monthlyPackageDesc'),
      icon: Package,
      color: 'orange',
      formats: ['xlsx']
    }
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Options */}
      <div className="card">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">{t('finance.selectMonth')}:</label>
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="input w-32"
              >
                {months.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">{t('finance.selectYear')}:</label>
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(parseInt(e.target.value))}
                className="input w-28"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDepreciation}
              onChange={e => setIncludeDepreciation(e.target.checked)}
              className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
            />
            <span className="text-sm font-medium text-gray-700">{t('finance.includeDepreciation')}</span>
          </label>
        </div>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reportTypes.map(report => {
          const Icon = report.icon
          const colorMap: Record<string, string> = {
            blue: 'border-blue-100 bg-blue-50',
            green: 'border-green-100 bg-green-50',
            purple: 'border-purple-100 bg-purple-50',
            orange: 'border-orange-100 bg-orange-50'
          }
          const iconMap: Record<string, string> = {
            blue: 'text-blue-600 bg-blue-100',
            green: 'text-green-600 bg-green-100',
            purple: 'text-purple-600 bg-purple-100',
            orange: 'text-orange-600 bg-orange-100'
          }

          return (
            <div key={report.id} className={`card border-2 ${colorMap[report.color]}`}>
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${iconMap[report.color]}`}>
                  <Icon size={32} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{report.label}</h3>
                  <p className="text-sm text-gray-500 mt-1">{report.desc}</p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                {report.formats.map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => handleDownload(report.id, fmt)}
                    disabled={downloading === `${report.id}-${fmt}`}
                    className="flex-1 btn btn-outline flex items-center justify-center gap-2 text-sm"
                  >
                    {downloading === `${report.id}-${fmt}` ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        <Download size={16} />
                        {fmt.toUpperCase()}
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
