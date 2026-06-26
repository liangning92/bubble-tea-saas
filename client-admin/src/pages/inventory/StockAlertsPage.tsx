import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { bomApi } from '../../services/api'
import { Loader2, AlertTriangle, Package } from 'lucide-react'

export function StockAlertsPage() {
  const { t } = useTranslation()
  const [forecastDays, setForecastDays] = useState(30)

  // 低库存预警
  const { data: alertsData, isLoading } = useQuery({
    queryKey: ['bom-alerts', forecastDays],
    queryFn: () => bomApi.getLowStockAlerts(forecastDays),
    refetchInterval: 30000 // Auto-refresh every 30 seconds
  })

  // API returns { code, data: [...] }, axios wraps as { data: { code, data: [...] } }
  const alertsList = alertsData?.data?.data || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
        <select
          value={forecastDays}
          onChange={(e) => setForecastDays(parseInt(e.target.value))}
          className="input w-32"
        >
          <option value={7}>{t('bom.days7')}</option>
          <option value={30}>{t('bom.days30')}</option>
          <option value={90}>{t('bom.days90')}</option>
        </select>
      </div>

      {/* Alert Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card bg-red-50 border-red-200">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-red-100 text-red-600">
              <AlertTriangle size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('inventory.critical')}</p>
              <p className="text-2xl font-bold text-red-600">
                {alertsList.filter((a: any) => a.urgency === 'critical').length}
              </p>
            </div>
          </div>
        </div>
        <div className="card bg-orange-50 border-orange-200">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-orange-100 text-orange-600">
              <AlertTriangle size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('inventory.warning')}</p>
              <p className="text-2xl font-bold text-orange-600">
                {alertsList.filter((a: any) => a.urgency === 'warning').length}
              </p>
            </div>
          </div>
        </div>
        <div className="card bg-gray-50 border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-gray-100 text-gray-600">
              <Package size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('inventory.total')}</p>
              <p className="text-2xl font-bold text-gray-600">{alertsList.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Alert List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="animate-spin mx-auto" size={32} />
          </div>
        ) : alertsList.length === 0 ? (
          <div className="card text-center text-gray-500 py-12">
            <Package size={48} className="mx-auto mb-4 text-gray-300" />
            <p>{t('bom.noAlerts')}</p>
          </div>
        ) : (
          alertsList.map((alert: any) => (
            <div
              key={alert.inventoryId}
              className={`card flex items-center gap-4 ${
                alert.urgency === 'critical' ? 'border-red-500 bg-red-50' :
                alert.urgency === 'warning' ? 'border-orange-500 bg-orange-50' : ''
              }`}
            >
              <div className={`p-3 rounded-full ${
                alert.urgency === 'critical' ? 'bg-red-100 text-red-600' :
                alert.urgency === 'warning' ? 'bg-orange-100 text-orange-600' : 'bg-gray-100'
              }`}>
                <AlertTriangle size={24} />
              </div>
              <div className="flex-1">
                <div className="font-medium">{alert.name}</div>
                <div className="text-sm text-gray-500">
                  {t('inventory.currentStock')}: {alert.currentStock} {alert.unit} |
                  {t('inventory.daysLeft')}: {alert.daysUntilStockOut} {t('bom.days')}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500">{t('inventory.suggestOrder')}</div>
                <div className="text-lg font-bold text-orange-600">
                  {alert.suggestedReorderQty} {alert.unit}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}