import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { configApi } from '../../services/api'
import { Plus, Edit2, Trash2, Loader2, X } from 'lucide-react'

interface InventoryCategory {
  id: string
  name: string
  code: string
  description?: string
}

const DEFAULT_CATEGORIES = [
  { id: 'raw_material', name: '原料', code: 'raw_material', description: '原材料' },
  { id: 'packaging', name: '包材', code: 'packaging', description: '包装材料' },
  { id: 'finished_goods', name: '成品', code: 'finished_goods', description: '成品' },
]

export function InventoryCategoryPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [showModal, setShowModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<InventoryCategory | null>(null)
  const [formData, setFormData] = useState<InventoryCategory>({
    id: '',
    name: '',
    code: '',
    description: ''
  })
  const [localCategories, setLocalCategories] = useState<InventoryCategory[]>(DEFAULT_CATEGORIES)

  // Load categories from config
  const { data: configData, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const resp = await configApi.get()
      return resp.data
    }
  })

  useEffect(() => {
    if (configData?.data) {
      const cats = configData.data.inventory_categories || configData.data['inventory_categories']
      if (cats) {
        setLocalCategories(cats)
      }
    }
  }, [configData])

  const saveMutation = useMutation({
    mutationFn: async (categories: InventoryCategory[]) => {
      await configApi.set(user?.storeId || '', 'inventory_categories', categories, 'inventory')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
      closeModal()
    },
    onError: (error: any) => {
      console.error('Save category error:', error)
      alert(error?.response?.data?.message || error.message || 'Failed to save category')
    }
  })

  const openModal = (category?: InventoryCategory) => {
    if (category) {
      setEditingCategory(category)
      setFormData({ ...category })
    } else {
      setEditingCategory(null)
      setFormData({ id: '', name: '', code: '', description: '' })
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingCategory(null)
    setFormData({ id: '', name: '', code: '', description: '' })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    let newCategories: InventoryCategory[]

    if (editingCategory) {
      newCategories = localCategories.map(c =>
        c.id === editingCategory.id ? { ...formData, id: formData.code } : c
      )
    } else {
      const newCat = { ...formData, id: formData.code }
      newCategories = [...localCategories, newCat]
    }

    saveMutation.mutate(newCategories)
  }

  const handleDelete = (id: string) => {
    const newCategories = localCategories.filter(c => c.id !== id)
    saveMutation.mutate(newCategories)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => openModal()}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          {t('inventory.addCategory')}
        </button>
      </div>

      {/* 分类看板 */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {localCategories.map((cat) => (
          <div
            key={cat.id}
            className="flex-shrink-0 w-56 p-4 rounded-xl bg-white border-2 border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-700 truncate">{cat.name}</p>
                <p className="text-xs text-gray-400 mt-1">{cat.code}</p>
                {cat.description && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{cat.description}</p>
                )}
              </div>
              <div className="flex flex-col gap-1 ml-1">
                <button
                  onClick={() => openModal(cat)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => {
                    if (confirm(t('inventory.deleteCategoryConfirm'))) {
                      handleDelete(cat.id)
                    }
                  }}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* 空状态 */}
        {localCategories.length === 0 && !isLoading && (
          <div className="flex-shrink-0 w-40 p-4 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <p className="text-sm">{t('common.noData')}</p>
            </div>
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">
                {editingCategory ? t('inventory.editCategory') : t('inventory.addCategory')}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.categoryName')} *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                  placeholder={t('inventory.categoryNamePlaceholder')}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.categoryCode')} *
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  className="input"
                  placeholder={t('inventory.categoryCodePlaceholder')}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.description')}
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input"
                  placeholder={t('inventory.descriptionPlaceholder')}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? (
                    <Loader2 size={16} className="animate-spin mx-auto" />
                  ) : (
                    t('common.save')
                  )}
                </button>
                <button type="button" onClick={closeModal} className="btn-secondary">
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}