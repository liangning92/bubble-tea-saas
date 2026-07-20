import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { inventoryApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2, Plus, Package, Check, X, Clock, AlertTriangle, RotateCcw } from 'lucide-react'

interface InventoryCount {
  id: string
  storeId: string
  period: string
  status: string
  startDate: string
  endDate: string
  notes?: string
  items: InventoryCountItem[]
  createdAt: string
}

interface InventoryCountItem {
  id: string
  inventoryId: string
  systemQty: number
  countedQty?: number
  variance?: number
  countedAt?: string
  countedBy?: string
  note?: string
  inventory?: {
    id: string
    name: string
    unit: string
    currentStock: number
  }
}

type TabType = 'list' | 'detail' | 'new'

export function InventoryCountPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const storeId = user?.storeId || ''

  const [activeTab, setActiveTab] = useState<TabType>('list')
  const [selectedCount, setSelectedCount] = useState<InventoryCount | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newCountForm, setNewCountForm] = useState({
    period: 'monthly' as 'monthly' | 'quarterly' | 'annual',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    notes: ''
  })

  // Fetch inventory counts
  const { data: countsData, isLoading } = useQuery({
    queryKey: ['inventory-counts'],
    queryFn: () => inventoryApi.getInventoryCounts(),
    enabled: !!storeId
  })

  const counts: InventoryCount[] = countsData?.data?.data?.list || []

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => inventoryApi.createInventoryCount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-counts'] })
      setShowCreateModal(false)
      setNewCountForm({
        period: 'monthly',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        notes: ''
      })
    }
  })

  // Update count item mutation
  const updateItemMutation = useMutation({
    mutationFn: ({ countId, itemId, data }: { countId: string; itemId: string; data: any }) =>
      inventoryApi.updateInventoryCountItem(countId, itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-counts'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-count', selectedCount?.id] })
    }
  })

  // Complete count mutation
  const completeMutation = useMutation({
    mutationFn: (id: string) => inventoryApi.completeInventoryCount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-counts'] })
      if (selectedCount) {
        queryClient.invalidateQueries({ queryKey: ['inventory-count', selectedCount.id] })
      }
    }
  })

  // Cancel count mutation
  const cancelMutation = useMutation({
    mutationFn: (id: string) => inventoryApi.cancelInventoryCount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-counts'] })
      setActiveTab('list')
      setSelectedCount(null)
    }
  })

  const handleCreateCount = () => {
    if (!storeId) return
    createMutation.mutate({
      storeId,
      ...newCountForm,
      startDate: new Date(newCountForm.startDate).toISOString(),
      endDate: new Date(newCountForm.endDate).toISOString()
    })
  }

  const handleUpdateItem = (item: InventoryCountItem, countedQty: number) => {
    if (!selectedCount) return
    updateItemMutation.mutate({
      countId: selectedCount.id,
      itemId: item.id,
      data: {
        countedQty,
        countedBy: user?.staff?.id || '',
        note: item.note
      }
    })
  }

  const handleComplete = () => {
    if (!selectedCount) return
    if (!confirm(t('inventory.confirmCompleteCount'))) return
    completeMutation.mutate(selectedCount.id)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="badge badge-success">{t('inventory.completed')}</span>
      case 'in_progress':
        return <span className="badge badge-warning">{t('inventory.inProgress')}</span>
      case 'cancelled':
        return <span className="badge badge-secondary">{t('inventory.cancelled')}</span>
      default:
        return <span className="badge">{status}</span>
    }
  }

  const getPeriodLabel = (period: string) => {
    switch (period) {
      case 'monthly': return t('inventory.monthly')
      case 'quarterly': return t('inventory.quarterly')
      case 'annual': return t('inventory.annual')
      default: return period
    }
  }

  // List View
  const renderListView = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('inventory.inventoryCount')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('inventory.inventoryCountDesc')}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          {t('inventory.newCount')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <div className="text-3xl font-bold text-gray-600">{counts.length}</div>
          <div className="text-sm text-gray-500">{t('inventory.totalCounts')}</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-orange-600">
            {counts.filter(c => c.status === 'in_progress').length}
          </div>
          <div className="text-sm text-gray-500">{t('inventory.inProgress')}</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-green-600">
            {counts.filter(c => c.status === 'completed').length}
          </div>
          <div className="text-sm text-gray-500">{t('inventory.completed')}</div>
        </div>
      </div>

      {/* Count List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : counts.length === 0 ? (
        <div className="card text-center py-12">
          <Package size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">{t('inventory.noCounts')}</p>
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary mt-4">
            {t('inventory.createFirst')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {counts.map((count) => (
            <div key={count.id} className="card hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => {
                setSelectedCount(count)
                setActiveTab('detail')
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${
                    count.status === 'completed' ? 'bg-green-100 text-green-600' :
                    count.status === 'in_progress' ? 'bg-orange-100 text-orange-600' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {count.status === 'completed' ? <Check size={24} /> :
                     count.status === 'in_progress' ? <Clock size={24} /> :
                     <X size={24} />}
                  </div>
                  <div>
                    <div className="font-medium">{getPeriodLabel(count.period)}</div>
                    <div className="text-sm text-gray-500">
                      {new Date(count.startDate).toLocaleDateString()} - {new Date(count.endDate).toLocaleDateString()}
                    </div>
                    {count.notes && <div className="text-sm text-gray-400 mt-1">{count.notes}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {getStatusBadge(count.status)}
                  <span className="text-sm text-gray-400">
                    {count.items?.length || 0} {t('inventory.items')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // Detail View
  const renderDetailView = () => {
    if (!selectedCount) return null

    const varianceItems = selectedCount.items?.filter(i => i.variance !== 0 && i.variance !== undefined) || []
    const countedItems = selectedCount.items?.filter(i => i.countedQty !== undefined && i.countedQty !== null) || []

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => { setActiveTab('list'); setSelectedCount(null) }} className="text-sm text-gray-500 hover:text-gray-700 mb-2">
              ← {t('common.back')}
            </button>
            <h1 className="text-2xl font-bold text-gray-900">{getPeriodLabel(selectedCount.period)}</h1>
            <div className="flex items-center gap-4 mt-2">
              {getStatusBadge(selectedCount.status)}
              <span className="text-sm text-gray-500">
                {countedItems.length} / {selectedCount.items?.length || 0} {t('inventory.counted')}
              </span>
            </div>
          </div>
          <div className="flex gap-3">
            {selectedCount.status === 'in_progress' && (
              <>
                <button
                  onClick={() => cancelMutation.mutate(selectedCount.id)}
                  disabled={cancelMutation.isPending}
                  className="btn btn-outline flex items-center gap-2"
                >
                  <X size={16} />
                  {t('inventory.cancelCount')}
                </button>
                <button
                  onClick={handleComplete}
                  disabled={completeMutation.isPending || countedItems.length === 0}
                  className="btn btn-primary flex items-center gap-2"
                >
                  {completeMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  {t('inventory.completeCount')}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        {selectedCount.status === 'in_progress' && (
          <div className="grid grid-cols-3 gap-4">
            <div className="card bg-green-50 border-green-200">
              <div className="text-2xl font-bold text-green-600">{countedItems.length}</div>
              <div className="text-sm text-gray-500">{t('inventory.counted')}</div>
            </div>
            <div className="card bg-red-50 border-red-200">
              <div className="text-2xl font-bold text-red-600">
                {selectedCount.items?.length || 0 - countedItems.length}
              </div>
              <div className="text-sm text-gray-500">{t('inventory.pending')}</div>
            </div>
            <div className="card bg-orange-50 border-orange-200">
              <div className="text-2xl font-bold text-orange-600">{varianceItems.length}</div>
              <div className="text-sm text-gray-500">{t('inventory.hasVariance')}</div>
            </div>
          </div>
        )}

        {/* Variance Alert */}
        {varianceItems.length > 0 && (
          <div className="card bg-orange-50 border-orange-200">
            <div className="flex items-center gap-2 text-orange-700 font-medium mb-3">
              <AlertTriangle size={20} />
              {t('inventory.varianceItems')}
            </div>
            <div className="space-y-2">
              {varianceItems.slice(0, 5).map(item => (
                <div key={item.id} className="flex items-center justify-between bg-white p-3 rounded-lg">
                  <div>
                    <span className="font-medium">{item.inventory?.name || 'Unknown'}</span>
                    <span className="text-sm text-gray-500 ml-2">({item.inventory?.unit})</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">
                      {t('inventory.system')}: {item.systemQty}
                    </span>
                    <span className="text-sm text-gray-500">
                      {t('inventory.actual')}: {item.countedQty}
                    </span>
                    <span className={`font-bold ${item.variance! > 0 ? 'text-red-600' : 'text-blue-600'}`}>
                      {item.variance! > 0 ? '+' : ''}{item.variance}
                    </span>
                  </div>
                </div>
              ))}
              {varianceItems.length > 5 && (
                <div className="text-center text-sm text-gray-500">
                  {t('inventory.andMore')} {varianceItems.length - 5} {t('inventory.itemsVariance')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Items Table */}
        <div className="card">
          <h3 className="font-medium mb-4">{t('inventory.countItems')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3">{t('inventory.material')}</th>
                  <th className="pb-3 text-right">{t('inventory.systemQty')}</th>
                  <th className="pb-3 text-right">{t('inventory.actualQty')}</th>
                  <th className="pb-3 text-right">{t('inventory.varianceCol')}</th>
                  {selectedCount.status === 'in_progress' && (
                    <th className="pb-3 text-center">{t('inventory.action')}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {selectedCount.items?.map(item => {
                  const variance = item.countedQty !== undefined && item.countedQty !== null
                    ? item.countedQty - item.systemQty
                    : null

                  return (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-3">
                        <span className="font-medium">{item.inventory?.name || 'Unknown'}</span>
                        <span className="text-sm text-gray-500 ml-2">({item.inventory?.unit})</span>
                      </td>
                      <td className="py-3 text-right text-gray-600">{item.systemQty}</td>
                      <td className="py-3 text-right">
                        {item.countedQty !== undefined && item.countedQty !== null ? (
                          <span className={variance !== 0 && variance !== null ? 'font-bold text-orange-600' : ''}>
                            {item.countedQty}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {variance !== null ? (
                          <span className={`font-medium ${variance > 0 ? 'text-red-600' : variance < 0 ? 'text-blue-600' : 'text-gray-600'}`}>
                            {variance > 0 ? '+' : ''}{variance}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      {selectedCount.status === 'in_progress' && (
                        <td className="py-3 text-center">
                          <CountItemInput
                            item={item}
                            onUpdate={(qty) => handleUpdateItem(item, qty)}
                            isUpdating={updateItemMutation.isPending}
                          />
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  // Create Modal
  const renderCreateModal = () => (
    <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md pointer-events-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">{t('inventory.newCount')}</h2>

        <div className="space-y-4">
          <div className="form-group">
            <label className="form-label">{t('inventory.period') || '盘点周期'}</label>
            <select
              value={newCountForm.period}
              onChange={(e) => setNewCountForm({ ...newCountForm, period: e.target.value as any })}
              className="input w-full"
            >
              <option value="monthly">{t('inventory.monthly') || '月度盘点'}</option>
              <option value="quarterly">{t('inventory.quarterly') || '季度盘点'}</option>
              <option value="annual">{t('inventory.annual') || '年度盘点'}</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">{t('inventory.startDate') || '开始日期'}</label>
              <input
                type="date"
                value={newCountForm.startDate}
                onChange={(e) => setNewCountForm({ ...newCountForm, startDate: e.target.value })}
                className="input w-full"
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('inventory.endDate') || '结束日期'}</label>
              <input
                type="date"
                value={newCountForm.endDate}
                onChange={(e) => setNewCountForm({ ...newCountForm, endDate: e.target.value })}
                className="input w-full"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t('inventory.notes') || '备注'}</label>
            <textarea
              value={newCountForm.notes}
              onChange={(e) => setNewCountForm({ ...newCountForm, notes: e.target.value })}
              className="input w-full"
              rows={3}
              placeholder={t('inventory.notesPlaceholder') || '可选备注...'}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={() => setShowCreateModal(false)} className="btn btn-outline flex-1">
            {t('common.cancel') || '取消'}
          </button>
          <button
            onClick={handleCreateCount}
            disabled={createMutation.isPending}
            className="btn btn-primary flex-1"
          >
            {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {t('inventory.create') || '创建'}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      {activeTab === 'list' && renderListView()}
      {activeTab === 'detail' && renderDetailView()}
      {showCreateModal && renderCreateModal()}
    </div>
  )
}

// Count Item Input Component
function CountItemInput({
  item,
  onUpdate,
  isUpdating
}: {
  item: InventoryCountItem
  onUpdate: (qty: number) => void
  isUpdating: boolean
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(item.countedQty?.toString() || '')
  const [showInput, setShowInput] = useState(!item.countedQty)

  const handleSubmit = () => {
    const qty = parseFloat(value)
    if (!isNaN(qty) && qty >= 0) {
      onUpdate(qty)
      setShowInput(false)
    }
  }

  if (showInput || item.countedQty === undefined || item.countedQty === null) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          className="input input-sm w-20"
          min={0}
          placeholder={t('common.placeholderZero')}
          disabled={isUpdating}
        />
        <button onClick={handleSubmit} disabled={isUpdating} className="btn btn-sm btn-primary">
          <Check size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">{item.countedQty}</span>
      <button
        onClick={() => setShowInput(true)}
        className="btn btn-sm btn-ghost"
        title={t('inventory.editItem')}
      >
        <RotateCcw size={14} />
      </button>
    </div>
  )
}
