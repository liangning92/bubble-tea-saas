import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { depositApi } from '../../services/api'
import { Plus, Edit2, Trash2, RefreshCw, Wallet } from 'lucide-react'

interface DepositRule {
  id: string
  name: string
  depositAmount: number
  deductionType: string
  monthlyAmount?: number
  maxDeductions?: number
  refundType: string
  prorataPercent?: number
  isActive: boolean
}

const DEDUCTION_TYPE_LABELS: Record<string, string> = {
  one_time: 'staff.oneTime',
  monthly: 'staff.monthlyInstallment',
  limited: 'staff.limitedInstallments'
}

const REFUND_TYPE_LABELS: Record<string, string> = {
  full: 'staff.fullRefund',
  prorata: 'staff.prorataRefund',
  forfeited: 'staff.forfeited',
  none: 'staff.noRefund'
}

export function DepositRulesPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [rules, setRules] = useState<DepositRule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingRule, setEditingRule] = useState<DepositRule | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    depositAmount: '',
    deductionType: 'monthly',
    monthlyAmount: '',
    maxDeductions: '',
    refundType: 'full',
    prorataPercent: ''
  })

  const loadRules = async () => {
    setIsLoading(true)
    try {
      const response = await depositApi.rules()
      setRules(response.data?.data || [])
    } catch (error) {
      console.error('Failed to load rules:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadRules()
  }, [user])

  const handleOpenModal = (rule?: DepositRule) => {
    if (rule) {
      setEditingRule(rule)
      setFormData({
        name: rule.name,
        depositAmount: String(rule.depositAmount / 100),
        deductionType: rule.deductionType,
        monthlyAmount: rule.monthlyAmount ? String(rule.monthlyAmount / 100) : '',
        maxDeductions: rule.maxDeductions ? String(rule.maxDeductions) : '',
        refundType: rule.refundType,
        prorataPercent: rule.prorataPercent ? String(rule.prorataPercent > 1 ? rule.prorataPercent : rule.prorataPercent * 100) : ''
      })
    } else {
      setEditingRule(null)
      setFormData({
        name: '',
        depositAmount: '',
        deductionType: 'monthly',
        monthlyAmount: '',
        maxDeductions: '',
        refundType: 'full',
        prorataPercent: ''
      })
    }
    setSaveError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (saving) return
    setSaveError('')
    if (!formData.name || !formData.depositAmount) {
      setSaveError(t('staff.pleaseFillRequiredFields'))
      return
    }

    if (Number(formData.depositAmount) <= 0 || (formData.deductionType !== 'one_time' && Number(formData.monthlyAmount) <= 0) || (formData.deductionType === 'limited' && Number(formData.maxDeductions) <= 0) || (formData.refundType === 'prorata' && (formData.prorataPercent === '' || Number(formData.prorataPercent) < 0 || Number(formData.prorataPercent) > 100))) {
      setSaveError(t('staff.pleaseFillRequiredFields'))
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: formData.name,
        depositAmount: Math.round(parseFloat(formData.depositAmount) * 100),
        deductionType: formData.deductionType,
        monthlyAmount: formData.monthlyAmount ? Math.round(parseFloat(formData.monthlyAmount) * 100) : undefined,
        maxDeductions: formData.maxDeductions ? parseInt(formData.maxDeductions) : undefined,
        refundType: formData.refundType,
        prorataPercent: formData.prorataPercent ? parseFloat(formData.prorataPercent) / 100 : undefined
      }

      if (editingRule) {
        await depositApi.updateRule(editingRule.id, payload)
      } else {
        await depositApi.createRule(payload)
      }
      setShowModal(false)
      loadRules()
    } catch (error: any) {
      setSaveError(error?.response?.data?.errors?.map((item: any) => item.message).join('; ') || error?.response?.data?.message || t('staff.failedToSaveDepositRule'))
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('staff.deleteThisDepositRule'))) return
    try {
      await depositApi.deleteRule(id)
      loadRules()
    } catch (error) {
      console.error('Failed to delete:', error)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount / 100)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Wallet size={28} className="text-primary" />
          <div />
        </div>
        <div className="flex gap-3">
          <button onClick={loadRules} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => handleOpenModal()} className="btn-primary flex items-center gap-2">
            <Plus size={20} />
            {t('staff.addDepositRule')}
          </button>
        </div>
      </div>

      <div className="grid gap-4">
        {rules.map(rule => (
          <div key={rule.id} className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-lg">{rule.name}</h3>
                <p className="text-2xl font-bold text-primary mt-1">
                  {formatCurrency(rule.depositAmount)}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleOpenModal(rule)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <Edit2 size={18} />
                </button>
                <button onClick={() => handleDelete(rule.id)} className="p-2 hover:bg-red-50 text-red-500 rounded-lg">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">{t('staff.deductionType')}:</span>
                <span className="ml-2 font-medium">{t(DEDUCTION_TYPE_LABELS[rule.deductionType])}</span>
              </div>
              {rule.monthlyAmount && (
                <div>
                  <span className="text-gray-500">{t('staff.monthlyAmount')}:</span>
                  <span className="ml-2 font-medium">{formatCurrency(rule.monthlyAmount)}</span>
                </div>
              )}
              {rule.maxDeductions && (
                <div>
                  <span className="text-gray-500">{t('staff.maxDeductions')}:</span>
                  <span className="ml-2 font-medium">{rule.maxDeductions}x</span>
                </div>
              )}
              <div>
                <span className="text-gray-500">{t('staff.refundType')}:</span>
                <span className="ml-2 font-medium">{t(REFUND_TYPE_LABELS[rule.refundType])}</span>
              </div>
              {rule.prorataPercent && (
                <div>
                  <span className="text-gray-500">{t('staff.prorataPercent')}:</span>
                  <span className="ml-2 font-medium">{rule.prorataPercent > 1 ? rule.prorataPercent : rule.prorataPercent * 100}%</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {rules.length === 0 && !isLoading && (
        <div className="text-center py-12 text-gray-500">
          <Wallet size={48} className="mx-auto mb-4 opacity-50" />
          <p>{t('common.noData')}</p>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">
              {editingRule ? t('staff.editDepositRule') : t('staff.addDepositRule')}
            </h3>

            <div className="space-y-4">
              {saveError && <p role="alert" className="text-red-600">{saveError}</p>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.ruleName')} *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                  placeholder={t('staff.depositRuleNamePlaceholder')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.depositAmount')} (Rp) *</label>
                <input
                  type="number"
                  value={formData.depositAmount}
                  onChange={e => setFormData({ ...formData, depositAmount: e.target.value })}
                  className="input"
                  placeholder="500000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.deductionType')} *</label>
                <select
                  value={formData.deductionType}
                  onChange={e => setFormData({ ...formData, deductionType: e.target.value })}
                  className="input"
                >
                  <option value="one_time">{t('staff.oneTime')}</option>
                  <option value="monthly">{t('staff.monthlyInstallment')}</option>
                  <option value="limited">{t('staff.limitedInstallments')}</option>
                </select>
              </div>

              {(formData.deductionType === 'monthly' || formData.deductionType === 'limited') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.monthlyAmount')} (Rp)</label>
                  <input
                    type="number"
                    value={formData.monthlyAmount}
                    onChange={e => setFormData({ ...formData, monthlyAmount: e.target.value })}
                    className="input"
                    placeholder="100000"
                  />
                </div>
              )}

              {formData.deductionType === 'limited' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.maxDeductions')}</label>
                  <input
                    type="number"
                    value={formData.maxDeductions}
                    onChange={e => setFormData({ ...formData, maxDeductions: e.target.value })}
                    className="input"
                    placeholder="6"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.refundType')} *</label>
                <select
                  value={formData.refundType}
                  onChange={e => setFormData({ ...formData, refundType: e.target.value })}
                  className="input"
                >
                  <option value="full">{t('staff.fullRefund')}</option>
                  <option value="prorata">{t('staff.prorataRefund')}</option>
                  <option value="forfeited">{t('staff.forfeited')}</option>
                  <option value="none">{t('staff.noRefund')}</option>
                </select>
              </div>

              {formData.refundType === 'prorata' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.prorataPercent')} (%)</label>
                  <input
                    type="number"
                    value={formData.prorataPercent}
                    onChange={e => setFormData({ ...formData, prorataPercent: e.target.value })}
                    className="input"
                    placeholder="80"
                    max="100"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2 border border-gray-200 rounded-lg">
                  {t('common.cancel')}
                </button>
                <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-primary text-white rounded-lg">
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}