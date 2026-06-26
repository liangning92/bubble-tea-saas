import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { inventoryApi } from '../../services/api'
import { formatCurrency, formatDateTime } from '../../utils/helpers'

export function StockLogPage() {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<{ type?: string; startDate?: string; endDate?: string }>({})

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-logs', filter],
    queryFn: () => inventoryApi.logs(filter),
    refetchInterval: 30000 // Auto-refresh every 30 seconds
  })

  const logs = data?.data?.list || []

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'stock_in': return 'badge-success'
      case 'stock_out': return 'badge-error'
      case 'adjustment': return 'badge-warning'
      default: return 'badge-info'
    }
  }

  return (
    <div>
      <div className="flex gap-4 mb-6">
        <select value={filter.type || ''} onChange={(e) => setFilter({ ...filter, type: e.target.value || undefined })} className="input w-40">
          <option value="">{t('common.all')}</option>
          <option value="stock_in">{t('inventory.stockIn')}</option>
          <option value="stock_out">{t('inventory.stockOut')}</option>
          <option value="adjustment">{t('inventory.adjustment')}</option>
        </select>
        <input type="date" value={filter.startDate || ''} onChange={(e) => setFilter({ ...filter, startDate: e.target.value })} className="input w-40" />
        <input type="date" value={filter.endDate || ''} onChange={(e) => setFilter({ ...filter, endDate: e.target.value })} className="input w-40" />
      </div>

      <div className="card">
        {isLoading ? (
          <div className="text-center py-8">{t('common.loading')}</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">{t('common.noData')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">{t('inventory.date')}</th>
                  <th className="pb-3 font-medium">{t('inventory.itemName')}</th>
                  <th className="pb-3 font-medium">{t('inventory.type')}</th>
                  <th className="pb-3 font-medium">{t('inventory.quantity')}</th>
                  <th className="pb-3 font-medium">{t('inventory.cost')}</th>
                  <th className="pb-3 font-medium">{t('inventory.notes')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-3 text-sm">{formatDateTime(log.createdAt)}</td>
                    <td className="py-3 font-medium">{log.inventory?.name}</td>
                    <td className="py-3"><span className={`badge ${getTypeBadge(log.type)}`}>{t(`inventory.${log.type}`) || log.type}</span></td>
                    <td className="py-3">{log.quantity} {log.inventory?.unit}</td>
                    <td className="py-3">{log.unitCost ? formatCurrency(log.unitCost * log.quantity) : '-'}</td>
                    <td className="py-3 text-sm text-gray-500">{log.notes || '-'}</td>
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