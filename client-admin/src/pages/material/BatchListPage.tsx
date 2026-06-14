import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { materialApi } from '../../services/api'
import { Loader2, Package, Clock } from 'lucide-react'

export function BatchListPage() {
  const [daysFilter, setDaysFilter] = useState(7)

  // 获取7天内过期的批次
  const { data, isLoading } = useQuery({
    queryKey: ['batch-expiry', daysFilter],
    queryFn: () => materialApi.expiryAlerts(daysFilter)
  })

  const batches = data?.data?.data || []

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
        <h1 className="text-2xl font-bold text-gray-900">批次管理</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">显示</span>
          <select
            value={daysFilter}
            onChange={(e) => setDaysFilter(parseInt(e.target.value))}
            className="input w-24"
          >
            <option value={3}>3天内</option>
            <option value={7}>7天内</option>
            <option value={14}>14天内</option>
            <option value={30}>30天内</option>
          </select>
          <span className="text-sm text-gray-500">到期</span>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <div className="text-3xl font-bold text-red-500">{batches.filter((b: any) => b.daysUntilExpiry <= 3).length}</div>
          <div className="text-sm text-gray-500">紧急过期</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-orange-500">{batches.filter((b: any) => b.daysUntilExpiry > 3 && b.daysUntilExpiry <= 7).length}</div>
          <div className="text-sm text-gray-500">一般预警</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-green-500">{batches.filter((b: any) => b.daysUntilExpiry > 7).length}</div>
          <div className="text-sm text-gray-500">正常</div>
        </div>
      </div>

      {/* Batch List */}
      <div className="card">
        <h3 className="font-semibold mb-4">到期批次列表 (先进先出)</h3>
        {isLoading ? (
          <div className="text-center py-8"><Loader2 className="animate-spin mx-auto" size={32} /></div>
        ) : batches.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Package size={48} className="mx-auto mb-4 text-gray-300" />
            <p>暂无即将过期的批次</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3">原料</th>
                <th className="pb-3">批次号</th>
                <th className="pb-3 text-right">数量</th>
                <th className="pb-3 text-right">到期日期</th>
                <th className="pb-3 text-right">剩余天数</th>
                <th className="pb-3">状态</th>
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
                    {batch.daysUntilExpiry}天
                  </td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded text-xs border ${getUrgencyClass(batch.daysUntilExpiry)}`}>
                      {batch.daysUntilExpiry <= 1 ? '紧急' :
                       batch.daysUntilExpiry <= 3 ? '紧急' :
                       batch.daysUntilExpiry <= 7 ? '预警' : '正常'}
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
          先进先出 (FIFO) 说明
        </h3>
        <p className="text-sm text-blue-600">
          先进先出原则：优先使用最早到期的批次。系统会根据批次到期日期自动排序，确保快过期的原料被优先使用。
          建议每日检查批次列表，及时处理即将过期的原料。
        </p>
      </div>
    </div>
  )
}
