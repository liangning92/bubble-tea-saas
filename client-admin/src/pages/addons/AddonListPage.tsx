import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { addonApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { formatCurrency } from '../../utils/helpers'
import { Plus, Edit2, Trash2 } from 'lucide-react'

interface Addon {
  id: string
  name: string
  price: number
  priceAdjustment: number
  isFree: boolean
  storeId?: string
}

interface AddonFormData {
  name: string
  price: number
  priceAdjustment: number
  isFree: boolean
}

const PRESET_ADDONS = [
  { nameKey: 'pearl', price: 3000 },
  { nameKey: 'coconut', price: 3000 },
  { nameKey: 'pudding', price: 4000 },
  { nameKey: 'taroBall', price: 4000 },
  { nameKey: 'redBean', price: 3000 },
  { nameKey: 'boba', price: 3500 },
  { nameKey: 'cream', price: 5000 },
  { nameKey: 'free', price: 0, isFree: true }
]

export function AddonListPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAddon, setEditingAddon] = useState<Addon | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [formData, setFormData] = useState<AddonFormData>({
    name: '',
    price: 0,
    priceAdjustment: 0,
    isFree: false
  })

  const { data, isLoading } = useQuery({
    queryKey: ['addons'],
    queryFn: () => addonApi.list(user?.storeId || '')
  })

  // API returns { code, data: [...] }, axios wraps as { data: { code, data: [...] } }
  // So data?.data?.data is the actual array
  const addons: Addon[] = data?.data?.data || []

  const createMutation = useMutation({
    mutationFn: (data: AddonFormData) =>
      addonApi.create({ ...data, storeId: user?.storeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      closeModal()
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AddonFormData }) =>
      addonApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      closeModal()
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => addonApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addons'] })
      setDeleteConfirm(null)
    }
  })

  const openModal = (addon?: Addon) => {
    if (addon) {
      setEditingAddon(addon)
      setFormData({
        name: addon.name,
        price: addon.price,
        priceAdjustment: addon.priceAdjustment,
        isFree: addon.isFree
      })
    } else {
      setEditingAddon(null)
      setFormData({ name: '', price: 0, priceAdjustment: 0, isFree: false })
    }
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingAddon(null)
    setFormData({ name: '', price: 0, priceAdjustment: 0, isFree: false })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingAddon) {
      updateMutation.mutate({ id: editingAddon.id, data: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  const handleQuickAdd = (preset: typeof PRESET_ADDONS[0]) => {
    createMutation.mutate({
      name: t(`addons.preset_${preset.nameKey}`),
      price: preset.price,
      priceAdjustment: 0,
      isFree: preset.isFree || false
    })
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-6">
        <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
          <Plus size={20} />
          {t('addons.addAddon')}
        </button>
      </div>

      {/* Quick Add Presets */}
      <div className="mb-6">
        <p className="text-sm text-gray-500 mb-2">{t('addons.quickAdd')}</p>
        <div className="flex flex-wrap gap-2">
          {PRESET_ADDONS.map((preset) => (
            <button
              key={preset.nameKey}
              onClick={() => handleQuickAdd(preset)}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
            >
              + {t(`addons.preset_${preset.nameKey}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">{t('common.loading')}</div>
        ) : addons.length === 0 ? (
          <div className="text-center py-8">
            <div className="mb-3"><img src="/youme-logo.png" alt="YOUME" className="h-12 w-auto object-contain" /></div>
            <p className="text-gray-500">{t('common.noData')}</p>
            <button onClick={() => openModal()} className="btn-primary mt-4">
              {t('addons.addFirst')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {addons.map((addon) => (
              <div
                key={addon.id}
                className="border rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{addon.name}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {addon.isFree ? (
                        <span className="text-green-600">{t('addons.free')}</span>
                      ) : (
                        formatCurrency(addon.price)
                      )}
                    </p>
                    {!addon.isFree && addon.priceAdjustment > 0 && (
                      <p className="text-xs text-gray-400 mt-1">
                        + {formatCurrency(addon.priceAdjustment)} {t('addons.extra')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openModal(addon)}
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(addon.id)}
                      className="p-2 rounded-lg hover:bg-gray-100 text-error"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 pointer-events-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingAddon ? t('addons.editAddon') : t('addons.addAddon')}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('addons.name')}
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                  placeholder={t('addons.namePlaceholder')}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('addons.price')}
                </label>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData({ ...formData, price: parseInt(e.target.value) || 0 })
                  }
                  className="input"
                  min="0"
                  step="100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('addons.priceAdjustment')}
                </label>
                <input
                  type="number"
                  value={formData.priceAdjustment}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      priceAdjustment: parseInt(e.target.value) || 0
                    })
                  }
                  className="input"
                  min="0"
                  step="100"
                />
                <p className="text-xs text-gray-500 mt-1">{t('addons.priceAdjustmentHint')}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isFree"
                  checked={formData.isFree}
                  onChange={(e) =>
                    setFormData({ ...formData, isFree: e.target.checked })
                  }
                  className="w-4 h-4"
                />
                <label htmlFor="isFree" className="text-sm text-gray-700">
                  {t('addons.isFree')}
                </label>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="btn-primary flex-1">
                  {t('common.save')}
                </button>
                <button type="button" onClick={closeModal} className="btn-secondary">
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 pointer-events-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-2">{t('common.confirm')}</h2>
            <p className="text-gray-600 mb-4">{t('addons.deleteConfirm')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                className="btn-danger flex-1"
              >
                {t('common.delete')}
              </button>
              <button onClick={() => setDeleteConfirm(null)} className="btn-secondary flex-1">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}