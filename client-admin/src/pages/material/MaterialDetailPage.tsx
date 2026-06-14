import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { materialApi } from '../../services/api'
import { formatCurrency } from '../../utils/helpers'
import { Loader2, Package, AlertTriangle, Edit2 } from 'lucide-react'

const TYPE_LABELS: Record<string, string> = {
  raw_material: '原料(毛料)',
  semi_finished: '加工原料(半成品)',
  finished_goods: '成品'
}

export function MaterialDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const { data, isLoading } = useQuery({
    queryKey: ['material', id],
    queryFn: () => materialApi.get(id!),
    enabled: !!id
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  const mat = data?.data?.data
  if (!mat) {
    return <div className="text-center py-12 text-gray-500">{t('material.notFound')}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/inventory/material')} className="text-gray-600 hover:text-gray-900">
          ← {t('common.back')}
        </button>
        <button onClick={() => navigate(`/inventory/material/${id}/edit`)} className="btn-primary flex items-center gap-2">
          <Edit2 size={18} />
          {t('common.edit')}
        </button>
      </div>

      {/* Basic Info */}
      <div className="card">
        <div className="flex items-start gap-4">
          <div className="p-4 bg-gray-100 rounded-lg">
            <Package size={48} className="text-gray-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{mat.name}</h1>
            <div className="flex gap-4 mt-2 text-sm text-gray-500">
              <span>{mat.category}</span>
              <span>•</span>
              <span>{TYPE_LABELS[mat.type] || mat.type}</span>
              <span>•</span>
              <span>{mat.unit}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-500">{t('material.currentStock') || 'Current Stock'}</div>
            <div className={`text-2xl font-bold ${mat.currentStock <= mat.safetyStock ? 'text-red-500' : ''}`}>
              {mat.currentStock.toFixed(2)} {mat.unit}
            </div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-500">{t('material.avgCost') || 'Avg Cost'}</div>
            <div className="text-2xl font-bold">
              {formatCurrency(mat.avgCost)}/{mat.unit}
            </div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-500">{t('material.safetyStock') || 'Safety Stock'}</div>
            <div className="text-2xl font-bold">
              {mat.safetyStock} {mat.unit}
            </div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-500">保质期</div>
            <div className="text-2xl font-bold">
              {mat.shelfLife > 0 ? `${mat.shelfLife}天` : '不限'}
            </div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {(mat.currentStock <= mat.safetyStock || mat.shelfLife > 0) && (
        <div className="card border-orange-200 bg-orange-50">
          <h3 className="font-semibold text-orange-700 mb-3 flex items-center gap-2">
            <AlertTriangle size={20} />
            提醒
          </h3>
          <div className="space-y-2">
            {mat.currentStock <= mat.safetyStock && (
              <div className="flex items-center gap-2 text-orange-700">
                <AlertTriangle size={16} />
                库存低于安全库存 ({mat.safetyStock} {mat.unit})
              </div>
            )}
          </div>
        </div>
      )}

      {/* Batch List */}
      {mat.batches && mat.batches.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-4">批次列表 (先进先出)</h3>
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-2">批次号</th>
                <th className="pb-2">数量</th>
                <th className="pb-2">入库日期</th>
                <th className="pb-2">到期日期</th>
                <th className="pb-2">状态</th>
              </tr>
            </thead>
            <tbody>
              {mat.batches.map((batch: any) => (
                <tr key={batch.id} className="border-b border-border">
                  <td className="py-2 font-mono text-sm">{batch.batchNumber}</td>
                  <td className="py-2">{batch.quantity} {mat.unit}</td>
                  <td className="py-2 text-sm text-gray-500">
                    {batch.manufacturingDate
                      ? new Date(batch.manufacturingDate).toLocaleDateString()
                      : '-'}
                  </td>
                  <td className="py-2 text-sm text-gray-500">
                    {batch.expiryDate
                      ? new Date(batch.expiryDate).toLocaleDateString()
                      : '-'}
                  </td>
                  <td className="py-2">
                    <span className={`px-2 py-1 rounded text-xs ${
                      batch.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : batch.status === 'expired'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {batch.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Settings */}
      <div className="card">
        <h3 className="font-semibold mb-4">其他设置</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex justify-between p-2 bg-gray-50 rounded">
            <span className="text-gray-500">浓缩比例</span>
            <span>{mat.concentrateRatio}x</span>
          </div>
          <div className="flex justify-between p-2 bg-gray-50 rounded">
            <span className="text-gray-500">最低库存</span>
            <span>{mat.minStock} {mat.unit}</span>
          </div>
          <div className="flex justify-between p-2 bg-gray-50 rounded">
            <span className="text-gray-500">最高库存</span>
            <span>{mat.maxStock} {mat.unit}</span>
          </div>
          <div className="flex justify-between p-2 bg-gray-50 rounded">
            <span className="text-gray-500">保质期</span>
            <span>{mat.shelfLife > 0 ? `${mat.shelfLife}天` : '不限'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}