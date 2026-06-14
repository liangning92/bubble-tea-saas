import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { marketingApi } from '../../services/api'
import { Loader2, Plus, Edit2, Trash2, Lock, Palette } from 'lucide-react'

interface Category {
  id: string
  name: string
  icon?: string
  color?: string
  isBuiltIn: boolean
  sortOrder: number
  storeId?: string
}

const DEFAULT_FORM = {
  name: '',
  icon: '',
  color: '#3B82F6'
}

export function CampaignCategoryListPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const storeId = user?.storeId || ''

  const [showModal, setShowModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Fetch categories
  const { data, isLoading } = useQuery({
    queryKey: ['campaign-categories', user?.storeId],
    queryFn: () => marketingApi.campaignCategories(user?.storeId || '')
  })

  const categories: Category[] = data?.data?.data?.list || []

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => marketingApi.createCampaignCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-categories'] })
      closeModal()
    },
    onError: (error: any) => {
      alert(error?.message || t('common.error'))
    }
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => marketingApi.updateCampaignCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-categories'] })
      closeModal()
    },
    onError: (error: any) => {
      alert(error?.message || t('common.error'))
    }
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => marketingApi.deleteCampaignCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-categories'] })
      setDeleteId(null)
    },
    onError: (error: any) => {
      alert(error?.message || t('common.error'))
    }
  })

  // Seed mutation
  const seedMutation = useMutation({
    mutationFn: () => marketingApi.seedCampaignCategories(storeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-categories'] })
    }
  })

  const closeModal = () => {
    setShowModal(false)
    setEditingCategory(null)
    setForm(DEFAULT_FORM)
  }

  const openEdit = (cat: Category) => {
    setEditingCategory(cat)
    setForm({ name: cat.name, icon: cat.icon || '', color: cat.color || '#3B82F6' })
    setShowModal(true)
  }

  const openCreate = () => {
    setEditingCategory(null)
    setForm(DEFAULT_FORM)
    setShowModal(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return

    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data: form })
    } else {
      createMutation.mutate({ storeId, ...form })
    }
  }

  const EMOJI_OPTIONS = ['🎂', '🔄', '⭐', '🌙', '🎉', '⏰', '🎁', '💎', '🔥', '💫', '🌟', '🎊', '💝', '🎈', '🛍️', '📢']
  const COLOR_OPTIONS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#F38181', '#AA96DA', '#3B82F6', '#10B981', '#F59E0B', '#EF4444']

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div />
        <div className="flex gap-2">
          <button
            onClick={() => seedMutation.mutate()}
            className="btn-secondary flex items-center gap-2"
            disabled={seedMutation.isPending}
          >
            <Loader2 size={16} className={seedMutation.isPending ? 'animate-spin' : ''} />
            {t('common.seed')}
          </button>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus size={20} />
            {t('common.add')}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : categories.length === 0 ? (
        <div className="card text-center py-12">
          <Palette size={48} className="mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500 mb-4">{t('common.noData')}</p>
          <button onClick={() => seedMutation.mutate()} className="btn-primary">
            {t('marketing.seedDefaultCategories')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="card hover:shadow-md transition-shadow"
              style={{ borderLeftColor: cat.color || '#3B82F6', borderLeftWidth: '4px' }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{cat.icon || '📁'}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">{cat.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${cat.isBuiltIn ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                      {cat.isBuiltIn ? t('common.builtIn') : t('common.custom')}
                    </span>
                  </div>
                </div>
                {!cat.isBuiltIn && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(cat)}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteId(cat.id)}
                      className="p-1.5 rounded hover:bg-red-50 text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
                {cat.isBuiltIn && (
                  <Lock size={14} className="text-gray-400" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {editingCategory ? t('common.edit') : t('common.add')} {t('marketing.category')}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.categoryName')} *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input"
                  required
                  maxLength={50}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t('marketing.icon') || 'Icon'}</label>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setForm({ ...form, icon: emoji })}
                      className={`w-10 h-10 text-xl rounded-lg border-2 ${form.icon === emoji ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t('marketing.color') || 'Color'}</label>
                <div className="flex gap-2">
                  {COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setForm({ ...form, color })}
                      className={`w-8 h-8 rounded-full ${form.color === color ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={16} className="animate-spin" />}
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

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">{t('common.delete')}</h3>
            <p className="text-gray-600 mb-6">{t('marketing.deleteCategoryConfirm')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                disabled={deleteMutation.isPending}
                className="btn-danger flex-1 flex items-center justify-center gap-2"
              >
                {deleteMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                {t('common.delete')}
              </button>
              <button onClick={() => setDeleteId(null)} className="btn-secondary flex-1">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
