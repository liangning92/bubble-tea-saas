import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { leaveApi } from '../../services/api'
import { Calendar, CheckCircle, XCircle, Clock, Filter, Loader2 } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500'
}

interface Leave {
  id: string
  staffId: string
  leaveType: string
  startDate: string
  endDate: string
  totalDays: number
  reason?: string
  status: string
  halfDay: boolean
  contactPhone?: string
  staff?: {
    id: string
    name: string
    employeeNumber: string
  }
  createdAt: string
}

export function LeaveListPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()

  const [leaves, setLeaves] = useState<Leave[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [selectedLeave, setSelectedLeave] = useState<Leave | null>(null)
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    loadLeaves()
  }, [user, filterStatus])

  const loadLeaves = async () => {
    setIsLoading(true)
    try {
      const params: any = {}
      params.storeId = user?.storeId // Ensure data is filtered by store
      if (filterStatus) params.status = filterStatus
      const response = await leaveApi.list(params)
      setLeaves(response.data?.data || [])
    } catch (error) {
      console.error('Failed to load leaves:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleApprove = async (leaveId: string) => {
    try {
      await leaveApi.approve(leaveId)
      loadLeaves()
      setSelectedLeave(null)
      setActionType(null)
    } catch (error) {
      console.error('Failed to approve leave:', error)
    }
  }

  const handleReject = async (leaveId: string) => {
    if (!rejectReason) return
    try {
      await leaveApi.reject(leaveId, rejectReason)
      loadLeaves()
      setSelectedLeave(null)
      setActionType(null)
      setRejectReason('')
    } catch (error) {
      console.error('Failed to reject leave:', error)
    }
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '-'
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: t('leave.pending'),
      approved: t('leave.approved'),
      rejected: t('leave.rejected'),
      cancelled: t('leave.cancelled')
    }
    return labels[status] || status
  }

  const getLeaveTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      annual: t('leave.annual'),
      sick: t('leave.sick'),
      unpaid: t('leave.unpaid'),
      maternity: t('leave.maternity'),
      paternity: t('leave.paternity'),
      bereavement: t('leave.bereavement'),
      other: t('leave.other')
    }
    return labels[type] || type
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar size={28} />
            <div />
          </div>
        </div>
      </header>

      {/* Filter */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Filter size={20} className="text-gray-500" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="flex-1 p-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">{t('common.all')} {t('leave.status')}</option>
            <option value="pending">{t('leave.pending')}</option>
            <option value="approved">{t('leave.approved')}</option>
            <option value="rejected">{t('leave.rejected')}</option>
          </select>
        </div>
      </div>

      {/* List */}
      <div className="p-4 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : leaves.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Calendar size={48} className="mb-4 opacity-50" />
            <p>{t('leave.noData')}</p>
          </div>
        ) : (
          leaves.map((leave) => (
            <div key={leave.id} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-bold text-gray-900">
                    {leave.staff?.name || t('leave.staff')}
                  </p>
                  <p className="text-sm text-gray-500">
                    {leave.staff?.employeeNumber || '-'}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[leave.status]}`}>
                  {getStatusLabel(leave.status)}
                </span>
              </div>

              <div className="space-y-2 mb-3">
                <span className="inline-block px-2 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary">
                  {getLeaveTypeLabel(leave.leaveType)}
                </span>
                {leave.halfDay && (
                  <span className="inline-block ml-2 px-2 py-1 rounded-lg text-xs font-medium bg-blue-100 text-blue-700">
                    {t('leave.halfDay')}
                  </span>
                )}
              </div>

              <div className="space-y-1 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Calendar size={16} />
                  <span>{formatDate(leave.startDate)} - {formatDate(leave.endDate)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={16} />
                  <span>{leave.totalDays} {t('leave.days')}</span>
                </div>
                {leave.reason && (
                  <p className="text-gray-500 mt-2">{t('leave.reason')}: {leave.reason}</p>
                )}
                {leave.contactPhone && (
                  <p className="text-gray-500">{t('leave.contact')}: {leave.contactPhone}</p>
                )}
              </div>

              {leave.status === 'pending' && (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedLeave(leave)
                      setActionType('approve')
                    }}
                    className="flex-1 py-2 text-sm text-green-600 border border-green-200 rounded-lg hover:bg-green-50 flex items-center justify-center gap-1"
                  >
                    <CheckCircle size={16} />
                    {t('leave.approve')}
                  </button>
                  <button
                    onClick={() => {
                      setSelectedLeave(leave)
                      setActionType('reject')
                    }}
                    className="flex-1 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 flex items-center justify-center gap-1"
                  >
                    <XCircle size={16} />
                    {t('leave.reject')}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Action Modal */}
      {selectedLeave && actionType && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 mx-4 pointer-events-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">
              {actionType === 'approve' ? t('leave.approveLeave') : t('leave.rejectLeave')}
            </h2>

            <div className="mb-4 p-4 bg-gray-50 rounded-xl">
              <p className="font-medium">{selectedLeave.staff?.name}</p>
              <p className="text-sm text-gray-500">
                {getLeaveTypeLabel(selectedLeave.leaveType)} - {selectedLeave.totalDays} {t('leave.days')}
              </p>
              <p className="text-sm text-gray-500">
                {formatDate(selectedLeave.startDate)} - {formatDate(selectedLeave.endDate)}
              </p>
            </div>

            {actionType === 'reject' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('leave.rejectReason')}
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder={t('leave.rejectReasonPlaceholder')}
                />
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSelectedLeave(null)
                  setActionType(null)
                  setRejectReason('')
                }}
                className="flex-1 py-3 border border-gray-200 rounded-xl"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  if (actionType === 'approve') {
                    handleApprove(selectedLeave.id)
                  } else {
                    handleReject(selectedLeave.id)
                  }
                }}
                className={`flex-1 py-3 rounded-xl text-white ${
                  actionType === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {actionType === 'approve' ? t('leave.approve') : t('leave.reject')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}