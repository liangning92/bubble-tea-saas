import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { financeApi } from '../../services/api'
import { formatCurrency } from '../../utils/helpers'
import { Download, FileSpreadsheet, Loader2, Settings, Eye, X } from 'lucide-react'
import { format } from 'date-fns'
import { TaxConfigModal } from './TaxConfigModal'

export function TaxReportsPage() {
  const { t } = useTranslation()
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'MM'))
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear())
  const [downloading, setDownloading] = useState<string | null>(null)
  const [showTaxConfig, setShowTaxConfig] = useState(false)
  const [previewData, setPreviewData] = useState<any>(null)
  const [showPreview, setShowPreview] = useState(false)

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)
  const months = [
    { value: '01', label: 'January' }, { value: '02', label: 'February' },
    { value: '03', label: 'March' }, { value: '04', label: 'April' },
    { value: '05', label: 'May' }, { value: '06', label: 'June' },
    { value: '07', label: 'July' }, { value: '08', label: 'August' },
    { value: '09', label: 'September' }, { value: '10', label: 'October' },
    { value: '11', label: 'November' }, { value: '12', label: 'December' },
  ]

  const monthStr = `${selectedYear}-${selectedMonth.padStart(2, '0')}`

  // Tax report data for preview
  const { data: taxData, isLoading: taxLoading } = useQuery({
    queryKey: ['finance', 'tax', monthStr],
    queryFn: () => financeApi.tax({ month: monthStr }),
  })

  const handlePreview = () => {
    if (taxData?.data) {
      setPreviewData(taxData.data.data)
      setShowPreview(true)
    }
  }

  const handleDownload = async (type: string) => {
    setDownloading(type)
    try {
      const monthStr = `${selectedYear}-${selectedMonth.padStart(2, '0')}`
      const response = await financeApi.downloadTaxReport({ type, month: monthStr })
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `spt_${type}_${monthStr}.xlsx`
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('finance.tax')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('finance.taxManagementDesc')}</p>
        </div>
        <button
          onClick={() => setShowTaxConfig(true)}
          className="btn btn-outline btn-sm flex items-center gap-2"
        >
          <Settings size={16} />
          {t('finance.taxConfig')}
        </button>
      </div>

      {/* Month/Year Selector */}
      <div className="card">
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
      </div>

      {/* Tax Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* PPN Report */}
        <div className="card border-2 border-blue-100">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <FileSpreadsheet className="text-blue-600" size={32} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">{t('finance.sptPPN')}</h3>
              <p className="text-sm text-gray-500 mt-1">{t('finance.sptPpnDesc')}</p>
              <p className="text-xs text-gray-400 mt-2">{t('finance.sptPPNHint')}</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handlePreview}
              disabled={taxLoading}
              className="flex-1 btn btn-outline flex items-center justify-center gap-2"
            >
              {taxLoading ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
              {t('common.preview')}
            </button>
            <button
              onClick={() => handleDownload('ppn')}
              disabled={downloading === 'ppn'}
              className="flex-1 btn btn-primary flex items-center justify-center gap-2"
            >
              {downloading === 'ppn' ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
              {t('common.download')}
            </button>
          </div>
        </div>

        {/* PPh Report */}
        <div className="card border-2 border-orange-100">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-orange-50 rounded-lg">
              <FileSpreadsheet className="text-orange-600" size={32} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">{t('finance.sptPPh')}</h3>
              <p className="text-sm text-gray-500 mt-1">{t('finance.sptPphDesc')}</p>
              <p className="text-xs text-gray-400 mt-2">{t('finance.sptPPhHint')}</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handlePreview}
              disabled={taxLoading}
              className="flex-1 btn btn-outline flex items-center justify-center gap-2"
            >
              {taxLoading ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
              {t('common.preview')}
            </button>
            <button
              onClick={() => handleDownload('pph')}
              disabled={downloading === 'pph'}
              className="flex-1 btn btn-primary flex items-center justify-center gap-2"
            >
              {downloading === 'pph' ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
              {t('common.download')}
            </button>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="card bg-blue-50 border-blue-100">
        <h4 className="font-medium text-blue-900">{t('finance.taxInfoTitle')}</h4>
        <p className="text-sm text-blue-700 mt-2">{t('finance.taxInfoDesc')}</p>
      </div>

      {/* Tax Config Modal */}
      <TaxConfigModal
        isOpen={showTaxConfig}
        onClose={() => setShowTaxConfig(false)}
      />

      {/* Preview Modal */}
      {showPreview && previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold">{t('common.preview')} - SPT</h2>
              <button onClick={() => setShowPreview(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">{t('finance.totalRevenue')}</p>
                  <p className="text-xl font-bold">{formatCurrency(previewData.totalRevenue || 0)}</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-500">{t('finance.taxableRevenue')}</p>
                  <p className="text-xl font-bold text-blue-600">{formatCurrency(previewData.taxableRevenue || 0)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-orange-50 rounded-lg">
                  <p className="text-sm text-gray-500">{t('finance.ppnCollected')}</p>
                  <p className="text-xl font-bold text-orange-600">{formatCurrency(previewData.ppnCollected || 0)}</p>
                  <p className="text-xs text-gray-400">{previewData.ppnRate || 11}%</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">{t('finance.orderCount')}</p>
                  <p className="text-xl font-bold">{previewData.orderCount || 0}</p>
                </div>
              </div>
              {previewData.taxableRatio !== undefined && previewData.taxableRatio < 100 && (
                <div className="p-4 bg-yellow-50 rounded-lg">
                  <p className="text-sm text-gray-500">{t('finance.taxableRatio')}</p>
                  <p className="text-lg font-bold text-yellow-700">{previewData.taxableRatio}%</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {t('finance.rawTaxableBase')}: {formatCurrency(previewData.rawTaxableBase || 0)}
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowPreview(false)} className="btn btn-outline">
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}