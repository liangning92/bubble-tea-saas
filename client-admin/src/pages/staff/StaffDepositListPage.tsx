import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { depositApi, staffApi } from '../../services/api'
import { Wallet, Plus, RefreshCw, Search, X, Loader2 } from 'lucide-react'

interface DepositRule {
  id: string
  name: string
  depositAmount: number
  deductionType: string
  monthlyAmount?: number
  maxDeductions?: number
  refundType: string
  prorataPercent?: number
}

interface DeductionLog {
  id: string
  amount: number
  note?: string
  createdAt: string
  salaryId?: string
}

interface RefundLog {
  id: string
  amount: number
  reason: string
  note?: string
  processedBy: string
  createdAt: string
}

interface StaffDeposit {
  id: string
  staffId: string
  staff: { id: string; name: string; employeeNumber: string }
  depositRule: DepositRule
  totalAmount: number
  deductedAmount: number
  refundedAmount: number
  status: string
  startDate: string
  endDate?: string
  deductionCount: number
  deductionLogs: DeductionLog[]
  refundLogs: RefundLog[]
}

interface StaffOption {
  id: string
  name: string
  employeeNumber: string
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  completed: 'Completed',
  refunded: 'Refunded'
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  refunded: 'bg-gray-100 text-gray-700'
}

export function StaffDepositListPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [deposits, setDeposits] = useState<StaffDeposit[]>([])
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [rules, setRules] = useState<DepositRule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    staffId: '',
    depositRuleId: '',
    totalAmount: ''
  })
  const [creating, setCreating] = useState(false)

  // Deduct modal
  const [showDeductModal, setShowDeductModal] = useState(false)
  const [deductingDeposit, setDeductingDeposit] = useState<StaffDeposit | null>(null)
  const [deductForm, setDeductForm] = useState({ amount: '', note: '' })
  const [deducting, setDeducting] = useState(false)

  // Refund modal
  const [showRefundModal, setShowRefundModal] = useState(false)
  const [refundingDeposit, setRefundingDeposit] = useState<StaffDeposit | null>(null)
  const [refundForm, setRefundForm] = useState({ amount: '', reason: 'full', note: '' })
  const [refunding, setRefunding] = useState(false)

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [depositsRes, staffRes, rulesRes] = await Promise.all([
        depositApi.staffDeposits(),
        staffApi.list({ storeId: user?.storeId, pageSize: 100 }),
        depositApi.rules()
      ])
      setDeposits(depositsRes.data?.data || [])
      setStaffOptions(staffRes.data?.data?.list || [])
      setRules(rulesRes.data?.data || [])
    } catch (error) {
      console.error('Failed to load deposits:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount / 100)
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '-'
    return d.toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const filteredDeposits = deposits.filter(deposit => {
    const matchesSearch = !searchTerm ||
      deposit.staff?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      deposit.staff?.employeeNumber?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = !filterStatus || deposit.status === filterStatus
    return matchesSearch && matchesStatus
  })

  const handleOpenCreateModal = () => {
    setCreateForm({ staffId: '', depositRuleId: '', totalAmount: '' })
    setShowCreateModal(true)
  }

  const handleCreateDeposit = async () => {
    if (!createForm.staffId || !createForm.depositRuleId || !createForm.totalAmount) {
      alert(t('common.required'))
      return
    }

    setCreating(true)
    try {
      await depositApi.createStaffDeposit({
        staffId: createForm.staffId,
        depositRuleId: createForm.depositRuleId,
        totalAmount: Math.round(parseFloat(createForm.totalAmount) * 100)
      })
      setShowCreateModal(false)
      loadData()
    } catch (error) {
      console.error('Failed to create deposit:', error)
      alert(t('common.error'))
    } finally {
      setCreating(false)
    }
  }

  const handleOpenDeductModal = (deposit: StaffDeposit) => {
    setDeductingDeposit(deposit)
    setDeductForm({ amount: '', note: '' })
    setShowDeductModal(true)
  }

  const handleDeduct = async () => {
    if (!deductingDeposit || !deductForm.amount) {
      alert(t('common.required'))
      return
    }

    setDeducting(true)
    try {
      await depositApi.recordDeduction({
        staffDepositId: deductingDeposit.id,
        amount: Math.round(parseFloat(deductForm.amount) * 100),
        note: deductForm.note
      })
      setShowDeductModal(false)
      loadData()
    } catch (error) {
      console.error('Failed to record deduction:', error)
      alert(t('common.error'))
    } finally {
      setDeducting(false)
    }
  }

  const handleOpenRefundModal = (deposit: StaffDeposit) => {
    setRefundingDeposit(deposit)
    setRefundForm({ amount: '', reason: 'full', note: '' })
    setShowRefundModal(true)
  }

  const handleRefund = async () => {
    if (!refundingDeposit || !refundForm.amount) {
      alert(t('common.required'))
      return
    }

    setRefunding(true)
    try {
      await depositApi.processRefund({
        staffDepositId: refundingDeposit.id,
        amount: Math.round(parseFloat(refundForm.amount) * 100),
        reason: refundForm.reason,
        note: refundForm.note
      })
      setShowRefundModal(false)
      loadData()
    } catch (error) {
      console.error('Failed to process refund:', error)
      alert(t('common.error'))
    } finally {
      setRefunding(false)
    }
  }

  const getRemainingAmount = (deposit: StaffDeposit) => {
    return deposit.totalAmount - deposit.deductedAmount - deposit.refundedAmount
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Wallet size={28} className="text-primary" />
          <div />
        </div>
        <div className="flex gap-3">
          <button onClick={loadData} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button onClick={handleOpenCreateModal} className="btn-primary flex items-center gap-2">
            <Plus size={20} />
            {t('staff.addStaffDeposit')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={t('staff.searchStaff')}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="p-2 border border-gray-200 rounded-lg"
        >
          <option value="">{t('common.all')} {t('staff.status')}</option>
          <option value="active">{t('staff.active')}</option>
          <option value="completed">{t('staff.completed')}</option>
          <option value="refunded">{t('staff.refunded')}</option>
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-blue-800 text-sm font-medium">{t('staff.activeDeposits')}</p>
          <p className="text-xl font-bold text-blue-900">
            {deposits.filter(d => d.status === 'active').length}
          </p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-green-800 text-sm font-medium">{t('staff.totalCollected')}</p>
          <p className="text-xl font-bold text-green-900">
            {formatCurrency(deposits.reduce((sum, d) => sum + d.deductedAmount, 0))}
          </p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-yellow-800 text-sm font-medium">{t('staff.totalRefunded')}</p>
          <p className="text-xl font-bold text-yellow-900">
            {formatCurrency(deposits.reduce((sum, d) => sum + d.refundedAmount, 0))}
          </p>
        </div>
      </div>

      {/* List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredDeposits.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Wallet size={48} className="mx-auto mb-4 opacity-50" />
            <p>{t('common.noData')}</p>
          </div>
        ) : (
          filteredDeposits.map(deposit => (
            <div key={deposit.id} className="bg-white rounded-xl shadow-sm p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-bold text-lg">{deposit.staff?.name || '-'}</p>
                  <p className="text-sm text-gray-500">{deposit.staff?.employeeNumber || '-'}</p>
                </div>
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[deposit.status]}`}>
                  {STATUS_LABELS[deposit.status] || deposit.status}
                </span>
              </div>

              {/* Deposit Info */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-500 text-sm block">{t('staff.depositRule')}</span>
                  <span className="font-medium">{deposit.depositRule?.name || '-'}</span>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-500 text-sm block">{t('staff.startDate')}</span>
                  <span className="font-medium">{formatDate(deposit.startDate)}</span>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-500 text-sm block">{t('staff.totalAmount')}</span>
                  <span className="font-medium">{formatCurrency(deposit.totalAmount)}</span>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-500 text-sm block">{t('staff.remainingAmount')}</span>
                  <span className="font-medium text-primary">{formatCurrency(getRemainingAmount(deposit))}</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span>{t('staff.deductionProgress')}</span>
                  <span>{formatCurrency(deposit.deductedAmount)} / {formatCurrency(deposit.totalAmount)}</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${(deposit.deductedAmount / deposit.totalAmount) * 100}%` }}
                  />
                </div>
              </div>

              {/* Deduction Logs */}
              {deposit.deductionLogs.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">{t('staff.deductionLogs')}</p>
                  <div className="space-y-1">
                    {deposit.deductionLogs.slice(0, 3).map(log => (
                      <div key={log.id} className="flex justify-between text-sm p-2 bg-red-50 rounded">
                        <span className="text-red-600">-{formatCurrency(log.amount)}</span>
                        <span className="text-gray-500">{formatDate(log.createdAt)}</span>
                      </div>
                    ))}
                    {deposit.deductionLogs.length > 3 && (
                      <p className="text-sm text-gray-500">+{deposit.deductionLogs.length - 3} more</p>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {deposit.status === 'active' && (
                  <>
                    <button
                      onClick={() => handleOpenDeductModal(deposit)}
                      className="flex-1 py-2 text-sm text-primary border border-primary rounded-lg hover:bg-primary/5"
                    >
                      {t('staff.recordDeduction')}
                    </button>
                    <button
                      onClick={() => handleOpenRefundModal(deposit)}
                      className="flex-1 py-2 text-sm text-green-600 border border-green-200 rounded-lg hover:bg-green-50"
                    >
                      {t('staff.processRefund')}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{t('staff.addStaffDeposit')}</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.selectStaff')} *</label>
                <select
                  value={createForm.staffId}
                  onChange={e => setCreateForm({ ...createForm, staffId: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                >
                  <option value="">{t('staff.selectStaff')}</option>
                  {staffOptions.map(staff => (
                    <option key={staff.id} value={staff.id}>{staff.name} ({staff.employeeNumber})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.depositRule')} *</label>
                <select
                  value={createForm.depositRuleId}
                  onChange={e => setCreateForm({ ...createForm, depositRuleId: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                >
                  <option value="">{t('staff.selectRule')}</option>
                  {rules.map(rule => (
                    <option key={rule.id} value={rule.id}>
                      {rule.name} - {formatCurrency(rule.depositAmount)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.totalAmount')} (Rp) *</label>
                <input
                  type="number"
                  value={createForm.totalAmount}
                  onChange={e => setCreateForm({ ...createForm, totalAmount: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder="500000"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleCreateDeposit}
                  disabled={creating}
                  className="flex-1 py-3 bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creating ? <Loader2 size={20} className="animate-spin" /> : null}
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deduct Modal */}
      {showDeductModal && deductingDeposit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDeductModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{t('staff.recordDeduction')}</h3>
              <button onClick={() => setShowDeductModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="font-medium">{deductingDeposit.staff?.name}</p>
                <p className="text-sm text-gray-500">{t('staff.remainingAmount')}: {formatCurrency(getRemainingAmount(deductingDeposit))}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.deductionAmount')} (Rp) *</label>
                <input
                  type="number"
                  value={deductForm.amount}
                  onChange={e => setDeductForm({ ...deductForm, amount: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder="100000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.note')}</label>
                <textarea
                  value={deductForm.note}
                  onChange={e => setDeductForm({ ...deductForm, note: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl resize-none"
                  rows={2}
                  placeholder={t('staff.deductionNotePlaceholder')}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowDeductModal(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleDeduct}
                  disabled={deducting}
                  className="flex-1 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deducting ? <Loader2 size={20} className="animate-spin" /> : null}
                  {t('staff.recordDeduction')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {showRefundModal && refundingDeposit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowRefundModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{t('staff.processRefund')}</h3>
              <button onClick={() => setShowRefundModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="font-medium">{refundingDeposit.staff?.name}</p>
                <p className="text-sm text-gray-500">{t('staff.remainingAmount')}: {formatCurrency(getRemainingAmount(refundingDeposit))}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.refundAmount')} (Rp) *</label>
                <input
                  type="number"
                  value={refundForm.amount}
                  onChange={e => setRefundForm({ ...refundForm, amount: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder="500000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.refundReason')} *</label>
                <select
                  value={refundForm.reason}
                  onChange={e => setRefundForm({ ...refundForm, reason: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                >
                  <option value="full">{t('staff.refundFull')}</option>
                  <option value="prorata">{t('staff.refundProrata')}</option>
                  <option value="damage_deduction">{t('staff.refundDamage')}</option>
                  <option value="other">{t('staff.refundOther')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.note')}</label>
                <textarea
                  value={refundForm.note}
                  onChange={e => setRefundForm({ ...refundForm, note: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl resize-none"
                  rows={2}
                  placeholder={t('staff.refundNotePlaceholder')}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowRefundModal(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleRefund}
                  disabled={refunding}
                  className="flex-1 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {refunding ? <Loader2 size={20} className="animate-spin" /> : null}
                  {t('staff.processRefund')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
