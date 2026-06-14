import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { attendanceRulesApi } from '../../services/api'
import { Plus, Edit2, Trash2, RefreshCw, Clock } from 'lucide-react'

interface AttendanceRule {
  id: string
  name: string
  workStartTime: string
  workEndTime: string
  gracePeriod: number
  lateDeductionType: string
  lateDeductionFixed?: number
  lateDeductionDailyRate?: number
  absenceDeductionType: string
  absenceDeductionFixed?: number
  absenceDeductionDailyRate?: number
  earlyLeaveDeductionType: string
  earlyLeaveDeductionFixed?: number
  overtimeRate: number
  overtimeMinHours: number
  sickLeaveDeductionType: string
  sickLeaveDeductionFixed?: number
  sickLeaveDeductionDailyRate?: number
  isActive: boolean
  isDefault: boolean
}

export function AttendanceRulesPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [rules, setRules] = useState<AttendanceRule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingRule, setEditingRule] = useState<AttendanceRule | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    workStartTime: '09:00',
    workEndTime: '18:00',
    gracePeriod: '15',
    lateDeductionType: 'none',
    lateDeductionFixed: '',
    overtimeRate: '1.5',
    overtimeMinHours: '1',
    absenceDeductionType: 'none',
    absenceDeductionFixed: '',
    sickLeaveDeductionType: 'none',
    sickLeaveDeductionFixed: '',
    isDefault: false
  })

  const loadRules = async () => {
    setIsLoading(true)
    try {
      const response = await attendanceRulesApi.list()
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

  // 检测时间冲突
  const hasTimeConflict = (newRule: { workStartTime: string; workEndTime: string }) => {
    const newStart = newRule.workStartTime
    const newEnd = newRule.workEndTime

    for (const rule of rules) {
      // 跳过自己（如果是编辑模式）
      if (editingRule && rule.id === editingRule.id) continue

      // 检查时间范围是否重叠
      if (newStart < rule.workEndTime && newEnd > rule.workStartTime) {
        return rule.name
      }
    }
    return null
  }

  const handleOpenModal = (rule?: AttendanceRule) => {
    if (rule) {
      setEditingRule(rule)
      setFormData({
        name: rule.name,
        workStartTime: rule.workStartTime,
        workEndTime: rule.workEndTime,
        gracePeriod: String(rule.gracePeriod),
        lateDeductionType: rule.lateDeductionType,
        lateDeductionFixed: rule.lateDeductionFixed ? String(rule.lateDeductionFixed / 100) : '',
        overtimeRate: String(rule.overtimeRate),
        overtimeMinHours: String(rule.overtimeMinHours),
        absenceDeductionType: rule.absenceDeductionType,
        absenceDeductionFixed: rule.absenceDeductionFixed ? String(rule.absenceDeductionFixed / 100) : '',
        sickLeaveDeductionType: rule.sickLeaveDeductionType,
        sickLeaveDeductionFixed: rule.sickLeaveDeductionFixed ? String(rule.sickLeaveDeductionFixed / 100) : '',
        isDefault: rule.isDefault
      })
    } else {
      setEditingRule(null)
      setFormData({
        name: '',
        workStartTime: '09:00',
        workEndTime: '18:00',
        gracePeriod: '15',
        lateDeductionType: 'none',
        lateDeductionFixed: '',
        overtimeRate: '1.5',
        overtimeMinHours: '1',
        absenceDeductionType: 'none',
        absenceDeductionFixed: '',
        sickLeaveDeductionType: 'none',
        sickLeaveDeductionFixed: '',
        isDefault: false
      })
    }
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formData.name) {
      alert(t('staff.pleaseEnterRuleName'))
      return
    }

    // 检测时间冲突
    const conflictRule = hasTimeConflict({ workStartTime: formData.workStartTime, workEndTime: formData.workEndTime })
    if (conflictRule) {
      alert(t('staff.timeConflictWithRule', { name: conflictRule }))
      return
    }

    try {
      const payload = {
        name: formData.name,
        workStartTime: formData.workStartTime,
        workEndTime: formData.workEndTime,
        gracePeriod: parseInt(formData.gracePeriod) || 15,
        lateDeductionType: formData.lateDeductionType,
        lateDeductionFixed: formData.lateDeductionFixed ? Math.round(parseFloat(formData.lateDeductionFixed) * 100) : undefined,
        overtimeRate: parseFloat(formData.overtimeRate) || 1.5,
        overtimeMinHours: parseInt(formData.overtimeMinHours) || 1,
        absenceDeductionType: formData.absenceDeductionType,
        absenceDeductionFixed: formData.absenceDeductionFixed ? Math.round(parseFloat(formData.absenceDeductionFixed) * 100) : undefined,
        sickLeaveDeductionType: formData.sickLeaveDeductionType,
        sickLeaveDeductionFixed: formData.sickLeaveDeductionFixed ? Math.round(parseFloat(formData.sickLeaveDeductionFixed) * 100) : undefined,
        isDefault: formData.isDefault
      }

      if (editingRule) {
        await attendanceRulesApi.update(editingRule.id, payload)
      } else {
        await attendanceRulesApi.create(payload)
      }
      setShowModal(false)
      loadRules()
    } catch (error) {
      console.error('Failed to save:', error)
      alert(t('staff.failedToSaveRule'))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('staff.deleteThisRule'))) return
    try {
      await attendanceRulesApi.delete(id)
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
          <Clock size={28} className="text-primary" />
          <div />
        </div>
        <div className="flex gap-3">
          <button onClick={loadRules} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => handleOpenModal()} className="btn-primary flex items-center gap-2">
            <Plus size={20} />
            {t('staff.addAttendanceRule')}
          </button>
        </div>
      </div>

      <div className="grid gap-4">
        {rules.map(rule => (
          <div key={rule.id} className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg">{rule.name}</h3>
                  {rule.isDefault && (
                    <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">{t('staff.default')}</span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {rule.workStartTime} - {rule.workEndTime} ({t('staff.gracePeriod')}: {rule.gracePeriod}min)
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

            <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
              <div className="p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-500 block">{t('staff.lateDeduction')}</span>
                <span className="font-medium">
                  {rule.lateDeductionType === 'none' ? 'No deduction' :
                   rule.lateDeductionType === 'fixed' ? formatCurrency(rule.lateDeductionFixed || 0) + ' /time' :
                   'Daily rate'}
                </span>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-500 block">{t('staff.absenceDeduction')}</span>
                <span className="font-medium">
                  {rule.absenceDeductionType === 'none' ? 'No deduction' :
                   rule.absenceDeductionType === 'fixed' ? formatCurrency(rule.absenceDeductionFixed || 0) :
                   'Daily rate'}
                </span>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-500 block">{t('staff.sickLeaveDeduction')}</span>
                <span className="font-medium">
                  {rule.sickLeaveDeductionType === 'none' ? 'No deduction' :
                   rule.sickLeaveDeductionType === 'fixed' ? formatCurrency(rule.sickLeaveDeductionFixed || 0) :
                   'Daily rate'}
                </span>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-500 block">{t('staff.overtimeRate')}</span>
                <span className="font-medium">{rule.overtimeRate}x</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-500 block">{t('staff.overtimeMinHours')}</span>
                <span className="font-medium">{rule.overtimeMinHours}h</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {rules.length === 0 && !isLoading && (
        <div className="text-center py-12 text-gray-500">
          <Clock size={48} className="mx-auto mb-4 opacity-50" />
          <p>{t('common.noData')}</p>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 my-8" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">
              {editingRule ? t('staff.editAttendanceRule') : t('staff.addAttendanceRule')}
            </h3>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.ruleName')} *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                  placeholder="e.g. Standard Hours"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.workStartTime')}</label>
                  <input
                    type="time"
                    value={formData.workStartTime}
                    onChange={e => setFormData({ ...formData, workStartTime: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.workEndTime')}</label>
                  <input
                    type="time"
                    value={formData.workEndTime}
                    onChange={e => setFormData({ ...formData, workEndTime: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.gracePeriod')} (min)</label>
                <input
                  type="number"
                  value={formData.gracePeriod}
                  onChange={e => setFormData({ ...formData, gracePeriod: e.target.value })}
                  className="input"
                />
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">{t('staff.lateDeduction')}</h4>
                <select
                  value={formData.lateDeductionType}
                  onChange={e => setFormData({ ...formData, lateDeductionType: e.target.value })}
                  className="input mb-2"
                >
                  <option value="none">No deduction</option>
                  <option value="fixed">Fixed Amount</option>
                  <option value="daily_rate">Daily Rate</option>
                </select>
                {formData.lateDeductionType === 'fixed' && (
                  <input
                    type="number"
                    value={formData.lateDeductionFixed}
                    onChange={e => setFormData({ ...formData, lateDeductionFixed: e.target.value })}
                    className="input"
                    placeholder="Deduction per late (Rp)"
                  />
                )}
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">{t('staff.absenceDeduction')}</h4>
                <select
                  value={formData.absenceDeductionType}
                  onChange={e => setFormData({ ...formData, absenceDeductionType: e.target.value })}
                  className="input mb-2"
                >
                  <option value="none">No deduction</option>
                  <option value="fixed">Fixed Amount</option>
                  <option value="daily_rate">Daily Rate</option>
                </select>
                {formData.absenceDeductionType === 'fixed' && (
                  <input
                    type="number"
                    value={formData.absenceDeductionFixed}
                    onChange={e => setFormData({ ...formData, absenceDeductionFixed: e.target.value })}
                    className="input"
                    placeholder="Deduction per absence (Rp)"
                  />
                )}
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">{t('staff.sickLeaveDeduction')}</h4>
                <select
                  value={formData.sickLeaveDeductionType}
                  onChange={e => setFormData({ ...formData, sickLeaveDeductionType: e.target.value })}
                  className="input mb-2"
                >
                  <option value="none">No deduction</option>
                  <option value="fixed">Fixed Amount</option>
                  <option value="daily_rate">Daily Rate</option>
                </select>
                {formData.sickLeaveDeductionType === 'fixed' && (
                  <input
                    type="number"
                    value={formData.sickLeaveDeductionFixed}
                    onChange={e => setFormData({ ...formData, sickLeaveDeductionFixed: e.target.value })}
                    className="input"
                    placeholder="Deduction per sick day (Rp)"
                  />
                )}
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">{t('staff.overtimeSettings')}</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">{t('staff.overtimeRate')}</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.overtimeRate}
                      onChange={e => setFormData({ ...formData, overtimeRate: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">{t('staff.overtimeMinHours')}</label>
                    <input
                      type="number"
                      value={formData.overtimeMinHours}
                      onChange={e => setFormData({ ...formData, overtimeMinHours: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={formData.isDefault}
                  onChange={e => setFormData({ ...formData, isDefault: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="isDefault" className="text-sm">{t('staff.setAsDefault')}</label>
              </div>

              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2 border border-gray-200 rounded-lg">
                  {t('common.cancel')}
                </button>
                <button onClick={handleSave} className="flex-1 py-2 bg-primary text-white rounded-lg">
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