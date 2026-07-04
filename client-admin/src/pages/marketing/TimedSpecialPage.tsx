import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2, Plus, Edit2, Trash2, X, Clock } from 'lucide-react'

interface TimedSpecial {
  id: string
  name: string
  productId: string
  productName?: string
  specialPrice: number
  originalPrice?: number
  startTime: string
  endTime: string
  daysOfWeek?: number[]
  applicableChannels?: string[]
  status: string
  createdAt: string
}

const defaultForm = {
  name: '',
  productId: '',
  productName: '',
  specialPrice: 0,
  originalPrice: 0,
  startTime: '',
  endTime: '',
  daysOfWeek: [] as number[],
  applicableChannels: [] as string[],
  status: 'active'
}

export function TimedSpecialPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const storeId = user?.storeId || 'default'
  const queryClient = useQueryClient()

  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editingSpecial, setEditingSpecial] = useState<TimedSpecial | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [searchProduct, setSearchProduct] = useState('')

  // Fetch timed specials
  const { data, isLoading } = useQuery({
    queryKey: ['timed-specials', storeId],
    queryFn: () => marketingApi.timedSpecials(storeId)
  })

  // Search products for selection
  const { data: productsData } = useQuery({
    queryKey: ['products-search', searchProduct],
    queryFn: () => marketingApi.searchProducts(searchProduct),
    enabled: searchProduct.length > 2
  })

  const specials: TimedSpecial[] = data?.data || []
  const products = productsData?.data || []

  const createMutation = useMutation({
    mutationFn: (data: any) => marketingApi.createTimedSpecial(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timed-specials'] })
      closeModal()
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => marketingApi.updateTimedSpecial(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timed-specials'] })
      closeModal()
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => marketingApi.deleteTimedSpecial(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timed-specials'] })
    }
  })

  const closeModal = () => {
    setShowCreate(false)
    setShowEdit(false)
    setEditingSpecial(null)
    setForm(defaultForm)
    setSearchProduct('')
  }

  const openEditModal = (special: TimedSpecial) => {
    setEditingSpecial(special)
    setForm({
      name: special.name,
      productId: special.productId,
      productName: special.productName || '',
      specialPrice: special.specialPrice,
      originalPrice: special.originalPrice || 0,
      startTime: special.startTime ? special.startTime.split('T')[0] : '',
      endTime: special.endTime ? special.endTime.split('T')[0] : '',
      daysOfWeek: special.daysOfWeek || [],
      applicableChannels: special.applicableChannels || [],
      status: special.status
    })
    setShowEdit(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      ...form,
      storeId,
      startTime: form.startTime ? new Date(form.startTime).toISOString() : null,
      endTime: form.endTime ? new Date(form.endTime).toISOString() : null
    }
    if (showEdit && editingSpecial) {
      updateMutation.mutate({ id: editingSpecial.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const selectProduct = (product: any) => {
    setForm({
      ...form,
      productId: product.id,
      productName: product.name
    })
    setSearchProduct('')
  }

  const formatCurrency = (value: number) => `Rp ${value.toLocaleString('id-ID')}`

  const getDaysOfWeekLabel = (days: number[]) => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return days.map(d => dayNames[d]).join(', ')
  }

  const isActive = (special: TimedSpecial) => {
    const now = new Date()
    const start = new Date(special.startTime)
    const end = new Date(special.endTime)
    return now >= start && now <= end && special.status === 'active'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Clock size={24} className="text-primary" />
          <h1 className="text-xl font-semibold">{t('marketing.timedSpecials')}</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={20} />
          {t('marketing.addTimedSpecial')}
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : specials.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Clock size={48} className="mb-4 opacity-50" />
            <p>{t('marketing.noTimedSpecials')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {specials.map((special) => (
              <div key={special.id} className={`p-4 rounded-lg border ${isActive(special) ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${isActive(special) ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <div>
                      <div className="font-medium">{special.name}</div>
                      <div className="text-sm text-gray-500">{special.productName || special.productId}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm text-gray-500">{t('marketing.originalPrice')}</div>
                      <div className="text-sm line-through text-gray-400">{special.originalPrice ? formatCurrency(special.originalPrice) : '-'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">{t('marketing.specialPrice')}</div>
                      <div className="text-lg font-bold text-primary">{formatCurrency(special.specialPrice)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">{t('marketing.validity')}</div>
                      <div className="text-sm">{new Date(special.startTime).toLocaleDateString('id-ID')} - {new Date(special.endTime).toLocaleDateString('id-ID')}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEditModal(special)} className="text-gray-500 hover:text-gray-700">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => deleteMutation.mutate(special.id)} className="text-red-500 hover:text-red-700">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
                {special.daysOfWeek && special.daysOfWeek.length > 0 && (
                  <div className="mt-2 text-sm text-gray-500">
                    {t('marketing.daysOfWeek')}: {getDaysOfWeekLabel(special.daysOfWeek || [])}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreate || showEdit) && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto pointer-events-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{showEdit ? t('marketing.editTimedSpecial') : t('marketing.addTimedSpecial')}</h3>
              <button onClick={closeModal} className="p-1 rounded-lg hover:bg-gray-100">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.ruleName')} *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input"
                  placeholder={t('marketing.timedSpecialNamePlaceholder')}
                  required
                />
              </div>

              {/* Product Selection */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.product')} *</label>
                {form.productName ? (
                  <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <span>{form.productName}</span>
                    <button type="button" onClick={() => setForm({ ...form, productId: '', productName: '' })} className="text-gray-500 hover:text-gray-700">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      value={searchProduct}
                      onChange={(e) => setSearchProduct(e.target.value)}
                      className="input"
                      placeholder={t('marketing.searchProduct')}
                    />
                    {products.length > 0 && (
                      <div className="mt-2 max-h-32 overflow-y-auto border rounded-lg">
                        {products.map((p: any) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => selectProduct(p)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0"
                          >
                            {p.name} - {formatCurrency(p.price)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.originalPrice')}</label>
                  <input
                    type="number"
                    value={form.originalPrice}
                    onChange={(e) => setForm({ ...form, originalPrice: Number(e.target.value) })}
                    className="input"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.specialPrice')} *</label>
                  <input
                    type="number"
                    value={form.specialPrice}
                    onChange={(e) => setForm({ ...form, specialPrice: Number(e.target.value) })}
                    className="input"
                    min="0"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.startDate')} *</label>
                  <input
                    type="date"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.endDate')} *</label>
                  <input
                    type="date"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    className="input"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="submit" disabled={!form.name || !form.productId || createMutation.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {createMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                  {t('common.save')}
                </button>
                <button type="button" onClick={closeModal} className="btn-secondary">{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}