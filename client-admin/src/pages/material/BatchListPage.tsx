import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { materialApi } from '../../services/api'
import { Loader2, Package, Clock } from 'lucide-react'

export function BatchListPage() {
  const { t } = useTranslation()
  const [daysFilter, setDaysFilter] = useState(7)

  // 获取7天内过期的批次
  const { data, isLoading } = useQuery({
    queryKey: ['batch-expiry', daysFilter],
    queryFn: () => materialApi.expiryAlerts(daysFilter)
  })

  const batches = data?.data || []

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString()
  }

  const getUrgencyClass = (days: number) => {
    if (days <= 1) return 'bg-red-100 text-red-700 border-red-200'
    if (days <= 3) return 'bg-orange-100 text-orange-700 border-orange-200'
    if (days <= 7) return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    return ''
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('material.batchManagement')}</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{t('material.show')}</span>
          <select
            value={daysFilter}
            onChange={(e) => setDaysFilter(parseInt(e.target.value))}
            className="input w-24"
          >
            <option value={3}>{t('material.withinDays', { n: 3 })}</option>
            <option value={7}>{t('material.withinDays', { n: 7 })}</option>
            <option value={14}>{t('material.withinDays', { n: 14 })}</option>
            <option value={30}>{t('material.withinDays', { n: 30 })}</option>
          </select>
          <span className="text-sm text-gray-500">{t('material.expiry')}</span>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <div className="text-3xl font-bold text-red-500">{batches.filter((b: any) => b.daysUntilExpiry <= 3).length}</div>
          <div className="text-sm text-gray-500">{t('material.urgentExpiry')}</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-orange-500">{batches.filter((b: any) => b.daysUntilExpiry > 3 && b.daysUntilExpiry <= 7).length}</div>
          <div className="text-sm text-gray-500">{t('material.warningExpiry')}</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-green-500">{batches.filter((b: any) => b.daysUntilExpiry > 7).length}</div>
          <div className="text-sm text-gray-500">{t('material.normal')}</div>
        </div>
      </div>

      {/* Batch List */}
      <div className="card">
        <h3 className="font-semibold mb-4">{t('material.batchListTitle')}</h3>
        {isLoading ? (
          <div className="text-center py-8"><Loader2 className="animate-spin mx-auto" size={32} /></div>
        ) : batches.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Package size={48} className="mx-auto mb-4 text-gray-300" />
            <p>{t('material.noExpiringBatches')}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3">{t('material.materialName')}</th>
                <th className="pb-3">{t('material.batchNumber')}</th>
                <th className="pb-3 text-right">{t('material.quantity')}</th>
                <th className="pb-3 text-right">{t('material.expiryDate')}</th>
                <th className="pb-3 text-right">{t('material.remainingDays')}</th>
                <th className="pb-3">{t('material.batchStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch: any) => (
                <tr key={batch.id} className="border-b border-border hover:bg-gray-50">
                  <td className="py-3 font-medium">{batch.inventoryName}</td>
                  <td className="py-3 font-mono text-sm">{batch.batchNumber}</td>
                  <td className="py-3 text-right">{batch.quantity} {batch.unit}</td>
                  <td className="py-3 text-right text-gray-600">
                    {formatDate(batch.expiryDate)}
                  </td>
                  <td className="py-3 text-right font-medium">
                    {t('material.withinDays', { n: batch.daysUntilExpiry })}
                  </td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded text-xs border ${getUrgencyClass(batch.daysUntilExpiry)}`}>
                      {batch.daysUntilExpiry <= 1 ? t('material.urgentExpiry') :
                       batch.daysUntilExpiry <= 3 ? t('material.urgentExpiry') :
                       batch.daysUntilExpiry <= 7 ? t('material.warningExpiry') : t('material.normal')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* FIFO Explanation */}
      <div className="card bg-blue-50 border-blue-200">
        <h3 className="font-semibold text-blue-700 mb-2 flex items-center gap-2">
          <Clock size={18} />
          {t('material.fifoExplanation')}
        </h3>
        <p className="text-sm text-blue-600">
          {t('material.fifoDescription')}
        </p>
      </div>
    </div>
  )
}
