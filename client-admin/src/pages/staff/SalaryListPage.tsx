import { useState, useEffect } from 'react'
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
      setSalaries(response.data?.data || [])
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
    }).format(amount / 100)
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
      alert(t('salary.selectStaffMonth'))
      return
    }

    setCalculating(true)
    try {
      const [year, month] = formData.month.split('-')
      const response = await salaryApi.calculate(formData.staffId, parseInt(month), parseInt(year))
      const data = response.data?.data

      if (data) {
        setFormData(prev => ({
          ...prev,
          baseSalary: String(data.baseSalary || 0),
          overtime: String(data.overtime || 0),
          commission: String(data.commission || 0),
          bonus: String(data.bonus || 0),
          deduction: String(data.deduction || 0)
        }))
      }
    } catch (error) {
      console.error('Failed to calculate salary:', error)
      alert(t('salary.calcFailed'))
    } finally {
      setCalculating(false)
    }
  }

  const handleSave = async () => {
    if (!formData.staffId || !formData.month || !formData.baseSalary) {
      alert(t('common.required'))
      return
    }

    setSaving(true)
    try {
      const data = {
        storeId: user?.storeId,
        staffId: formData.staffId,
        month: formData.month,
        baseSalary: parseInt(formData.baseSalary),
        overtime: parseInt(formData.overtime) || 0,
        commission: parseInt(formData.commission) || 0,
        bonus: parseInt(formData.bonus) || 0,
        deduction: parseInt(formData.deduction) || 0,
        finalAmount: calculateFinalAmount()
      }

      if (editingSalary) {
        await salaryApi.update(editingSalary.id, data)
      } else {
        await salaryApi.create(data)
      }
      loadSalaries()
      handleCloseModal()
    } catch (error) {
      console.error('Failed to save salary:', error)
      alert(t('common.error'))
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
      alert(t('common.error'))
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('salary.confirmDelete'))) return
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
            className="flex items-center gap-2 bg-white text-primary px-4 py-2 rounded-lg font-medium hover:bg-gray-100"
          >
            <Plus size={20} />
            {t('salary.addSalary')}
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
            <option value="">{t('salary.selectStaff')}</option>
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
            <option value="">{t('common.all')} {t('salary.status')}</option>
            <option value="pending">{t('salary.pending')}</option>
            <option value="paid">{t('salary.paid')}</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="p-4 grid grid-cols-3 gap-3">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-yellow-800 text-sm font-medium">{t('salary.totalPending')}</p>
          <p className="text-xl font-bold text-yellow-900">{formatCurrency(totalPending)}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-green-800 text-sm font-medium">{t('salary.totalPaid')}</p>
          <p className="text-xl font-bold text-green-900">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-blue-800 text-sm font-medium">{t('salary.thisMonth')}</p>
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
            <p>{t('salary.noSalaries')}</p>
            <button
              onClick={() => handleOpenModal()}
              className="mt-4 text-primary font-medium"
            >
              {t('salary.addFirst')}
            </button>
          </div>
        ) : (
          salaries.map((salary) => (
            <div key={salary.id} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-bold text-gray-900">
                    {salary.staff?.name || t('salary.staff')}
                  </p>
                  <p className="text-sm text-gray-500">
                    {salary.staff?.employeeNumber || '-'}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[salary.status]}`}>
                  {salary.status === 'pending' ? t('salary.pending') : t('salary.paid')}
                </span>
              </div>

              <div className="mb-3">
                <span className="inline-block px-2 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary">
                  {formatMonth(salary.month)}
                </span>
              </div>

              {/* Salary breakdown */}
              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('salary.baseSalary')}:</span>
                  <span className="font-medium">{formatCurrency(salary.baseSalary)}</span>
                </div>
                {salary.overtime > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('salary.overtime')}:</span>
                    <span className="font-medium">{formatCurrency(salary.overtime)}</span>
                  </div>
                )}
                {salary.commission > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('salary.commission')}:</span>
                    <span className="font-medium">{formatCurrency(salary.commission)}</span>
                  </div>
                )}
                {salary.bonus > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('salary.bonus')}:</span>
                    <span className="font-medium">{formatCurrency(salary.bonus)}</span>
                  </div>
                )}
                {salary.deduction > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('salary.deduction')}:</span>
                    <span className="font-medium text-red-600">-{formatCurrency(salary.deduction)}</span>
                  </div>
                )}
              </div>

              <div className="text-2xl font-bold text-gray-900 mb-3">
                {formatCurrency(salary.finalAmount)}
              </div>

              <div className="flex gap-2">
                {salary.status === 'pending' && (
                  <button
                    onClick={() => handleMarkPaid(salary.id)}
                    className="flex-1 py-2 text-sm text-green-600 border border-green-200 rounded-lg hover:bg-green-50 flex items-center justify-center gap-1"
                  >
                    <CheckCircle size={16} />
                    {t('salary.markAsPaid')}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(salary.id)}
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                {editingSalary ? t('salary.editSalary') : t('salary.addSalary')}
              </h2>
              <button onClick={handleCloseModal} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Staff Select */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('salary.staff')} *
                </label>
                <select
                  value={formData.staffId}
                  onChange={(e) => setFormData({ ...formData, staffId: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  disabled={!!editingSalary}
                >
                  <option value="">{t('salary.selectStaff')}</option>
                  {staffOptions.map((staff) => (
                    <option key={staff.id} value={staff.id}>{staff.name}</option>
                  ))}
                </select>
              </div>

              {/* Month */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('salary.month')} *
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
                  {t('salary.baseSalary')} (Rp) *
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
                    disabled={calculating || !formData.staffId || !formData.month}
                    className="px-4 py-3 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1 text-sm font-medium"
                  >
                    {calculating ? <Loader2 size={16} className="animate-spin" /> : null}
                    {t('salary.autoCalc')}
                  </button>
                </div>
              </div>

              {/* Overtime */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('salary.overtime')} (Rp)
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
                  {t('salary.commission')} (Rp)
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
                  {t('salary.bonus')} (Rp)
                </label>
                <input
                  type="number"
                  value={formData.bonus}
                  onChange={(e) => setFormData({ ...formData, bonus: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder="0"
                  min="0"
                />
              </div>

              {/* Deduction */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('salary.deduction')} (Rp)
                </label>
                <input
                  type="number"
                  value={formData.deduction}
                  onChange={(e) => setFormData({ ...formData, deduction: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder="0"
                  min="0"
                />
              </div>

              {/* Final Amount Preview */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{t('salary.finalAmount')}:</span>
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
                  disabled={saving}
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