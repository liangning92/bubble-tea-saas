import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2, Plus, Edit2, Trash2, X, Layers } from 'lucide-react'

interface StackingRule {
  id: string
  name: string
  ruleType: 'stackable' | 'exclusive' | 'replace'
  couponTypeA?: string
  couponTypeB?: string
  priority: number
  note?: string
  status: string
  createdAt: string
}

const defaultForm = {
  name: '',
  ruleType: 'exclusive' as 'stackable' | 'exclusive' | 'replace',
  couponTypeA: '',
  couponTypeB: '',
  priority: 0,
  note: '',
  status: 'active'
}

const ruleTypes = [
  { value: 'stackable', label: '可叠加', desc: '两种优惠券可以同时使用' },
  { value: 'exclusive', label: '互斥', desc: '两种优惠券不能同时使用' },
  { value: 'replace', label: '替换', desc: '使用B券时自动替换A券' }
]

const couponTypes = [
  { value: 'discount_percent', label: '百分比折扣' },
  { value: 'discount_fixed', label: '固定金额折扣' },
  { value: 'free_product', label: '赠品' },
  { value: 'free_delivery', label: '免配送费' }
]

export function StackingRulePage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const storeId = user?.storeId || 'default'
  const queryClient = useQueryClient()

  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editingRule, setEditingRule] = useState<StackingRule | null>(null)
  const [form, setForm] = useState(defaultForm)

  // Fetch stacking rules
  const { data, isLoading } = useQuery({
    queryKey: ['stacking-rules', storeId],
    queryFn: () => marketingApi.stackingRules(storeId)
  })

  const rules: StackingRule[] = data?.data?.data || []

  const createMutation = useMutation({
    mutationFn: (data: any) => marketingApi.createStackingRule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stacking-rules'] })
      closeModal()
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => marketingApi.updateStackingRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stacking-rules'] })
      closeModal()
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => marketingApi.deleteStackingRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stacking-rules'] })
    }
  })

  const closeModal = () => {
    setShowCreate(false)
    setShowEdit(false)
    setEditingRule(null)
    setForm(defaultForm)
  }

  const openEditModal = (rule: StackingRule) => {
    setEditingRule(rule)
    setForm({
      name: rule.name,
      ruleType: rule.ruleType as 'stackable' | 'exclusive' | 'replace',
      couponTypeA: rule.couponTypeA || '',
      couponTypeB: rule.couponTypeB || '',
      priority: rule.priority,
      note: rule.note || '',
      status: rule.status
    })
    setShowEdit(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      ...form,
      storeId,
      couponTypeA: form.couponTypeA || null,
      couponTypeB: form.couponTypeB || null
    }
    if (showEdit && editingRule) {
      updateMutation.mutate({ id: editingRule.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const getRuleTypeLabel = (type: string) => {
    return ruleTypes.find(r => r.value === type)?.label || type
  }

  const getRuleTypeDesc = (type: string) => {
    return ruleTypes.find(r => r.value === type)?.desc || ''
  }

  const getRuleTypeColor = (type: string) => {
    switch (type) {
      case 'stackable': return 'badge-success'
      case 'exclusive': return 'badge-danger'
      case 'replace': return 'badge-warning'
      default: return 'badge-gray'
    }
  }

  const getCouponTypeLabel = (type: string) => {
    return couponTypes.find(c => c.value === type)?.label || type
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Layers size={24} className="text-primary" />
          <h1 className="text-xl font-semibold">{t('marketing.stackingRules')}</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={20} />
          {t('marketing.addStackingRule')}
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Layers size={48} className="mb-4 opacity-50" />
            <p>{t('marketing.noStackingRules')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">{t('marketing.ruleName')}</th>
                  <th className="pb-3 font-medium">{t('marketing.ruleType')}</th>
                  <th className="pb-3 font-medium">{t('marketing.couponCombination')}</th>
                  <th className="pb-3 font-medium">{t('marketing.priority')}</th>
                  <th className="pb-3 font-medium">{t('common.status')}</th>
                  <th className="pb-3 font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3">
                      <div className="font-medium">{rule.name}</div>
                      {rule.note && <div className="text-sm text-gray-500">{rule.note}</div>}
                    </td>
                    <td className="py-3">
                      <span className={`badge ${getRuleTypeColor(rule.ruleType)}`}>
                        {getRuleTypeLabel(rule.ruleType)}
                      </span>
                      <div className="text-sm text-gray-500 mt-1">{getRuleTypeDesc(rule.ruleType)}</div>
                    </td>
                    <td className="py-3">
                      {rule.couponTypeA && rule.couponTypeB ? (
                        <div className="flex items-center gap-2">
                          <span className="badge badge-gray">{getCouponTypeLabel(rule.couponTypeA)}</span>
                          <span className="text-gray-400">+</span>
                          <span className="badge badge-gray">{getCouponTypeLabel(rule.couponTypeB)}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3">
                      <span className="text-gray-600">{rule.priority}</span>
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
              <h3 className="text-lg font-semibold">{t('marketing.addStackingRule')}</h3>
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
                  placeholder={t('marketing.stackingRuleNamePlaceholder')}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.ruleType')} *</label>
                <select
                  value={form.ruleType}
                  onChange={(e) => setForm({ ...form, ruleType: e.target.value as any })}
                  className="input"
                >
                  {ruleTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label} - {type.desc}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.couponTypeA')}</label>
                  <select
                    value={form.couponTypeA}
                    onChange={(e) => setForm({ ...form, couponTypeA: e.target.value })}
                    className="input"
                  >
                    <option value="">-</option>
                    {couponTypes.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.couponTypeB')}</label>
                  <select
                    value={form.couponTypeB}
                    onChange={(e) => setForm({ ...form, couponTypeB: e.target.value })}
                    className="input"
                  >
                    <option value="">-</option>
                    {couponTypes.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
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

              <div>
                <label className="block text-sm font-medium mb-1">{t('common.note')}</label>
                <input
                  type="text"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="input"
                  placeholder={t('marketing.stackingRuleNotePlaceholder')}
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
              <h3 className="text-lg font-semibold">{t('marketing.editStackingRule')}</h3>
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

              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.ruleType')} *</label>
                <select
                  value={form.ruleType}
                  onChange={(e) => setForm({ ...form, ruleType: e.target.value as any })}
                  className="input"
                >
                  {ruleTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label} - {type.desc}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.couponTypeA')}</label>
                  <select
                    value={form.couponTypeA}
                    onChange={(e) => setForm({ ...form, couponTypeA: e.target.value })}
                    className="input"
                  >
                    <option value="">-</option>
                    {couponTypes.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('marketing.couponTypeB')}</label>
                  <select
                    value={form.couponTypeB}
                    onChange={(e) => setForm({ ...form, couponTypeB: e.target.value })}
                    className="input"
                  >
                    <option value="">-</option>
                    {couponTypes.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
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

              <div>
                <label className="block text-sm font-medium mb-1">{t('common.note')}</label>
                <input
                  type="text"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
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