import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Plus, Loader2, Ticket, Percent, Banknote, Gift, Truck, Edit2, Trash2, X, Copy, Check } from 'lucide-react'

interface Coupon {
  id: string
  code: string
  type: 'discount_percent' | 'discount_fixed' | 'free_product' | 'free_delivery'
  value: number
  minOrder?: number
  maxDiscount?: number
  validFrom?: string
  validUntil?: string
  usageLimit?: number
  usedCount: number
  status?: string
}

const defaultForm: {
  code: string
  type: 'discount_percent' | 'discount_fixed' | 'free_product' | 'free_delivery'
  value: number
  minOrder: number
  maxDiscount: number
  validFrom: string
  validUntil: string
  usageLimit: number
} = {
  code: '',
  type: 'discount_percent',
  value: 10,
  minOrder: 0,
  maxDiscount: 0,
  validFrom: '',
  validUntil: '',
  usageLimit: 0
}

export function CouponListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const storeId = user?.storeId || undefined

  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null)
  const [showDelete, setShowDelete] = useState<string | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['coupons'],
    queryFn: () => marketingApi.coupons(storeId)
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => marketingApi.createCoupon(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      closeModal()
    },
    onError: (error: any) => {
      alert(error?.message || t('common.error'))
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => marketingApi.updateCoupon(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      closeModal()
    },
    onError: (error: any) => {
      alert(error?.message || t('common.error'))
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => marketingApi.deleteCoupon(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      setShowDelete(null)
    },
    onError: (error: any) => {
      alert(error?.message || t('common.error'))
    }
  })

  const coupons: Coupon[] = data?.data?.data?.list || []

  const closeModal = () => {
    setShowCreate(false)
    setShowEdit(false)
    setEditingCoupon(null)
    setForm(defaultForm)
  }

  const openEditModal = (coupon: Coupon) => {
    setEditingCoupon(coupon)
    setForm({
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      minOrder: coupon.minOrder || 0,
      maxDiscount: coupon.maxDiscount || 0,
      validFrom: coupon.validFrom ? coupon.validFrom.split('T')[0] : '',
      validUntil: coupon.validUntil ? coupon.validUntil.split('T')[0] : '',
      usageLimit: coupon.usageLimit || 0
    })
    setShowEdit(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      ...form,
      storeId,
      validFrom: form.validFrom ? new Date(form.validFrom).toISOString() : undefined,
      validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : undefined,
    }
    if (showEdit && editingCoupon) {
      updateMutation.mutate({ id: editingCoupon.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const getTypeBadge = (type: string) => {
    const badges: Record<string, string> = {
      discount_percent: 'badge-warning',
      discount_fixed: 'badge-info',
      free_product: 'badge-success',
      free_delivery: 'badge-secondary'
    }
    return badges[type] || 'badge-gray'
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'discount_percent': return <Percent size={14} />
      case 'discount_fixed': return <Banknote size={14} />
      case 'free_product': return <Gift size={14} />
      case 'free_delivery': return <Truck size={14} />
      default: return <Ticket size={14} />
    }
  }

  const getTypeLabel = (type: string) => t(`marketing.couponTypes.${type}`)

  const formatValue = (coupon: Coupon) => {
    switch (coupon.type) {
      case 'discount_percent': return `${coupon.value}%`
      case 'discount_fixed': return `Rp ${coupon.value.toLocaleString()}`
      case 'free_product': return t('marketing.freeProduct')
      case 'free_delivery': return t('marketing.freeDelivery')
      default: return coupon.value
    }
  }

  const formatDate = (date?: string) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('id-ID')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={20} /> {t('marketing.createCoupon')}
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : coupons.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Ticket size={48} className="mb-4 opacity-50" />
            <p>{t('common.noData')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">{t('marketing.couponCode')}</th>
                  <th className="pb-3 font-medium">{t('marketing.couponType')}</th>
                  <th className="pb-3 font-medium">{t('marketing.couponValue')}</th>
                  <th className="pb-3 font-medium">{t('marketing.minOrder')}</th>
                  <th className="pb-3 font-medium">{t('marketing.validity')}</th>
                  <th className="pb-3 font-medium">{t('marketing.usageCount')}</th>
                  <th className="pb-3 font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr key={coupon.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <Ticket size={16} className="text-primary" />
                        <span className="font-mono font-medium">{coupon.code}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(coupon.code)
                            setCopiedId(coupon.id)
                            setTimeout(() => setCopiedId(null), 2000)
                          }}
                          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                          title={t('marketing.copyCode')}
                        >
                          {copiedId === coupon.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className={`badge ${getTypeBadge(coupon.type)}`}>
                        <span className="flex items-center gap-1">
                          {getTypeIcon(coupon.type)}
                          {getTypeLabel(coupon.type)}
                        </span>
                      </span>
                    </td>
                    <td className="py-3 font-medium">{formatValue(coupon)}</td>
                    <td className="py-3 text-gray-600">
                      {coupon.minOrder ? `Rp ${coupon.minOrder.toLocaleString()}` : '-'}
                    </td>
                    <td className="py-3 text-sm text-gray-600">
                      {coupon.validFrom && coupon.validUntil
                        ? `${formatDate(coupon.validFrom)} - ${formatDate(coupon.validUntil)}`
                        : coupon.validFrom
                          ? `${formatDate(coupon.validFrom)} - ...`
                          : '-'}
                    </td>
                    <td className="py-3">
                      <span className="text-gray-600">
                        {coupon.usedCount}
                        {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ''}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/marketing/coupons/${coupon.id}`)}
                          className="text-primary hover:text-primary/80 text-sm font-medium"
                        >
                          {t('common.view')}
                        </button>
                        <button onClick={() => openEditModal(coupon)} className="text-gray-500 hover:text-gray-700">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => setShowDelete(coupon.id)} className="text-red-500 hover:text-red-700">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto pointer-events-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t('marketing.createCoupon')}</h3>
              <button onClick={closeModal} className="p-1 rounded-lg hover:bg-gray-100">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.couponCode')} *</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="input font-mono"
                  placeholder={t('marketing.couponCodePlaceholder')}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.couponType')}</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as any })} className="input">
                  <option value="discount_percent">{t('marketing.couponTypes.discount_percent')}</option>
                  <option value="discount_fixed">{t('marketing.couponTypes.discount_fixed')}</option>
                  <option value="free_product">{t('marketing.couponTypes.free_product')}</option>
                  <option value="free_delivery">{t('marketing.couponTypes.free_delivery')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.couponValue')} *</label>
                <input
                  type="number"
                  value={form.value}
                  onChange={e => setForm({ ...form, value: Number(e.target.value) })}
                  className="input"
                  min={0}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.minOrder')}</label>
                <input
                  type="number"
                  value={form.minOrder}
                  onChange={e => setForm({ ...form, minOrder: Number(e.target.value) })}
                  className="input"
                  min={0}
                />
              </div>
              {form.type === 'discount_percent' && (
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.maxDiscount')}</label>
                  <input
                    type="number"
                    value={form.maxDiscount}
                    onChange={e => setForm({ ...form, maxDiscount: Number(e.target.value) })}
                    className="input"
                    min={0}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.validFrom')}</label>
                  <input
                    type="date"
                    value={form.validFrom}
                    onChange={e => setForm({ ...form, validFrom: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.validUntil')}</label>
                  <input
                    type="date"
                    value={form.validUntil}
                    onChange={e => setForm({ ...form, validUntil: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.usageLimit')}</label>
                <input
                  type="number"
                  value={form.usageLimit}
                  onChange={e => setForm({ ...form, usageLimit: Number(e.target.value) })}
                  className="input"
                  min={0}
                  placeholder={t('marketing.usageLimitPlaceholder')}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" disabled={!form.code || !form.validFrom || !form.validUntil || createMutation.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {createMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                  {t('common.save')}
                </button>
                <button type="button" onClick={closeModal} className="btn-secondary">{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEdit && editingCoupon && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto pointer-events-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t('marketing.editCoupon')}</h3>
              <button onClick={closeModal} className="p-1 rounded-lg hover:bg-gray-100">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.couponCode')} *</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="input font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.couponType')}</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as any })} className="input">
                  <option value="discount_percent">{t('marketing.couponTypes.discount_percent')}</option>
                  <option value="discount_fixed">{t('marketing.couponTypes.discount_fixed')}</option>
                  <option value="free_product">{t('marketing.couponTypes.free_product')}</option>
                  <option value="free_delivery">{t('marketing.couponTypes.free_delivery')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.couponValue')} *</label>
                <input
                  type="number"
                  value={form.value}
                  onChange={e => setForm({ ...form, value: Number(e.target.value) })}
                  className="input"
                  min={0}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.minOrder')}</label>
                <input
                  type="number"
                  value={form.minOrder}
                  onChange={e => setForm({ ...form, minOrder: Number(e.target.value) })}
                  className="input"
                  min={0}
                />
              </div>
              {form.type === 'discount_percent' && (
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.maxDiscount')}</label>
                  <input
                    type="number"
                    value={form.maxDiscount}
                    onChange={e => setForm({ ...form, maxDiscount: Number(e.target.value) })}
                    className="input"
                    min={0}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.validFrom')}</label>
                  <input
                    type="date"
                    value={form.validFrom}
                    onChange={e => setForm({ ...form, validFrom: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.validUntil')}</label>
                  <input
                    type="date"
                    value={form.validUntil}
                    onChange={e => setForm({ ...form, validUntil: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.usageLimit')}</label>
                <input
                  type="number"
                  value={form.usageLimit}
                  onChange={e => setForm({ ...form, usageLimit: Number(e.target.value) })}
                  className="input"
                  min={0}
                  placeholder={t('marketing.usageLimitPlaceholder')}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" disabled={!form.code || updateMutation.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {updateMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                  {t('common.save')}
                </button>
                <button type="button" onClick={closeModal} className="btn-secondary">{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm pointer-events-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">{t('common.delete')}</h3>
            <p className="text-gray-600 mb-6">{t('marketing.deleteCouponConfirm')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteMutation.mutate(showDelete)}
                disabled={deleteMutation.isPending}
                className="btn-danger flex-1 flex items-center justify-center gap-2"
              >
                {deleteMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                {t('common.delete')}
              </button>
              <button onClick={() => setShowDelete(null)} className="btn-secondary">{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
