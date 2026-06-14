import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2, Plus, Edit2, Trash2, X, Percent, Banknote, Tag } from 'lucide-react'

interface DiscountRule {
  id: string
  name: string
  minOrderAmount: number
  discountValue: number
  discountType: 'fixed' | 'percent'
  maxDiscount?: number
  applicableChannels?: string[]
  validFrom?: string
  validUntil?: string
  priority: number
  status: string
  createdAt: string
}

const defaultForm = {
  name: '',
  minOrderAmount: 50000,
  discountValue: 5000,
  discountType: 'fixed' as 'fixed' | 'percent',
  maxDiscount: 0,
  applicableChannels: [] as string[],
  validFrom: '',
  validUntil: '',
  priority: 0,
  status: 'active'
}

export function DiscountRulePage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const storeId = user?.storeId || 'default'
  const queryClient = useQueryClient()

  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editingRule, setEditingRule] = useState<DiscountRule | null>(null)
  const [form, setForm] = useState(defaultForm)

  // Fetch discount rules
  const { data, isLoading } = useQuery({
    queryKey: ['discount-rules', storeId],
    queryFn: () => marketingApi.discountRules(storeId)
  })

  const rules: DiscountRule[] = data?.data?.data || []

  const createMutation = useMutation({
    mutationFn: (data: any) => marketingApi.createDiscountRule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discount-rules'] })
      closeModal()
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => marketingApi.updateDiscountRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discount-rules'] })
      closeModal()
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => marketingApi.deleteDiscountRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discount-rules'] })
    }
  })

  const closeModal = () => {
    setShowCreate(false)
    setShowEdit(false)
    setEditingRule(null)
    setForm(defaultForm)
  }

  const openEditModal = (rule: DiscountRule) => {
    setEditingRule(rule)
    setForm({
      name: rule.name,
      minOrderAmount: rule.minOrderAmount,
      discountValue: rule.discountValue,
      discountType: rule.discountType as 'fixed' | 'percent',
      maxDiscount: rule.maxDiscount || 0,
      applicableChannels: rule.applicableChannels || [],
      validFrom: rule.validFrom ? rule.validFrom.split('T')[0] : '',
      validUntil: rule.validUntil ? rule.validUntil.split('T')[0] : '',
      priority: rule.priority,
      status: rule.status
    })
    setShowEdit(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      ...form,
      storeId,
      validFrom: form.validFrom ? new Date(form.validFrom).toISOString() : null,
      validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : null
    }
    if (showEdit && editingRule) {
      updateMutation.mutate({ id: editingRule.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const formatCurrency = (value: number) => `Rp ${value.toLocaleString('id-ID')}`

  const getDiscountDisplay = (rule: DiscountRule) => {
    if (rule.discountType === 'percent') {
      return `${rule.discountValue}%`
    }
    return formatCurrency(rule.discountValue)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Tag size={24} className="text-primary" />
          <h1 className="text-xl font-semibold">{t('marketing.discountRules')}</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={20} />
          {t('marketing.addDiscountRule')}
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Tag size={48} className="mb-4 opacity-50" />
            <p>{t('marketing.noDiscountRules')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">{t('marketing.ruleName')}</th>
                  <th className="pb-3 font-medium">{t('marketing.condition')}</th>
                  <th className="pb-3 font-medium">{t('marketing.discount')}</th>
                  <th className="pb-3 font-medium">{t('marketing.validity')}</th>
                  <th className="pb-3 font-medium">{t('common.status')}</th>
                  <th className="pb-3 font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3">
                      <div className="font-medium">{rule.name}</div>
                      <div className="text-sm text-gray-500">Priority: {rule.priority}</div>
                    </td>
                    <td className="py-3">
                      <span className="text-gray-600">
                        {t('marketing.minOrder')}: {formatCurrency(rule.minOrderAmount)}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`badge ${rule.discountType === 'percent' ? 'badge-warning' : 'badge-info'}`}>
                        {rule.discountType === 'percent' ? <Percent size={14} /> : <Banknote size={14} />}
                        {getDiscountDisplay(rule)}
                        {rule.maxDiscount ? ` (Max: ${formatCurrency(rule.maxDiscount)})` : ''}
                      </span>
                    </td>
                    <td className="py-3 text-sm text-gray-600">
                      {rule.validFrom && rule.validUntil
                        ? `${new Date(rule.validFrom).toLocaleDateString('id-ID')} - ${new Date(rule.validUntil).toLocaleDateString('id-ID')}`
                        : rule.validFrom
                          ? `${new Date(rule.validFrom).toLocaleDateString('id-ID')} - ...`
                          : '-'}
                    </td>
                    <td className="py-3">
                      <span className={`badge ${rule.status === 'active' ? 'badge-success' : 'badge-gray'}`}>
                        {t(`common.${rule.status === 'active' ? 'active' : 'inactive'}`)}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEditModal(rule)} className="text-gray-500 hover:text-gray-700">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => deleteMutation.mutate(rule.id)} className="text-red-500 hover:text-red-700">
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t('marketing.addDiscountRule')}</h3>
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
                  placeholder={t('marketing.ruleNamePlaceholder')}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.minOrderAmount')} *</label>
                  <input
                    type="number"
                    value={form.minOrderAmount}
                    onChange={(e) => setForm({ ...form, minOrderAmount: Number(e.target.value) })}
                    className="input"
                    min="1000"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.discountAmount')} *</label>
                  <input
                    type="number"
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
                    className="input"
                    min="1"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.discountType')}</label>
                <select
                  value={form.discountType}
                  onChange={(e) => setForm({ ...form, discountType: e.target.value as 'fixed' | 'percent' })}
                  className="input"
                >
                  <option value="fixed">{t('marketing.fixedAmount')}</option>
                  <option value="percent">{t('marketing.percentOff')}</option>
                </select>
              </div>
              {form.discountType === 'percent' && (
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.maxDiscount')}</label>
                  <input
                    type="number"
                    value={form.maxDiscount}
                    onChange={(e) => setForm({ ...form, maxDiscount: Number(e.target.value) })}
                    className="input"
                    min="0"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.validFrom')}</label>
                  <input
                    type="date"
                    value={form.validFrom}
                    onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.validUntil')}</label>
                  <input
                    type="date"
                    value={form.validUntil}
                    onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.priority')}</label>
                <input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                  className="input"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" disabled={!form.name || createMutation.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
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
      {showEdit && editingRule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t('marketing.editDiscountRule')}</h3>
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
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.minOrderAmount')} *</label>
                  <input
                    type="number"
                    value={form.minOrderAmount}
                    onChange={(e) => setForm({ ...form, minOrderAmount: Number(e.target.value) })}
                    className="input"
                    min="1000"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.discountAmount')} *</label>
                  <input
                    type="number"
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
                    className="input"
                    min="1"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.discountType')}</label>
                <select
                  value={form.discountType}
                  onChange={(e) => setForm({ ...form, discountType: e.target.value as 'fixed' | 'percent' })}
                  className="input"
                >
                  <option value="fixed">{t('marketing.fixedAmount')}</option>
                  <option value="percent">{t('marketing.percentOff')}</option>
                </select>
              </div>
              {form.discountType === 'percent' && (
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.maxDiscount')}</label>
                  <input
                    type="number"
                    value={form.maxDiscount}
                    onChange={(e) => setForm({ ...form, maxDiscount: Number(e.target.value) })}
                    className="input"
                    min="0"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.validFrom')}</label>
                  <input
                    type="date"
                    value={form.validFrom}
                    onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.validUntil')}</label>
                  <input
                    type="date"
                    value={form.validUntil}
                    onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.priority')}</label>
                <input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                  className="input"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" disabled={!form.name || updateMutation.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {updateMutation.isPending && <Loader2 size={16} className="animate-spin" />}
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