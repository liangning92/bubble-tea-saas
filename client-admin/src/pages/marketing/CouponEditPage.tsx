import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { ArrowLeft, Loader2 } from 'lucide-react'

export function CouponEditPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const isEdit = !!id

  const [form, setForm] = useState({
    code: '',
    type: 'discount_percent' as const,
    value: 10,
    minOrder: 0,
    maxDiscount: 0,
    validFrom: '',
    validUntil: '',
    usageLimit: 0,
    status: 'active',
    storeId: user?.storeId || ''
  })

  const { data, isLoading } = useQuery({
    queryKey: ['coupon', id],
    queryFn: () => marketingApi.getCoupon(id!),
    enabled: !!id
  })

  useEffect(() => {
    if (data?.data) {
      const c = data.data as any
      setForm({
        code: c.code || '',
        type: c.type || 'discount_percent',
        value: c.value || 10,
        minOrder: c.minOrder || 0,
        maxDiscount: c.maxDiscount || 0,
        validFrom: c.validFrom ? c.validFrom.split('T')[0] : '',
        validUntil: c.validUntil ? c.validUntil.split('T')[0] : '',
        usageLimit: c.usageLimit || 0,
        status: c.status || 'active',
        storeId: c.storeId || user?.storeId || ''
      })
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: (data: any) => {
      if (isEdit) return marketingApi.updateCoupon(id!, data)
      return marketingApi.createCoupon(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      navigate('/marketing/coupons')
    }
  })

  const handleSubmit = () => {
    if (!form.code || !form.value || !form.validFrom || !form.validUntil) return
    // Ensure storeId is set for new coupons
    const dataToSave = isEdit ? form : { ...form, storeId: user?.storeId }
    saveMutation.mutate(dataToSave)
  }

  if (isEdit && isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/marketing/coupons')} className="btn-ghost">
          <ArrowLeft size={20} />
       </button>
        <h1 className="text-2xl font-bold">{isEdit ? t('common.edit') : t('marketing.createCoupon')}</h1>
      </div>

      <div className="card max-w-2xl">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('marketing.couponCode')} *</label>
            <input type="text" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} className="input" placeholder={t('marketing.couponCodePlaceholder')} disabled={isEdit} />
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
            <label className="block text-sm font-medium mb-1">{t('marketing.value')} *</label>
            <input type="number" value={form.value} onChange={e => setForm({ ...form, value: Number(e.target.value) })} className="input" min={0} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('marketing.minOrder')}</label>
            <input type="number" value={form.minOrder} onChange={e => setForm({ ...form, minOrder: Number(e.target.value) })} className="input" min={0} />
          </div>
          {form.type === 'discount_percent' && (
            <div>
              <label className="block text-sm font-medium mb-1">{t('marketing.maxDiscount')}</label>
              <input type="number" value={form.maxDiscount} onChange={e => setForm({ ...form, maxDiscount: Number(e.target.value) })} className="input" min={0} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('marketing.validFrom')} *</label>
              <input type="date" value={form.validFrom} onChange={e => setForm({ ...form, validFrom: e.target.value })} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('marketing.validUntil')} *</label>
              <input type="date" value={form.validUntil} onChange={e => setForm({ ...form, validUntil: e.target.value })} className="input" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('marketing.usageLimit')}</label>
            <input type="number" value={form.usageLimit} onChange={e => setForm({ ...form, usageLimit: Number(e.target.value) })} className="input" min={0} placeholder={t('marketing.usageLimitPlaceholder')} />
          </div>
          {isEdit && (
            <div>
              <label className="block text-sm font-medium mb-1">{t('marketing.status')}</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="input">
                <option value="active">{t('common.active')}</option>
                <option value="expired">{t('common.expired')}</option>
                <option value="cancelled">{t('common.cancelled')}</option>
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={handleSubmit} disabled={!form.code || !form.value || !form.validFrom || !form.validUntil || saveMutation.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {saveMutation.isPending && <Loader2 size={16} className="animate-spin" />}
            {t('common.save')}
          </button>
          <button onClick={() => navigate('/marketing/coupons')} className="btn-secondary">{t('common.cancel')}</button>
        </div>
      </div>
    </div>
  )
}