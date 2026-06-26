import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2, Plus, Edit2, Trash2, X, Zap, ToggleLeft, ToggleRight } from 'lucide-react'

interface AutomationRule {
  id: string
  name: string
  type: string
  triggerType: 'automatic' | 'manual' | 'scheduled'
  triggerConfig?: any
  actions?: any
  status: string
  lastRunAt?: string
  createdAt: string
}

export function AutomationRulePage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const storeId = user?.storeId || 'default'
  const queryClient = useQueryClient()

  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Fetch automation rules (campaigns with triggerType='automatic' or 'scheduled')
  const { data, isLoading } = useQuery({
    queryKey: ['automation-rules', storeId],
    queryFn: () => marketingApi.automationRules(storeId)
  })

  // Handle different API response structures
  const rawData = data?.data
  let rules: AutomationRule[] = []
  if (Array.isArray(rawData)) {
    rules = rawData
  } else if (rawData?.list && Array.isArray(rawData.list)) {
    rules = rawData.list
  } else if (typeof rawData === 'object' && rawData !== null) {
    // Try to extract array values
    rules = Object.values(rawData).filter(v => Array.isArray(v))[0] || []
  }
  console.log('Automation rules raw:', rawData, 'parsed:', rules)

  const filteredRules = rules.filter(rule => {
    if (filter === 'all') return true
    if (filter === 'active') return rule.status === 'active'
    if (filter === 'inactive') return rule.status === 'inactive'
    return true
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => marketingApi.createAutomationRule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] })
      closeModal()
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => marketingApi.updateAutomationRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] })
      closeModal()
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => marketingApi.deleteAutomationRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] })
    }
  })

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => marketingApi.toggleAutomationRule(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] })
    }
  })

  const closeModal = () => {
    setShowCreate(false)
    setShowEdit(false)
    setEditingRule(null)
  }

  const openEditModal = (rule: AutomationRule) => {
    setEditingRule(rule)
    setShowEdit(true)
  }

  const getTriggerTypeLabel = (type: string) => {
    switch (type) {
      case 'automatic': return t('marketing.automatic')
      case 'manual': return t('marketing.manual')
      case 'scheduled': return t('marketing.scheduled')
      default: return type
    }
  }

  const getTriggerTypeColor = (type: string) => {
    switch (type) {
      case 'automatic': return 'badge-info'
      case 'manual': return 'badge-warning'
      case 'scheduled': return 'badge-success'
      default: return 'badge-gray'
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Zap size={24} className="text-primary" />
          <h1 className="text-xl font-semibold">{t('marketing.automationRules')}</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={20} />
          {t('marketing.addAutomationRule')}
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium ${filter === 'all' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          {t('common.all')}
        </button>
        <button
          onClick={() => setFilter('active')}
          className={`px-4 py-2 rounded-lg font-medium ${filter === 'active' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          {t('common.active')}
        </button>
        <button
          onClick={() => setFilter('inactive')}
          className={`px-4 py-2 rounded-lg font-medium ${filter === 'inactive' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          {t('common.inactive')}
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredRules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Zap size={48} className="mb-4 opacity-50" />
            <p>{t('marketing.noAutomationRules')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRules.map((rule) => (
              <div key={rule.id} className={`p-4 rounded-lg border ${rule.status === 'active' ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => toggleStatusMutation.mutate({ id: rule.id, status: rule.status === 'active' ? 'inactive' : 'active' })}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {rule.status === 'active' ? <ToggleRight size={24} className="text-green-500" /> : <ToggleLeft size={24} />}
                    </button>
                    <div>
                      <div className="font-medium">{rule.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`badge ${getTriggerTypeColor(rule.triggerType)}`}>
                          {getTriggerTypeLabel(rule.triggerType)}
                        </span>
                        {rule.lastRunAt && (
                          <span className="text-sm text-gray-500">
                            {t('marketing.lastRun')}: {new Date(rule.lastRunAt).toLocaleDateString('id-ID')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEditModal(rule)} className="text-gray-500 hover:text-gray-700">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => deleteMutation.mutate(rule.id)} className="text-red-500 hover:text-red-700">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreate || showEdit) && (
        <AutomationRuleFormModal
          rule={editingRule}
          storeId={storeId}
          onClose={closeModal}
          onSubmit={editingRule ? updateMutation : createMutation}
          isPending={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  )
}

// Separate form component for cleaner code
function AutomationRuleFormModal({ rule, storeId, onClose, onSubmit, isPending }: {
  rule: AutomationRule | null
  storeId: string
  onClose: () => void
  onSubmit: any
  isPending: boolean
}) {
  const { t: tk } = useTranslation()
  const [form, setForm] = useState({
    name: rule?.name || '',
    type: rule?.type || 'welcome',
    triggerType: rule?.triggerType || 'automatic',
    startDate: rule?.createdAt ? new Date(rule.createdAt).toISOString().split('T')[0] : '',
    endDate: '',
    status: rule?.status || 'active',
    couponId: '',
    messageTemplateId: '',
    channelType: 'sms'
  })

  // Fetch coupons for selection
  const { data: couponsData } = useQuery({
    queryKey: ['coupons', storeId],
    queryFn: () => marketingApi.coupons(storeId)
  })
  const coupons = couponsData?.data?.data?.list || []

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const actions = {
      couponId: form.couponId || undefined,
      messageTemplateId: form.messageTemplateId || undefined,
      channelType: form.channelType
    }
    const data = {
      storeId,
      name: form.name,
      type: form.type,
      triggerType: form.triggerType,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : new Date().toISOString(),
      endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
      status: form.status,
      actions: JSON.stringify(actions)
    }
    // For create (rule is null), pass just data; for update, pass { id, data }
    if (rule?.id) {
      onSubmit.mutate({ id: rule.id, data })
    } else {
      onSubmit.mutate(data)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{rule ? tk('marketing.editAutomationRule') : tk('marketing.addAutomationRule')}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{tk('marketing.ruleName')} *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{tk('marketing.ruleType')}</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="input"
            >
              <option value="welcome">{tk('marketing.welcomeAutomation')}</option>
              <option value="birthday">{tk('marketing.birthdayAutomation')}</option>
              <option value="reactivation">{tk('marketing.reactivationAutomation')}</option>
              <option value="points_expiring">{tk('marketing.pointsExpiringAutomation')}</option>
              <option value="seasonal">{tk('marketing.seasonalAutomation')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{tk('marketing.triggerType')}</label>
            <select
              value={form.triggerType}
              onChange={(e) => setForm({ ...form, triggerType: e.target.value as 'automatic' | 'manual' | 'scheduled' })}
              className="input"
            >
              <option value="automatic">{tk('marketing.automatic')}</option>
              <option value="manual">{tk('marketing.manual')}</option>
              <option value="scheduled">{tk('marketing.scheduled')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{tk('marketing.linkedCoupon')}</label>
            <select
              value={form.couponId}
              onChange={(e) => setForm({ ...form, couponId: e.target.value })}
              className="input"
            >
              <option value="">-</option>
              {coupons.map((c: any) => (
                <option key={c.id} value={c.id}>{c.code}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">{tk('marketing.startDate')}</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{tk('marketing.endDate')}</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="input"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="submit" disabled={!form.name || isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {isPending && <Loader2 size={16} className="animate-spin" />}
              {tk('common.save')}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">{tk('common.cancel')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}