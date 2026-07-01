import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { materialApi } from '../../services/api'
import { formatCurrency } from '../../utils/helpers'
import { Loader2, ShoppingCart, AlertTriangle, CheckCircle } from 'lucide-react'

export function RestockSuggestionPage() {
  const { t } = useTranslation()
  const [days, setDays] = useState(7)

  const { data: suggestionsData, isLoading } = useQuery({
    queryKey: ['restock-suggestions', days],
    queryFn: () => materialApi.restockSuggestions(days)
  })

  const { data: expiryData } = useQuery({
    queryKey: ['expiry-alerts', days],
    queryFn: () => materialApi.expiryAlerts(days)
  })

  // API returns { code, data: [...] }, axios wraps as { data: { code, data: [...] } }
  const suggestions = suggestionsData?.data?.data || []
  const expiryAlerts = expiryData?.data?.data || []

  const totalSuggestCost = suggestions.reduce((sum: number, s: any) => sum + (s.suggestCost || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {t('material.restockSuggestion') || 'Smart Restock Suggestion'}
        </h1>
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value))}
          className="input w-40"
        >
          <option value={7}>7 {t('material.days') || 'days'}</option>
          <option value={14}>14 {t('material.days') || 'days'}</option>
          <option value={30}>30 {t('material.days') || 'days'}</option>
        </select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <div className="text-3xl font-bold text-primary">{suggestions.length}</div>
          <div className="text-sm text-gray-500">{t('material.itemsToRestock') || 'Items to Restock'}</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-orange-600">{formatCurrency(totalSuggestCost)}</div>
          <div className="text-sm text-gray-500">{t('material.estimatedCost') || 'Est. Cost'}</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-red-500">{expiryAlerts.length}</div>
          <div className="text-sm text-gray-500">{t('material.expiringSoon') || 'Expiring Soon'}</div>
        </div>
      </div>

      {/* Restock Suggestions */}
      <div className="card">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <ShoppingCart size={20} />
          {t('material.restockList') || 'Restock List'}
        </h3>
        {isLoading ? (
          <div className="text-center py-8"><Loader2 className="animate-spin mx-auto" size={32} /></div>
        ) : suggestions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <CheckCircle size={48} className="mx-auto mb-4 text-green-300" />
            <p>{t('material.stockOk') || 'Stock is sufficient, no restock needed'}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3">{t('material.name') || 'Name'}</th>
                <th className="pb-3">{t('material.category') || 'Category'}</th>
                <th className="pb-3 text-right">{t('material.currentStock') || 'Current Stock'}</th>
                <th className="pb-3 text-right">{t('material.dailyUsage') || 'Daily Usage'}</th>
                <th className="pb-3 text-right">{t('material.suggestQty') || 'Suggested Restock'}</th>
                <th className="pb-3 text-right">{t('material.estimatedCost') || 'Est. Cost'}</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((item: any) => (
                <tr key={item.inventoryId} className="border-b border-border last:border-0">
                  <td className="py-3 font-medium">{item.name}</td>
                  <td className="py-3 text-gray-600">{item.category}</td>
                  <td className="py-3 text-right">
                    <span className={item.currentStock < item.dailyUsage * days ? 'text-red-500' : ''}>
                      {item.currentStock.toFixed(2)} {item.unit}
                    </span>
                  </td>
                  <td className="py-3 text-right text-gray-600">
                    {item.dailyUsage.toFixed(2)} {item.unit}/{t('material.day') || 'days'}
                  </td>
                  <td className="py-3 text-right">
                    <span className="text-orange-500 font-medium">{item.suggestQty} {item.unit}</span>
                  </td>
                  <td className="py-3 text-right">{formatCurrency(item.suggestCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Expiry Alerts */}
      {expiryAlerts.length > 0 && (
        <div className="card border-red-200">
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-red-600">
            <AlertTriangle size={20} />
            {t('material.expiryAlerts') || 'Expiry Alert'}
          </h3>
          <div className="space-y-2">
            {expiryAlerts.map((alert: any) => (
              <div key={alert.id} className="flex items-center justify-between bg-red-50 p-3 rounded-lg">
                <div>
                  <div className="font-medium">{alert.inventoryName}</div>
                  <div className="text-sm text-gray-500">
                    Batch: {alert.batchNumber} | {t('material.quantity') || 'Quantity'}: {alert.quantity} {alert.unit}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">{t('material.expiresIn') || 'Remaining'}</div>
                  <div className={`font-bold ${alert.daysUntilExpiry <= 3 ? 'text-red-600' : 'text-orange-600'}`}>
                    {alert.daysUntilExpiry} {t('material.days') || 'days'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}