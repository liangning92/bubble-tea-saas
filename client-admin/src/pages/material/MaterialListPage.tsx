import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { materialApi } from '../../services/api'
import { formatCurrency } from '../../utils/helpers'
import { Plus, Edit2, AlertTriangle, Package, Loader2 } from 'lucide-react'

const TYPE_KEYS: Record<string, string> = {
  raw_material: 'material.typeRawMaterial',
  semi_finished: 'material.typeSemiFinished',
  finished_goods: 'material.typeFinishedGoods'
}

const TYPE_COLORS: Record<string, string> = {
  raw_material: 'bg-amber-100 text-amber-700',
  semi_finished: 'bg-blue-100 text-blue-700',
  finished_goods: 'bg-green-100 text-green-700'
}

export function MaterialListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [showAlerts, setShowAlerts] = useState(false)

  const { data: materialsData, isLoading } = useQuery({
    queryKey: ['materials', typeFilter],
    queryFn: () => materialApi.list({ type: typeFilter || undefined })
  })

  const { data: alertsData } = useQuery({
    queryKey: ['material-alerts'],
    queryFn: () => materialApi.lowStockAlerts(),
    enabled: showAlerts
  })

  const materials = materialsData?.data?.data?.list || []
  const alerts = alertsData?.data || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('material.title') || 'Material Management'}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAlerts(!showAlerts)}
            className={`btn-secondary flex items-center gap-2 ${showAlerts ? 'bg-orange-50 border-orange-200' : ''}`}
          >
            <AlertTriangle size={18} className={showAlerts ? 'text-orange-500' : ''} />
            {t('material.alerts') || 'Stock Alert'}
            {alerts.length > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                {alerts.length}
              </span>
            )}
          </button>
          <Link to="/inventory/material/new" className="btn-primary flex items-center gap-2">
            <Plus size={20} />
            {t('material.addMaterial') || 'Add Material'}
          </Link>
        </div>
      </div>

      {/* Type Filter */}
      <div className="flex gap-2">
        <button
          onClick={() => setTypeFilter('')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            !typeFilter ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {t('material.all') || 'All'}
        </button>
        {Object.entries(TYPE_KEYS).map(([value, labelKey]) => (
          <button
            key={value}
            onClick={() => setTypeFilter(value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              typeFilter === value ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* Alerts Panel */}
      {showAlerts && alerts.length > 0 && (
        <div className="card border-orange-200 bg-orange-50">
          <h3 className="font-semibold text-orange-700 mb-3 flex items-center gap-2">
            <AlertTriangle size={20} />
            {t('material.lowStockAlerts') || 'Stock Alert'}
          </h3>
          <div className="space-y-2">
            {alerts.map((alert: any) => (
              <div key={alert.id} className="flex items-center justify-between bg-white p-3 rounded-lg">
                <div>
                  <div className="font-medium">{alert.name}</div>
                  <div className="text-sm text-gray-500">
                    {t('material.currentStock') || 'Current Stock'}: {alert.currentStock} {alert.unit}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">{t('material.safetyStock') || 'Safety Stock'}</div>
                  <div className="font-medium text-orange-600">{alert.safetyStock} {alert.unit}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Materials Table */}
      <div className="card">
        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="animate-spin mx-auto" size={32} />
          </div>
        ) : materials.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Package size={48} className="mx-auto mb-4 text-gray-300" />
            <p>{t('material.noMaterials') || 'No materials'}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3">{t('material.name') || 'Name'}</th>
                <th className="pb-3">{t('material.category') || 'Category'}</th>
                <th className="pb-3">{t('material.type') || 'Type'}</th>
                <th className="pb-3 text-right">{t('material.stock') || 'Inventory'}</th>
                <th className="pb-3 text-right">{t('material.avgCost') || 'Avg Cost'}</th>
                <th className="pb-3 text-right">{t('material.actions') || 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((mat: any) => (
                <tr key={mat.id} className="border-b border-border last:border-0 hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/inventory/material/${mat.id}`)}>
                  <td className="py-3 font-medium">{mat.name}</td>
                  <td className="py-3 text-gray-600">{mat.category}</td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${TYPE_COLORS[mat.type] || 'bg-gray-100 text-gray-700'}`}>
                      {t(TYPE_KEYS[mat.type] || 'material.type')}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <span className={mat.currentStock <= mat.safetyStock ? 'text-red-500 font-medium' : ''}>
                      {mat.currentStock.toFixed(2)} {mat.unit}
                    </span>
                  </td>
                  <td className="py-3 text-right text-gray-600">
                    {formatCurrency(mat.avgCost)}/{mat.unit}
                  </td>
                  <td className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <Link
                      to={`/material/${mat.id}/edit`}
                      className="p-2 text-gray-500 hover:text-primary rounded inline-flex"
                    >
                      <Edit2 size={18} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}