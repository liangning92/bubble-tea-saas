import { useEmployeePermission } from '../../contexts/EmployeeAccess'
import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { salaryApi, staffApi } from '../../services/api'
import { DollarSign, Plus, Loader2, Filter, X, CheckCircle } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700'
}

interface Salary {
  id: string
  staffId: string
  month: string
  compensationAdjustmentIds?: string[]
  compensationRewards?: number
  compensationPenalties?: number
  depositDeductionAmount?: number
  compensationItems?: Array<{id:string;type:string;amount:number;reason:string}>
  depositNeedsReview?: boolean
  expectedDepositAmount?: number
  depositDeductions?: Array<{staffDepositId: string; amountMinor: number}>
  baseSalary: number
  overtime: number
  commission: number
  bonus: number
  deduction: number
  finalAmount: number
  status: string
  staff?: {
    id: string
    name: string
    employeeNumber: string
  }
  createdAt: string
}

interface StaffOption {
  id: string
  name: string
  employeeNumber: string
}

export function SalaryListPage() {
  const canWrite=useEmployeePermission('salary.write')
  const { t } = useTranslation()
  const { user } = useAuthStore()

  const [salaries, setSalaries] = useState<Salary[]>([])
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterStaff, setFilterStaff] = useState<string>('')
  const [filterMonth, setFilterMonth] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingSalary, setEditingSalary] = useState<Salary | null>(null)
  const [depositPlan, setDepositPlan] = useState<{staffId: string; month: string; items: Array<{staffDepositId: string; amountMinor: number}>} | null>(null)
  const [saveError, setSaveError] = useState('')
  const [depositLoading, setDepositLoading] = useState(false)
  const [depositError, setDepositError] = useState('')
  const appliedDepositAmount = useRef(0)
  const appliedCompensation = useRef({rewards:0,penalties:0})
  const [compensationIds,setCompensationIds]=useState<string[]>([])
  const [formData, setFormData] = useState({
    staffId: '',
    month: '',
    baseSalary: '',
    overtime: '0',
    commission: '0',
    bonus: '0',
    deduction: '0'
  })
  const [saving, setSaving] = useState(false)
  const [calculating, setCalculating] = useState(false)

  useEffect(() => {
    if (!showModal || !formData.staffId || !formData.month) return
    let current = true
    setDepositLoading(true)
    setDepositError('')
    salaryApi.depositPlan(formData.staffId, formData.month).then(response => {
      if (!current) return
      const items = response.data.data.depositDeductions || []
      const amount = items.reduce((sum: number, item: {amountMinor: number}) => sum + Math.round(item.amountMinor / 100), 0)
      const compensation=response.data.data.compensation || {items:[],rewards:0,penalties:0}
      const previousCompensation=appliedCompensation.current
      appliedCompensation.current=compensation
      setCompensationIds(compensation.items.map((item:{id:string})=>item.id))
      const previous = appliedDepositAmount.current
      appliedDepositAmount.current = amount
      setDepositPlan({staffId:formData.staffId, month:formData.month, items})
      setFormData(prev => ({...prev, bonus:String(Math.max(0,Number(prev.bonus)-previousCompensation.rewards)+compensation.rewards), deduction:String(Math.max(0, Number(prev.deduction) - previous - previousCompensation.penalties) + amount + compensation.penalties)}))
    }).catch(() => {if (current) setDepositError(t('salaryDeposit.loadFailed'))})
      .finally(() => {if (current) setDepositLoading(false)})
    return () => {current = false}
  }, [showModal, formData.staffId, formData.month, t])

  // Get current month in YYYY-MM format
  const getCurrentMonth = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }

  useEffect(() => {
    loadSalaries()
    loadStaff()
  }, [user, filterStaff, filterMonth, filterStatus])

  const loadSalaries = async () => {
    setIsLoading(true)
    try {
      const params: any = {}
      params.storeId = user?.storeId
      if (filterStaff) params.staffId = filterStaff
      if (filterMonth) params.month = filterMonth
      if (filterStatus) params.status = filterStatus
      const response = await salaryApi.list(params)
      setSalaries(response.data?.data?.list || [])
    } catch (error) {
      console.error('Failed to load salaries:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadStaff = async () => {
    try {
      const response = await staffApi.list({ storeId: user?.storeId, pageSize: 100 })
      setStaffOptions(response.data?.data?.list || [])
    } catch (error) {
      console.error('Failed to load staff:', error)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount)
  }

  const formatMonth = (monthStr: string) => {
    if (!monthStr) return ''
    const [year, month] = monthStr.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1)
    return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  }

  const calculateFinalAmount = () => {
    const base = parseInt(formData.baseSalary) || 0
    const overtime = parseInt(formData.overtime) || 0
    const commission = parseInt(formData.commission) || 0
    const bonus = parseInt(formData.bonus) || 0
    const deduction = parseInt(formData.deduction) || 0
    return base + overtime + commission + bonus - deduction
  }

  const handleOpenModal = (salary?: Salary) => {
    setSaveError('')
    setDepositError('')
    appliedCompensation.current={rewards:salary?.compensationRewards||0,penalties:salary?.compensationPenalties||0}
    setCompensationIds(salary?.compensationAdjustmentIds||[])
    appliedDepositAmount.current = (salary?.depositDeductions || []).reduce((sum, item) => sum + Math.round(item.amountMinor / 100), 0)
    setDepositPlan(salary ? { staffId: salary.staffId, month: salary.month, items: salary.depositDeductions || [] } : null)
    if (salary) {
      setEditingSalary(salary)
      setFormData({
        staffId: salary.staffId,
        month: salary.month,
        baseSalary: String(salary.baseSalary),
        overtime: String(salary.overtime),
        commission: String(salary.commission),
        bonus: String(salary.bonus),
        deduction: String(salary.deduction)
      })
    } else {
      setEditingSalary(null)
      setFormData({
        staffId: '',
        month: getCurrentMonth(),
        baseSalary: '',
        overtime: '0',
        commission: '0',
        bonus: '0',
        deduction: '0'
      })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingSalary(null)
  }

  const handleAutoCalculate = async () => {
    if (!formData.staffId || !formData.month) {
      alert(t('staff.salary.selectStaffMonth'))
      return
    }

    setCalculating(true)
    try {
      const [year, month] = formData.month.split('-')
      const response = await salaryApi.calculate(formData.staffId, parseInt(month), parseInt(year))
      const data = response.data?.data

      if (data) {
        appliedCompensation.current=data.compensation || {rewards:0,penalties:0}
        setCompensationIds(data.compensationAdjustmentIds || [])
        appliedDepositAmount.current = (data.depositDeductions || []).reduce((sum: number, item: {amountMinor: number}) => sum + Math.round(item.amountMinor / 100), 0)
        setDepositPlan({ staffId: formData.staffId, month: formData.month, items: data.depositDeductions || [] })
        setFormData(prev => prev.staffId !== formData.staffId || prev.month !== formData.month ? prev : ({
          ...prev,
          baseSalary: String(data.baseSalary || 0),
          overtime: String(data.overtimePay || 0),
          commission: String(data.commission || 0),
          bonus: String(data.bonuses || 0),
          deduction: String(data.deductions || 0)
        }))
      }
    } catch (error) {
      console.error('Failed to calculate salary:', error)
      alert(t('staff.salary.calcFailed'))
    } finally {
      setCalculating(false)
    }
  }

  const handleSave = async () => {
    if (!formData.staffId || !formData.month || !formData.baseSalary) {
      alert(t('common.required'))
      return
    }

    if (saving || calculating || depositLoading || depositError) return
    if (Number(formData.deduction) < appliedDepositAmount.current+appliedCompensation.current.penalties || Number(formData.bonus)<appliedCompensation.current.rewards) {setSaveError(t('salaryDeposit.minimum')); return}
    const amounts = ['baseSalary', 'overtime', 'commission', 'bonus', 'deduction'].map(key => Number(formData[key as keyof typeof formData]))
    if (amounts.some(value => !Number.isSafeInteger(value) || value < 0) || calculateFinalAmount() < 0) { setSaveError(t('common.required')); return }
    setSaveError('')
    setSaving(true)
    try {
      const data = {
        compensationAdjustmentIds:compensationIds,
        storeId: user?.storeId,
        staffId: formData.staffId,
        month: formData.month,
        baseSalary: parseInt(formData.baseSalary),
        overtime: parseInt(formData.overtime) || 0,
        commission: parseInt(formData.commission) || 0,
        bonus: parseInt(formData.bonus) || 0,
        deduction: parseInt(formData.deduction) || 0,
        depositDeductions: depositPlan?.staffId === formData.staffId && depositPlan?.month === formData.month ? depositPlan.items : []
        // 注意: finalAmount 由服务端统一计算，不要前端计算后发送
      }

      if (editingSalary) {
        await salaryApi.update(editingSalary.id, data)
      } else {
        await salaryApi.create(data)
      }
      loadSalaries()
      handleCloseModal()
    } catch (error: any) {
      setSaveError(error?.response?.data?.errors?.map((item: any) => item.message).join('; ') || error?.response?.data?.message || t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const handleMarkPaid = async (id: string) => {
    try {
      await salaryApi.markPaid(id)
      loadSalaries()
    } catch (error) {
      console.error('Failed to mark paid:', error)
      alert(t('salaryDeposit.recalculate'))
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('staff.salary.confirmDelete'))) return
    try {
      await salaryApi.delete(id)
      loadSalaries()
    } catch (error) {
      console.error('Failed to delete salary:', error)
      alert(t('common.error'))
    }
  }

  const pendingSalaries = salaries.filter(s => s.status === 'pending')
  const paidSalaries = salaries.filter(s => s.status === 'paid')
  const thisMonth = getCurrentMonth()
  const thisMonthSalaries = salaries.filter(s => s.month === thisMonth)

  const totalPending = pendingSalaries.reduce((sum, s) => sum + s.finalAmount, 0)
  const totalPaid = paidSalaries.reduce((sum, s) => sum + s.finalAmount, 0)
  const thisMonthTotal = thisMonthSalaries.reduce((sum, s) => sum + s.finalAmount, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DollarSign size={28} />
            <div />
          </div>
          <button
            onClick={() => handleOpenModal()}
            disabled={user?.role !== 'admin'}
            title={user?.role !== 'admin' ? t('staff.salary.adminCreateOnly') : undefined}
            className="flex items-center gap-2 bg-white text-primary px-4 py-2 rounded-lg font-medium hover:bg-gray-100"
          >
            <Plus size={20} />
            {t('staff.salary.addSalary')}
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Filter size={20} className="text-gray-500" />
          <select
            value={filterStaff}
            onChange={(e) => setFilterStaff(e.target.value)}
            className="flex-1 p-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">{t('staff.salary.selectStaff')}</option>
            {staffOptions.map((staff) => (
              <option key={staff.id} value={staff.id}>{staff.name}</option>
            ))}
          </select>
          <input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="flex-1 p-2 border border-gray-200 rounded-lg text-sm"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="flex-1 p-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">{t('common.all')} {t('staff.salary.status')}</option>
            <option value="pending">{t('staff.salary.pending')}</option>
            <option value="paid">{t('staff.salary.paid')}</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="p-4 grid grid-cols-3 gap-3">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-yellow-800 text-sm font-medium">{t('staff.salary.totalPending')}</p>
          <p className="text-xl font-bold text-yellow-900">{formatCurrency(totalPending)}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-green-800 text-sm font-medium">{t('staff.salary.totalPaid')}</p>
          <p className="text-xl font-bold text-green-900">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-blue-800 text-sm font-medium">{t('staff.salary.thisMonth')}</p>
          <p className="text-xl font-bold text-blue-900">{formatCurrency(thisMonthTotal)}</p>
        </div>
      </div>

      {/* List */}
      <div className="p-4 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : salaries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <DollarSign size={48} className="mb-4 opacity-50" />
            <p>{t('staff.salary.noSalaries')}</p>
            <button
              onClick={() => handleOpenModal()}
            disabled={user?.role !== 'admin'}
            title={user?.role !== 'admin' ? t('staff.salary.adminCreateOnly') : undefined}
              className="mt-4 text-primary font-medium"
            >
              {t('staff.salary.addFirst')}
            </button>
          </div>
        ) : (
          salaries.map((salary) => (
            <div key={salary.id} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-bold text-gray-900">
                    {salary.staff?.name || t('staff.salary.staff')}
                  </p>
                  <p className="text-sm text-gray-500">
                    {salary.staff?.employeeNumber || '-'}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[salary.status]}`}>
                  {salary.status === 'pending' ? t('staff.salary.pending') : t('staff.salary.paid')}
                </span>
              </div>

              <div className="mb-3">
                <span className="inline-block px-2 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary">
                  {formatMonth(salary.month)}
                </span>
              </div>

              {(salary.depositDeductions?.length || 0) > 0 && <p className="text-sm text-red-600 mb-2">{t('staff.salary.depositPortion')}: {formatCurrency((salary.depositDeductions || []).reduce((sum, item) => sum + Math.round(item.amountMinor / 100), 0))}</p>}
              {salary.depositNeedsReview && <p role="alert" className="text-sm text-amber-700 mb-2">{t('salaryDeposit.recalculate')} {formatCurrency(salary.expectedDepositAmount || 0)}</p>}
              <div className="grid grid-cols-3 gap-2 mb-3 rounded-xl border p-3">
                <div><p className="text-gray-500 text-sm">{t('compensation.reward')}</p><p className="font-bold text-green-700">+{formatCurrency(salary.bonus)}</p></div>
                <div><p className="text-gray-500 text-sm">{t('compensation.penalty')}</p><p className="font-bold text-red-600">−{formatCurrency(salary.compensationPenalties || 0)}</p></div>
                <div><p className="text-gray-500 text-sm">{t(salary.depositNeedsReview?'compensation.depositPending':'compensation.deposit')}</p><p className="font-bold text-amber-700">−{formatCurrency(salary.depositNeedsReview?salary.expectedDepositAmount || 0:salary.depositDeductionAmount || 0)}</p></div>
              </div>
              {!!salary.compensationItems?.length && <ul className="text-sm mb-3">{salary.compensationItems.map(item=><li key={item.id}>{t('compensation.'+item.type)} {formatCurrency(item.amount)} · {item.reason}</li>)}</ul>}
              {/* Salary breakdown */}
              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('staff.salary.baseSalary')}:</span>
                  <span className="font-medium">{formatCurrency(salary.baseSalary)}</span>
                </div>
                {salary.overtime > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('staff.salary.overtime')}:</span>
                    <span className="font-medium">{formatCurrency(salary.overtime)}</span>
                  </div>
                )}
                {salary.commission > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('staff.salary.commission')}:</span>
                    <span className="font-medium">{formatCurrency(salary.commission)}</span>
                  </div>
                )}
                {salary.bonus > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('staff.salary.bonus')}:</span>
                    <span className="font-medium">{formatCurrency(salary.bonus)}</span>
                  </div>
                )}
                {salary.deduction > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('staff.salary.deduction')}:</span>
                    <span className="font-medium text-red-600">-{formatCurrency(salary.deduction)}</span>
                  </div>
                )}
              </div>

              <div className="text-2xl font-bold text-gray-900 mb-3">
                {formatCurrency(salary.finalAmount)}
              </div>

              <div className="flex gap-2">
                {salary.status === 'pending' && <button disabled={!canWrite} onClick={() => handleOpenModal(salary)} className="py-2 px-3 text-sm border rounded-lg">{t('common.edit')}</button>}
                {salary.status === 'pending' && (
                  <button
                    onClick={() => handleMarkPaid(salary.id)}
                    disabled={user?.role !== 'admin' || salary.depositNeedsReview}
                    className="flex-1 py-2 text-sm text-green-600 border border-green-200 rounded-lg hover:bg-green-50 flex items-center justify-center gap-1"
                  >
                    <CheckCircle size={16} />
                    {t('staff.salary.markAsPaid')}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(salary.id)}
                  disabled={salary.status !== 'pending' || user?.role !== 'admin'}
                  className="py-2 px-3 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 mx-4 max-h-[90vh] overflow-y-auto pointer-events-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                {editingSalary ? t('staff.salary.editSalary') : t('staff.salary.addSalary')}
              </h2>
              <button onClick={handleCloseModal} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {saveError && <p role="alert" className="text-red-600">{saveError}</p>}
              {/* Staff Select */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('staff.salary.staff')} *
                </label>
                <select
                  value={formData.staffId}
                  onChange={(e) => setFormData({ ...formData, staffId: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  disabled={!!editingSalary}
                >
                  <option value="">{t('staff.salary.selectStaff')}</option>
                  {staffOptions.map((staff) => (
                    <option key={staff.id} value={staff.id}>{staff.name}</option>
                  ))}
                </select>
              </div>

              {/* Month */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('staff.salary.month')} *
                </label>
                <input
                  type="month"
                  value={formData.month}
                  onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  disabled={!!editingSalary}
                />
              </div>

              {/* Base Salary */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('staff.salary.baseSalary')} (Rp) *
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={formData.baseSalary}
                    onChange={(e) => setFormData({ ...formData, baseSalary: e.target.value })}
                    className="flex-1 w-full p-3 border border-gray-200 rounded-xl"
                    placeholder="0"
                    min="0"
                  />
                  <button
                    type="button"
                    onClick={handleAutoCalculate}
                    disabled={!canWrite || calculating || depositLoading || !formData.staffId || !formData.month}
                    className="px-4 py-3 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1 text-sm font-medium"
                  >
                    {calculating ? <Loader2 size={16} className="animate-spin" /> : null}
                    {t('staff.salary.autoCalc')}
                  </button>
                </div>
              </div>

              {/* Overtime */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('staff.salary.overtime')} (Rp)
                </label>
                <input
                  type="number"
                  value={formData.overtime}
                  onChange={(e) => setFormData({ ...formData, overtime: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder="0"
                  min="0"
                />
              </div>

              {/* Commission */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('staff.salary.commission')} (Rp)
                </label>
                <input
                  type="number"
                  value={formData.commission}
                  onChange={(e) => setFormData({ ...formData, commission: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder="0"
                  min="0"
                />
              </div>

              {/* Bonus */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('staff.salary.bonus')} (Rp)
                </label>
                <input
                  type="number"
                  value={formData.bonus}
                  readOnly
                  onChange={(e) => setFormData({ ...formData, bonus: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder="0"
                  min="0"
                />
              </div>

              {/* Deduction */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('staff.salary.deduction')} (Rp)
                </label>
                <input
                  type="number"
                  value={formData.deduction}
                  readOnly
                  onChange={(e) => setFormData({ ...formData, deduction: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder="0"
                  min="0"
                />
              </div>

              {depositLoading && <p role="status">{t('common.loading')}</p>}
              {depositError && <p role="alert" className="text-red-600">{depositError}</p>}
              <p className="text-sm text-gray-500">{t('compensation.payrollHint')}</p>
              <p className="text-sm text-gray-500">{t('salaryDeposit.hint')}</p>
              {depositPlan?.staffId === formData.staffId && depositPlan?.month === formData.month && depositPlan.items.length > 0 && <p className="text-sm text-gray-600">{t('staff.salary.depositPortion')}: {formatCurrency(depositPlan.items.reduce((sum, item) => sum + item.amountMinor, 0) / 100)}</p>}
              {/* Final Amount Preview */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{t('staff.salary.finalAmount')}:</span>
                  <span className="text-xl font-bold text-primary">
                    {formatCurrency(calculateFinalAmount())}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleCloseModal}
                  className="flex-1 py-3 border border-gray-200 rounded-xl"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={!canWrite || saving || calculating || depositLoading || !!depositError}
                  className="flex-1 py-3 bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    t('common.save')
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}