import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2, Plus, Edit2, Trash2, X, Percent, Banknote, Tag, Sparkles, Gift } from 'lucide-react'

type DiscountRuleType = 'fixed' | 'percent' | 'second_half' | 'bogo'

interface DiscountRule {
  id: string
  name: string
  minOrderAmount: number
  discountValue: number
  discountType: DiscountRuleType
  maxDiscount?: number
  applicableChannels?: string[]
  validFrom?: string
  validUntil?: string
  priority: number
  status: string
  createdAt: string
}

const AVAILABLE_CHANNELS = [
  { code: 'DINE_IN', name: '堂食 (Dine In)', icon: '🍵' },
  { code: 'GOFOOD', name: 'GoFood', icon: '🟢' },
  { code: 'GRAB', name: 'GrabFood', icon: '🟡' },
  { code: 'SHOPEE', name: 'ShopeeFood', icon: '🟠' }
]

const defaultForm = {
  name: '',
  minOrderAmount: 50000,
  discountValue: 5000,
  discountType: 'fixed' as DiscountRuleType,
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

  const rules: DiscountRule[] = data?.data || []

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
      discountType: rule.discountType || 'fixed',
      maxDiscount: rule.maxDiscount || 0,
      applicableChannels: rule.applicableChannels || [],
      validFrom: rule.validFrom ? rule.validFrom.split('T')[0] : '',
      validUntil: rule.validUntil ? rule.validUntil.split('T')[0] : '',
      priority: rule.priority,
      status: rule.status
    })
    setShowEdit(true)
  }

  const handleTypeChange = (newType: DiscountRuleType) => {
    setForm(prev => {
      let minOrderAmount = prev.minOrderAmount
      let discountValue = prev.discountValue

      if (newType === 'second_half') {
        discountValue = 50
        if (minOrderAmount > 50) minOrderAmount = 2
      } else if (newType === 'bogo') {
        discountValue = 100
        if (minOrderAmount > 50) minOrderAmount = 2
      } else if (newType === 'percent') {
        if (minOrderAmount <= 10) minOrderAmount = 50000
        if (discountValue > 100 || discountValue <= 0) discountValue = 10
      } else {
        if (minOrderAmount <= 10) minOrderAmount = 50000
        if (discountValue <= 100) discountValue = 5000
      }

      return {
        ...prev,
        discountType: newType,
        minOrderAmount,
        discountValue
      }
    })
  }

  const toggleChannel = (code: string) => {
    setForm(prev => {
      const exists = prev.applicableChannels.includes(code)
      const next = exists
        ? prev.applicableChannels.filter(c => c !== code)
        : [...prev.applicableChannels, code]
      return { ...prev, applicableChannels: next }
    })
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
    if (rule.discountType === 'second_half') {
      return t('marketing.secondHalf')
    }
    if (rule.discountType === 'bogo') {
      return t('marketing.bogo')
    }
    return formatCurrency(rule.discountValue)
  }

  const isCupRule = (type: DiscountRuleType) => type === 'second_half' || type === 'bogo'

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
                  <th className="pb-3 font-medium">{t('marketing.applicableChannels')}</th>
                  <th className="pb-3 font-medium">{t('marketing.validity')}</th>
                  <th className="pb-3 font-medium">{t('common.status')}</th>
                  <th className="pb-3 font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3">
                      <div className="font-medium text-gray-900">{rule.name}</div>
                      <div className="text-xs text-gray-400">Priority: {rule.priority}</div>
                    </td>
                    <td className="py-3">
                      <span className="text-gray-700 text-sm">
                        {isCupRule(rule.discountType)
                          ? `${t('marketing.minCups')}: ${rule.minOrderAmount || 2} ${t('marketing.cups')}`
                          : `${t('marketing.minOrderAmount')}: ${formatCurrency(rule.minOrderAmount)}`}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        rule.discountType === 'bogo'
                          ? 'bg-purple-100 text-purple-700'
                          : rule.discountType === 'second_half'
                          ? 'bg-emerald-100 text-emerald-700'
                          : rule.discountType === 'percent'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {rule.discountType === 'bogo' ? <Gift size={13} /> :
                         rule.discountType === 'second_half' ? <Sparkles size={13} /> :
                         rule.discountType === 'percent' ? <Percent size={13} /> : <Banknote size={13} />}
                        {getDiscountDisplay(rule)}
                        {rule.maxDiscount ? ` (Max: ${formatCurrency(rule.maxDiscount)})` : ''}
                      </span>
                    </td>
                    <td className="py-3 text-xs">
                      {rule.applicableChannels && rule.applicableChannels.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {rule.applicableChannels.map(c => (
                            <span key={c} className="px-2 py-0.5 bg-gray-100 rounded text-gray-700 font-medium">
                              {c}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">{t('marketing.allChannels')}</span>
                      )}
                    </td>
                    <td className="py-3 text-xs text-gray-600">
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
                        <button onClick={() => openEditModal(rule)} className="text-gray-500 hover:text-gray-700 p-1 hover:bg-gray-100 rounded">
                          <Edit2 size={15} />
                        </button>
                        <button onClick={() => deleteMutation.mutate(rule.id)} className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded">
                          <Trash2 size={15} />
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

      {/* Form Modal (Create or Edit) */}
      {(showCreate || (showEdit && editingRule)) && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[92vh] overflow-y-auto pointer-events-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {showEdit ? t('marketing.editDiscountRule') : t('marketing.addDiscountRule')}
              </h3>
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

              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.discountType')}</label>
                <select
                  value={form.discountType}
                  onChange={(e) => handleTypeChange(e.target.value as DiscountRuleType)}
                  className="input"
                >
                  <option value="fixed">{t('marketing.fixedAmount')}</option>
                  <option value="percent">{t('marketing.percentOff')}</option>
                  <option value="second_half">{t('marketing.secondHalf')}</option>
                  <option value="bogo">{t('marketing.bogo')}</option>
                </select>
              </div>

              {/* Dynamic condition & discount inputs based on type */}
              {isCupRule(form.discountType) ? (
                <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800 text-xs font-semibold">
                    <Sparkles size={16} />
                    <span>
                      {form.discountType === 'second_half'
                        ? '第二杯半价规则说明'
                        : '买一送一规则说明'}
                    </span>
                  </div>
                  <p className="text-xs text-emerald-700 leading-relaxed">
                    {form.discountType === 'second_half'
                      ? '系统自动按单品基础价由高到低配对，每满2杯立减第2杯（等价或低价杯）50%基础金额。加料（toppings）不打折，保障门店利润并防止飞单。'
                      : '系统自动按单品基础价由高到低配对，每满2杯第2杯（等价或低价杯）基础金额全免。加料不免单，保障毛利安全。'}
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-emerald-900 mb-1">
                      {t('marketing.minCups')} (默认2杯触发) *
                    </label>
                    <input
                      type="number"
                      value={form.minOrderAmount}
                      onChange={(e) => setForm({ ...form, minOrderAmount: Number(e.target.value) })}
                      className="input bg-white"
                      min="2"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-emerald-900 mb-1">
                      {t('marketing.maxDiscount')} (印尼盾，0为不设限)
                    </label>
                    <input
                      type="number"
                      value={form.maxDiscount}
                      onChange={(e) => setForm({ ...form, maxDiscount: Number(e.target.value) })}
                      className="input bg-white"
                      min="0"
                      placeholder="0"
                    />
                  </div>
                </div>
              ) : (
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
                    <label className="block text-sm font-medium mb-1">
                      {form.discountType === 'percent' ? t('marketing.percentOff') : t('marketing.discountAmount')} *
                    </label>
                    <input
                      type="number"
                      value={form.discountValue}
                      onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
                      className="input"
                      min="1"
                      max={form.discountType === 'percent' ? 100 : undefined}
                      required
                    />
                  </div>
                </div>
              )}

              {form.discountType === 'percent' && (
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.maxDiscount')} (0为不限制)</label>
                  <input
                    type="number"
                    value={form.maxDiscount}
                    onChange={(e) => setForm({ ...form, maxDiscount: Number(e.target.value) })}
                    className="input"
                    min="0"
                  />
                </div>
              )}

              {/* Applicable Channels */}
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('marketing.applicableChannels')}</label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_CHANNELS.map(ch => {
                    const checked = form.applicableChannels.includes(ch.code)
                    return (
                      <button
                        key={ch.code}
                        type="button"
                        onClick={() => toggleChannel(ch.code)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                          checked
                            ? 'bg-primary/10 border-primary text-primary font-bold'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <span>{ch.icon}</span>
                        <span>{ch.name}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {form.applicableChannels.length === 0
                    ? t('marketing.allChannels')
                    : `已选 ${form.applicableChannels.length} 个渠道生效`}
                </p>
              </div>

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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.priority')}</label>
                  <input
                    type="number"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                    className="input"
                    placeholder="0"
                  />
                  <p className="text-[11px] text-gray-400 mt-0.5">数字越大越优先触发</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('common.status')}</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="input"
                  >
                    <option value="active">{t('common.active')}</option>
                    <option value="inactive">{t('common.inactive')}</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="submit"
                  disabled={!form.name || createMutation.isPending || updateMutation.isPending}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 size={16} className="animate-spin" />
                  )}
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
    </div>
  )
}