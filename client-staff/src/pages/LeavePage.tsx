import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import { Calendar, Plus, Clock, XCircle } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500'
}

const STATUS_LABELS_KEYS: Record<string, string> = {
  pending: 'leave.statusPending',
  approved: 'leave.statusApproved',
  rejected: 'leave.statusRejected',
  cancelled: 'leave.statusCancelled'
}

const LEAVE_TYPE_LABELS_KEYS: Record<string, string> = {
  annual: 'leave.annualLeave',
  sick: 'leave.sickLeave',
  unpaid: 'leave.unpaidLeave',
  maternity: 'leave.maternityLeave',
  paternity: 'leave.paternityLeave',
  bereavement: 'leave.bereavementLeave',
  other: 'leave.otherLeave'
}

interface Leave {
  id: string
  leaveType: string
  startDate: string
  endDate: string
  totalDays: number
  reason?: string
  status: string
  halfDay: boolean
}

interface LeaveBalance {
  annualLeave: number
  sickLeave: number
  unpaidLeave: number
  usedLeave: number
  usedSick: number
  broughtForward: number
}

export function LeavePage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()

  const [leaves, setLeaves] = useState<Leave[]>([])
  const [balance, setBalance] = useState<LeaveBalance | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'history' | 'balance'>('history')

  useEffect(() => {
    if (user?.staffId) {
      loadData()
    }
  }, [user])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [leavesRes, balanceRes] = await Promise.all([
        staffApi.getMyLeaves(),
        staffApi.getMyLeaveBalance()
      ])
      setLeaves(leavesRes.data || [])
      setBalance(balanceRes.data)
    } catch (error) {
      console.error('Failed to load leave data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelLeave = async (leaveId: string) => {
    if (!confirm(t('leave.cancelLeaveConfirm'))) return
    try {
      await staffApi.cancelLeave(leaveId)
      loadData()
    } catch (error) {
      console.error('Failed to cancel leave:', error)
      alert(t('leave.cancelLeaveSuccess'))
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar size={28} />
            <div>
              <h1 className="text-xl font-bold">{t('leave.title')}</h1>
              <p className="text-white/80 text-sm">{t('leave.manageLeave')}</p>
            </div>
          </div>
          <button
            onClick={() => setShowApplyModal(true)}
            className="bg-white text-primary p-2 rounded-full"
          >
            <Plus size={24} />
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="flex">
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-3 text-center font-medium ${
              activeTab === 'history'
                ? 'text-primary border-b-2 border-primary'
                : 'text-gray-500'
            }`}
          >
            {t('leave.history')}
          </button>
          <button
            onClick={() => setActiveTab('balance')}
            className={`flex-1 py-3 text-center font-medium ${
              activeTab === 'balance'
                ? 'text-primary border-b-2 border-primary'
                : 'text-gray-500'
            }`}
          >
            {t('leave.leaveBalance')}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {activeTab === 'history' ? (
          <div className="space-y-4">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">{t('common.loading')}</div>
            ) : leaves.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Calendar size={48} className="mx-auto mb-3 text-gray-300" />
                <p>{t('leave.noData')}</p>
              </div>
            ) : (
              leaves.map((leave) => (
                <div key={leave.id} className="bg-white rounded-2xl shadow-sm p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="inline-block px-2 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary">
                        {t(LEAVE_TYPE_LABELS_KEYS[leave.leaveType] || leave.leaveType)}
                      </span>
                      {leave.halfDay && (
                        <span className="inline-block ml-2 px-2 py-1 rounded-lg text-xs font-medium bg-blue-100 text-blue-700">
                          {t('leave.halfDay')}
                        </span>
                      )}
                    </div>
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[leave.status]}`}>
                      {t(STATUS_LABELS_KEYS[leave.status] || leave.status)}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar size={16} />
                      <span>
                        {formatDate(leave.startDate)} - {formatDate(leave.endDate)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock size={16} />
                      <span>{leave.totalDays} {t('leave.days')}</span>
                    </div>
                    {leave.reason && (
                      <p className="text-gray-500 mt-2">{t('leave.reason')}: {leave.reason}</p>
                    )}
                  </div>

                  {leave.status === 'pending' && (
                    <button
                      onClick={() => handleCancelLeave(leave.id)}
                      className="mt-3 w-full py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                    >
                      {t('leave.cancel')}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {balance && (
              <>
                <div className="bg-white rounded-2xl shadow-sm p-4">
                  <h3 className="font-bold text-gray-900 mb-4">{t('leave.annualLeaveBalance')}</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('leave.quota')}</span>
                      <span className="font-medium">{balance.annualLeave} {t('leave.days')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('leave.broughtForward')}</span>
                      <span className="font-medium">{balance.broughtForward} {t('leave.days')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('leave.used')}</span>
                      <span className="font-medium text-red-600">-{balance.usedLeave} {t('leave.days')}</span>
                    </div>
                    <div className="border-t pt-3 flex justify-between">
                      <span className="font-bold">{t('leave.remaining')}</span>
                      <span className="font-bold text-green-600">
                        {balance.annualLeave + balance.broughtForward - balance.usedLeave} {t('leave.days')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm p-4">
                  <h3 className="font-bold text-gray-900 mb-4">{t('leave.sickLeaveBalance')}</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('leave.quota')}</span>
                      <span className="font-medium">{balance.sickLeave} {t('leave.days')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('leave.used')}</span>
                      <span className="font-medium text-red-600">-{balance.usedSick} {t('leave.days')}</span>
                    </div>
                    <div className="border-t pt-3 flex justify-between">
                      <span className="font-bold">{t('leave.remaining')}</span>
                      <span className="font-bold text-green-600">
                        {balance.sickLeave - balance.usedSick} {t('leave.days')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm p-4">
                  <h3 className="font-bold text-gray-900 mb-4">{t('leave.unpaidLeaveBalance')}</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('leave.quota')}</span>
                      <span className="font-medium">{balance.unpaidLeave} {t('leave.days')}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Apply Modal */}
      {showApplyModal && (
        <ApplyLeaveModal
          onClose={() => setShowApplyModal(false)}
          onSuccess={() => {
            setShowApplyModal(false)
            loadData()
          }}
        />
      )}
    </div>
  )
}

interface ApplyLeaveModalProps {
  onClose: () => void
  onSuccess: () => void
}

function ApplyLeaveModal({ onClose, onSuccess }: ApplyLeaveModalProps) {
  const { t } = useTranslation()
  const [leaveType, setLeaveType] = useState('')
  const [leaveTypes, setLeaveTypes] = useState<any[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [totalDays, setTotalDays] = useState(1)
  const [reason, setReason] = useState('')
  const [halfDay, setHalfDay] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadingTypes, setLoadingTypes] = useState(true)

  // Fetch leave types from API
  useEffect(() => {
    const fetchLeaveTypes = async () => {
      try {
        const response = await staffApi.getLeaveTypes()
        if (response.data && response.data.length > 0) {
          setLeaveTypes(response.data)
          setLeaveType(response.data[0].code)
        }
      } catch (error) {
        console.error('Failed to load leave types:', error)
      } finally {
        setLoadingTypes(false)
      }
    }
    fetchLeaveTypes()
  }, [])

  const handleSubmit = async () => {
    if (!startDate || !endDate) {
      alert(t('leave.selectDateRange'))
      return
    }

    setIsSubmitting(true)
    try {
      await staffApi.applyLeave({
        leaveType,
        startDate,
        endDate,
        totalDays,
        reason,
        halfDay
      })
      onSuccess()
    } catch (error: any) {
      alert(error.response?.data?.message || t('leave.submitError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
      <div className="bg-white w-full max-w-md rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">{t('leave.applyLeave')}</h2>
          <button onClick={onClose} className="p-2">
            <XCircle size={24} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('leave.leaveTypes')}</label>
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl"
              disabled={loadingTypes}
            >
              {loadingTypes ? (
                <option value="">{t('common.loading')}</option>
              ) : (
                leaveTypes.map((type) => (
                  <option key={type.code} value={type.code}>
                    {type.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('leave.startDate')}</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full p-3 border border-gray-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('leave.endDate')}</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full p-3 border border-gray-200 rounded-xl"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('leave.numberOfDays')}</label>
            <input
              type="number"
              min="1"
              value={totalDays}
              onChange={(e) => setTotalDays(parseInt(e.target.value) || 1)}
              className="w-full p-3 border border-gray-200 rounded-xl"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="halfDay"
              checked={halfDay}
              onChange={(e) => setHalfDay(e.target.checked)}
              className="w-5 h-5"
            />
            <label htmlFor="halfDay" className="text-sm text-gray-700">
              {t('leave.halfDay')}
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('leave.reasonOptional')}</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full p-3 border border-gray-200 rounded-xl"
              placeholder={t('leave.explainReason')}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full py-3 bg-primary text-white rounded-xl font-medium disabled:opacity-50"
          >
            {isSubmitting ? t('leave.submitting') : t('leave.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}