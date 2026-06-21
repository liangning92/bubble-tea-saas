import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { ArrowRightLeft, Check, X, Clock, User } from 'lucide-react'

interface ShiftSwapRequest {
  id: string
  staffId: string
  staff: { name: string; employeeNumber: string }
  originalDate: string
  originalShift: string
  targetDate: string
  targetShift: string
  reason?: string
  status: 'pending' | 'approved' | 'rejected'
  adminNote?: string
  createdAt: string
  processedAt?: string
}

const SHIFT_LABELS: Record<string, string> = {
  morning: 'staff.morningShift',
  afternoon: 'staff.afternoonShift',
  evening: 'staff.eveningShift'
}

export function ShiftSwapListPage() {
  const { t } = useTranslation()
  const { token, user } = useAuthStore()
  const [requests, setRequests] = useState<ShiftSwapRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('')
  const [processing, setProcessing] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('storeId', user?.storeId || '')
      const res = await fetch(`/api/shift-swap?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.code === 200) {
        setRequests(data.data || [])
      }
    } catch (error) {
      console.error('Failed to load shift swaps:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) loadData()
  }, [token])

  const handleApprove = async (id: string) => {
    if (!confirm(t('staff.shiftSwapConfirmApprove') || 'Approve this shift swap request?')) return
    setProcessing(id)
    try {
      const res = await fetch(`/api/shift-swap/${id}/approve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      })
      const data = await res.json()
      if (data.code === 200) {
        alert(t('staff.shiftSwapApproved') || 'Shift swap approved')
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
      const res = await fetch(`/api/shift-swap/${id}/reject`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ adminNote })
      })
      const data = await res.json()
      if (data.code === 200) {
        alert(t('staff.shiftSwapRejected') || 'Shift swap rejected')
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
    return new Date(dateStr).toLocaleDateString('id-ID', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    })
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ArrowRightLeft size={28} className="text-primary" />
          <h1 className="text-xl font-bold">{t('staff.shiftSwap') || 'Shift Swap'}</h1>
        </div>
        <button onClick={loadData} className="btn-secondary">
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
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>
        ) : filteredRequests.length === 0 ? (
          <div className="text-center py-12 text-gray-500">{t('common.noData')}</div>
        ) : (
          filteredRequests.map(request => (
            <div key={request.id} className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
              {/* Staff Info */}
              <div className="flex items-center gap-2 mb-3">
                <User size={16} className="text-gray-400" />
                <span className="font-medium">{request.staff?.name || 'Unknown'}</span>
                <span className="text-sm text-gray-500">#{request.staff?.employeeNumber || '-'}</span>
                <span className={`ml-auto px-2 py-1 rounded-full text-xs font-medium ${
                  request.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                  request.status === 'approved' ? 'bg-green-100 text-green-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {t(`staff.status${request.status.charAt(0).toUpperCase() + request.status.slice(1)}`) || request.status}
                </span>
              </div>

              {/* Swap Details */}
              <div className="flex items-center justify-center gap-4 py-3 bg-gray-50 rounded-lg mb-3">
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">{t('staff.originalDate')}</p>
                  <p className="font-medium">{formatDate(request.originalDate)}</p>
                  <p className="text-sm text-gray-600">{t(SHIFT_LABELS[request.originalShift]) || request.originalShift}</p>
                </div>
                <ArrowRightLeft size={24} className="text-primary" />
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">{t('staff.targetDate')}</p>
                  <p className="font-medium">{formatDate(request.targetDate)}</p>
                  <p className="text-sm text-gray-600">{t(SHIFT_LABELS[request.targetShift]) || request.targetShift}</p>
                </div>
              </div>

              {/* Reason */}
              {request.reason && (
                <p className="text-sm text-gray-600 mb-3">
                  <span className="font-medium">{t('staff.reason')}:</span> {request.reason}
                </p>
              )}

              {/* Admin Note */}
              {request.adminNote && (
                <p className="text-sm text-gray-600 mb-3 bg-blue-50 p-2 rounded">
                  <span className="font-medium">{t('staff.adminNote')}:</span> {request.adminNote}
                </p>
              )}

              {/* Actions */}
              {request.status === 'pending' && (
                <div className="flex gap-2 pt-2 border-t">
                  <button
                    onClick={() => handleApprove(request.id)}
                    disabled={processing === request.id}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                  >
                    <Check size={18} />
                    {t('common.approve') || 'Approve'}
                  </button>
                  <button
                    onClick={() => handleReject(request.id)}
                    disabled={processing === request.id}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                  >
                    <X size={18} />
                    {t('common.reject') || 'Reject'}
                  </button>
                </div>
              )}

              {/* Timestamps */}
              <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {t('staff.requestedAt')}: {(new Date(request.createdAt).getTime() && !isNaN(new Date(request.createdAt).getTime())) ? new Date(request.createdAt).toLocaleString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                </span>
                {request.processedAt && (
                  <span>
                    {t('staff.processedAt')}: {(new Date(request.processedAt).getTime() && !isNaN(new Date(request.processedAt).getTime())) ? new Date(request.processedAt).toLocaleString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}