import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { Check, X, Calendar, User, Timer } from 'lucide-react'

interface OvertimeRequest {
  id: string
  staffId: string
  staff?: { name: string; employeeNumber: string }
  date: string
  startTime: string
  endTime: string
  reason: string
  hours: number
  status: 'pending' | 'approved' | 'rejected'
  adminNote?: string
  createdAt: string
  processedAt?: string
}

export function OvertimeRequestListPage() {
  const { t } = useTranslation()
  const { token, user } = useAuthStore()
  const [requests, setRequests] = useState<OvertimeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('')
  const [processing, setProcessing] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('storeId', user?.storeId || '')
      if (filter) params.append('status', filter)
      const res = await fetch(`/api/overtime?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.code === 200) {
        setRequests(data.data || [])
      }
    } catch (error) {
      console.error('Failed to load overtime requests:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) loadData()
  }, [token, filter])

  const handleApprove = async (id: string) => {
    if (!confirm(t('staff.overtimeConfirmApprove') || 'Approve this overtime request?')) return
    setProcessing(id)
    try {
      const res = await fetch(`/api/overtime/${id}/approve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      })
      const data = await res.json()
      if (data.code === 200) {
        alert(t('staff.overtimeApproved') || 'Overtime request approved')
        loadData()
      } else {
        alert(data.message || 'Failed to approve')
      }
    } catch (error) {
      alert('Failed to approve')
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async (id: string) => {
    const adminNote = prompt(t('staff.enterRejectReason') || 'Enter rejection reason:')
    if (adminNote === null) return
    setProcessing(id)
    try {
      const res = await fetch(`/api/overtime/${id}/reject`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ adminNote })
      })
      const data = await res.json()
      if (data.code === 200) {
        alert(t('staff.overtimeRejected') || 'Overtime request rejected')
        loadData()
      } else {
        alert(data.message || 'Failed to reject')
      }
    } catch (error) {
      alert('Failed to reject')
    } finally {
      setProcessing(null)
    }
  }

  const filteredRequests = filter
    ? requests.filter(r => r.status === filter)
    : requests

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '-'
    return d.toLocaleDateString('id-ID', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700'
    }
    const labels: Record<string, string> = {
      pending: t('staff.statusPending') || 'Pending',
      approved: t('staff.statusApproved') || 'Approved',
      rejected: t('staff.statusRejected') || 'Rejected'
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || colors.pending}`}>
        {labels[status] || status}
      </span>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Timer size={28} className="text-primary" />
          <h1 className="text-xl font-bold">{t('staff.overtimeRequest') || 'Overtime Request'}</h1>
        </div>
        <button onClick={loadData} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">
          {t('common.refresh') || 'Refresh'}
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {['', 'pending', 'approved', 'rejected'].map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              filter === status
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {status ? t(`staff.status${status.charAt(0).toUpperCase() + status.slice(1)}`) || status : t('common.all') || 'All'}
            {status === 'pending' && requests.filter(r => r.status === 'pending').length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                {requests.filter(r => r.status === 'pending').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>
      ) : filteredRequests.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl">
          <p className="text-gray-500">{t('staff.noOvertimeRequests') || 'No overtime requests'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((request) => (
            <div key={request.id} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <User size={18} className="text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{request.staff?.name || 'Unknown'}</p>
                    <p className="text-sm text-gray-500">{request.staff?.employeeNumber || '-'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar size={14} className="text-gray-400" />
                      <span className="text-sm text-gray-600">{formatDate(request.date)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(request.status)}
                </div>
              </div>

              {/* Time Details */}
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-xs text-gray-400">{t('staff.startTime') || 'Start Time'}</p>
                      <p className="text-lg font-bold text-gray-900">{request.startTime}</p>
                    </div>
                    <div className="text-gray-400">→</div>
                    <div>
                      <p className="text-xs text-gray-400">{t('staff.endTime') || 'End Time'}</p>
                      <p className="text-lg font-bold text-gray-900">{request.endTime}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">{t('staff.totalHours') || 'Total Hours'}</p>
                    <p className="text-2xl font-bold text-primary">{request.hours}h</p>
                  </div>
                </div>
              </div>

              {/* Reason */}
              <div className="mt-3">
                <p className="text-xs text-gray-400">{t('staff.reason') || 'Reason'}</p>
                <p className="text-sm text-gray-700">{request.reason}</p>
              </div>

              {/* Admin Note */}
              {request.adminNote && (
                <div className="mt-3 p-2 bg-red-50 rounded-lg">
                  <p className="text-xs text-red-400">{t('staff.adminNote') || 'Admin Note'}</p>
                  <p className="text-sm text-red-700">{request.adminNote}</p>
                </div>
              )}

              {/* Actions */}
              {request.status === 'pending' && (
                <div className="mt-4 flex gap-2 justify-end">
                  <button
                    onClick={() => handleReject(request.id)}
                    disabled={processing === request.id}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm flex items-center gap-1 disabled:opacity-50"
                  >
                    <X size={16} />
                    {t('common.reject')}
                  </button>
                  <button
                    onClick={() => handleApprove(request.id)}
                    disabled={processing === request.id}
                    className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm flex items-center gap-1 disabled:opacity-50"
                  >
                    <Check size={16} />
                    {t('common.approve')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}