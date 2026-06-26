import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { staffApi } from '../../services/api'
import { RefreshCw, Save, Search } from 'lucide-react'

interface LeaveBalance {
  staffId: string
  staffName: string
  employeeNumber: string
  year: number
  annualLeave: number
  sickLeave: number
  usedLeave: number
  usedSick: number
  broughtForward: number
}

export function LeaveBalancePage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())

  useEffect(() => {
    loadBalances()
  }, [user, year])

  const loadBalances = async () => {
    setLoading(true)
    try {
      // Get all staff
      const staffResponse = await staffApi.list({ storeId: user?.storeId, page: 1, pageSize: 100 })
      const staffList = staffResponse.data?.data?.list || staffResponse.data?.data || []

      // For now, display placeholder data - in real implementation, call leave balance API
      const balanceData = staffList.map((staff: any) => ({
        staffId: staff.id,
        staffName: staff.name,
        employeeNumber: staff.employeeNumber,
        year,
        annualLeave: 12,
        sickLeave: 14,
        usedLeave: 0,
        usedSick: 0,
        broughtForward: 0
      }))

      setBalances(balanceData)
    } catch (error) {
      console.error('Failed to load balances:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (balance: LeaveBalance) => {
    setSaving(balance.staffId)
    try {
      // Call API to update balance
      await fetch(`/api/leave/balance/${balance.staffId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${useAuthStore.getState().token}`
        },
        body: JSON.stringify({
          year,
          annualLeave: balance.annualLeave,
          sickLeave: balance.sickLeave,
          broughtForward: balance.broughtForward
        })
      })
      alert(t('common.saveSuccess') || 'Saved successfully')
    } catch (error) {
      console.error('Failed to save:', error)
      alert(t('common.saveFailed') || 'Failed to save')
    } finally {
      setSaving(null)
    }
  }

  const updateBalance = (staffId: string, field: keyof LeaveBalance, value: number) => {
    setBalances(prev => prev.map(b =>
      b.staffId === staffId ? { ...b, [field]: value } : b
    ))
  }

  const filteredBalances = balances.filter(b =>
    b.staffName.toLowerCase().includes(search.toLowerCase()) ||
    b.employeeNumber.toLowerCase().includes(search.toLowerCase())
  )

  const getAvailable = (b: LeaveBalance) => b.annualLeave + b.broughtForward - b.usedLeave
  const getSickAvailable = (b: LeaveBalance) => b.sickLeave - b.usedSick

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">{t('staff.leaveBalance') || '请假余额'}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('staff.leaveBalanceDesc') || '管理员工年假和病假余额'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="input w-32"
          >
            {[2024, 2025, 2026].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button onClick={loadBalances} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('staff.searchStaff') || '搜索员工...'}
            className="input w-full pl-10"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-gray-400" />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                  {t('staff.name') || '员工'}
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">
                  {t('staff.annualLeave') || '年假'}
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">
                  {t('staff.used') || '已用'}
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">
                  {t('staff.available') || '剩余'}
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">
                  {t('staff.sickLeave') || '病假'}
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">
                  {t('staff.used') || '已用'}
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">
                  {t('staff.available') || '剩余'}
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">
                  {t('staff.actions') || '操作'}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredBalances.map(balance => (
                <tr key={balance.staffId} className="border-t">
                  <td className="px-4 py-3">
                    <div className="font-medium">{balance.staffName}</div>
                    <div className="text-xs text-gray-500">{balance.employeeNumber}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="number"
                      value={balance.annualLeave}
                      onChange={e => updateBalance(balance.staffId, 'annualLeave', parseInt(e.target.value) || 0)}
                      className="input w-16 text-center"
                      min={0}
                    />
                  </td>
                  <td className="px-4 py-3 text-center text-red-500">
                    -{balance.usedLeave}
                  </td>
                  <td className="px-4 py-3 text-center text-green-600 font-medium">
                    {getAvailable(balance)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="number"
                      value={balance.sickLeave}
                      onChange={e => updateBalance(balance.staffId, 'sickLeave', parseInt(e.target.value) || 0)}
                      className="input w-16 text-center"
                      min={0}
                    />
                  </td>
                  <td className="px-4 py-3 text-center text-red-500">
                    -{balance.usedSick}
                  </td>
                  <td className="px-4 py-3 text-center text-green-600 font-medium">
                    {getSickAvailable(balance)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleSave(balance)}
                      disabled={saving === balance.staffId}
                      className="px-3 py-1 bg-primary text-white text-sm rounded-lg hover:bg-primary-hover disabled:opacity-50"
                    >
                      {saving === balance.staffId ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Save size={14} />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}