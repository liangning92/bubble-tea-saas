import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { hygieneApi } from '../../services/api'
import { Loader2, Plus, Trash2, X } from 'lucide-react'

// Default area options for new areas (user can still use these or enter custom)
export const DEFAULT_AREA_OPTIONS = [
  { code: 'counter', name: '柜台 / Counter', icon: '🧾', color: '#FF6B6B' },
  { code: 'kitchen', name: '后厨 / Kitchen', icon: '🍳', color: '#4ECDC4' },
  { code: 'ingredients', name: '原料区 / Ingredients', icon: '🧋', color: '#45B7D1' },
  { code: 'floor', name: '地面 / Floor', icon: '🧹', color: '#96CEB4' },
  { code: 'restroom', name: '卫生间 / Restroom', icon: '🚻', color: '#DDA0DD' },
  { code: 'waste', name: '垃圾区 / Waste', icon: '🗑️', color: '#FFEAA7' },
  { code: 'equipment', name: '设备区 / Equipment', icon: '⚙️', color: '#74B9FF' },
  { code: 'ventilation', name: '通风/空调 / Ventilation', icon: '💨', color: '#A29BFE' },
  { code: 'storage', name: '仓储区 / Storage', icon: '📦', color: '#F38181' },
  { code: 'dining', name: '用餐区 / Dining', icon: '🪑', color: '#AA96DA' },
]

interface Area {
  id?: string
  storeId?: string
  code: string
  name: string
  icon: string
  color: string
  priority?: number
  description?: string
  isActive?: boolean
  isCustom?: boolean
  managerId?: string
}

export function HygieneAreasPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingArea, setEditingArea] = useState<Area | null>(null)
  const [form, setForm] = useState<Partial<Area>>({
    code: '',
    name: '',
    icon: '📋',
    color: '#808080',
    priority: 1,
  })

  const { data: areasData, isLoading } = useQuery({
    queryKey: ['hygiene-areas'],
    queryFn: () => hygieneApi.areas(),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => hygieneApi.createArea(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hygiene-areas'] })
      closeForm()
    },
    onError: (error: any) => {
      console.error('Create area error:', error)
      alert(t('hygiene.createAreaFailed') + ': ' + (error?.message || error?.response?.data?.message || t('common.unknownError')))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => hygieneApi.updateArea(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hygiene-areas'] })
      closeForm()
    },
    onError: (error: any) => {
      console.error('Update area error:', error)
      alert(t('hygiene.updateAreaFailed') + ': ' + (error?.message || error?.response?.data?.message || t('common.unknownError')))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => hygieneApi.deleteArea(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hygiene-areas'] })
    },
    onError: (error: any) => {
      console.error('Delete area error:', error)
      alert(t('hygiene.deleteAreaFailed') + ': ' + (error?.message || error?.response?.data?.message || t('common.unknownError')))
    },
  })

  // Merge: use API areas as source of truth
  // If no areas exist, show empty state for user to create
  const areas: Area[] = areasData?.data?.data?.list || []

  const openAddForm = () => {
    setEditingArea(null)
    setForm({
      code: '',
      name: '',
      icon: '📋',
      color: '#808080',
      priority: areas.length + 1,
    })
    setShowForm(true)
  }

  const openEditForm = (area: Area) => {
    setEditingArea(area)
    setForm({
      code: area.code,
      name: area.name,
      icon: area.icon || '📋',
      color: area.color || '#808080',
      priority: area.priority || 1,
      description: area.description,
    })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingArea(null)
  }

  const handleSave = () => {
    try {
      if (!form.code || !form.name) return

      if (editingArea?.id) {
        updateMutation.mutate({ id: editingArea.id, data: form })
      } else {
        createMutation.mutate(form)
      }
    } catch (err) {
      console.error('Save error:', err)
      alert(t('hygiene.saveAreaFailed') + ': ' + (err instanceof Error ? err.message : t('common.unknownError')))
    }
  }

  const handleDelete = (id: string) => {
    if (window.confirm(t('hygiene.confirmDelete'))) {
      deleteMutation.mutate(id)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />
        <button onClick={openAddForm} className="btn-primary flex items-center gap-2">
          <Plus size={20} />
          {t('hygiene.addArea')}
        </button>
      </div>

      {/* Areas Grid */}
      {areas.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">{t('hygiene.noAreas')}</p>
          <button onClick={openAddForm} className="btn-primary">
            {t('hygiene.addFirstArea')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {areas.map((area) => (
            <div
              key={area.code}
              className="card hover:shadow-md transition-all cursor-pointer group"
              style={{ borderLeftWidth: 4, borderLeftColor: area.color || '#ccc' }}
              onClick={() => openEditForm(area)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{area.icon || '📋'}</span>
                  <div>
                    <div className="font-medium">{area.name}</div>
                    <div className="text-xs text-gray-400">{area.code}</div>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (area.id) handleDelete(area.id)
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {area.description && (
                <div className="mt-2 text-sm text-gray-500 line-clamp-2">
                  {area.description}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeForm}>
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {editingArea ? t('hygiene.editArea') : t('hygiene.addArea')}
              </h3>
              <button onClick={closeForm} className="p-1 hover:bg-gray-100 rounded">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Quick Templates */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('hygiene.areaName')} ({t('common.or')} {t('common.required')})
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {DEFAULT_AREA_OPTIONS.slice(0, 6).map((opt) => (
                    <button
                      key={opt.code}
                      type="button"
                      onClick={() => setForm({
                        ...form,
                        code: opt.code,
                        name: opt.name,
                        icon: opt.icon,
                        color: opt.color,
                      })}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                        form.code === opt.code
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {opt.icon} {opt.code}
                    </button>
                  ))}
                </div>
              </div>

              {/* Area Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('hygiene.areaCode')} *
                </label>
                <input
                  type="text"
                  value={form.code || ''}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  className="input w-full"
                  placeholder="e.g., storage_room"
                />
              </div>

              {/* Area Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('hygiene.areaName')} *
                </label>
                <input
                  type="text"
                  value={form.name || ''}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input w-full"
                  placeholder={t('hygiene.areaNamePlaceholder') || 'e.g., Counter'}
                />
              </div>

              {/* Icon */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('hygiene.areaIcon')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {['📋', '🧾', '🍳', '🧋', '🧹', '🚻', '🗑️', '⚙️', '💨', '🏪', '🧊', '🔧', '📦', '🛒', '🪑', '🚪', '🪟', '🍵', '🧃', '🥤'].map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setForm({ ...form, icon })}
                      className={`w-10 h-10 text-xl rounded-lg border transition-colors ${
                        form.icon === icon ? 'border-primary bg-primary/10' : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('hygiene.areaColor')}
                </label>
                <div className="flex gap-2">
                  {['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#DDA0DD', '#FFEAA7', '#74B9FF', '#A29BFE', '#F38181', '#AA96DA', '#808080', '#333333'].map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setForm({ ...form, color })}
                      className={`w-8 h-8 rounded-full transition-transform ${
                        form.color === color ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('hygiene.areaPriority')}
                </label>
                <input
                  type="number"
                  value={form.priority || 1}
                  onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 1 })}
                  className="input w-full max-w-[120px]"
                  min="1"
                  max="99"
                />
                <p className="text-xs text-gray-500 mt-1">{t('hygiene.priorityHint')}</p>
              </div>
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={closeForm} className="btn-secondary">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={!form.code || !form.name || isSaving}
                className="btn-primary flex items-center gap-2"
              >
                {isSaving && <Loader2 size={16} className="animate-spin" />}
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
