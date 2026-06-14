import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { adminApi } from '../../services/api'
import { formatCurrency, formatDateTime } from '../../utils/helpers'
import { CheckCircle, XCircle, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface RefundRequest {
  id: string
  orderId: string
  orderNumber: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  requestedBy: string
  requestedByName?: string
  approvedBy?: string
  approvedByName?: string
  approvedAt?: string
  note?: string
  createdAt: string
  order?: {
    finalAmount: number
    paymentMethod: string
    items: any[]
  }
}

export function RefundRequestListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [requests, setRequests] = useState<RefundRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [selectedRequest, setSelectedRequest] = useState<RefundRequest | null>(null)
  const [actionNote, setActionNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadRequests = async () => {
    setLoading(true)
    try {
      const res = await adminApi.getRefundRequests(filter === 'all' ? undefined : filter)
      setRequests(res.data?.data?.list || [])
    } catch (err) {
      console.error('Failed to load refund requests:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    if (!selectedRequest) return
    setSubmitting(true)
    try {
      await adminApi.approveRefund(selectedRequest.id, { note: actionNote })
      alert(t('orders.refundApproved'))
      setSelectedRequest(null)
      setActionNote('')
      loadRequests()
    } catch (err) {
      alert(t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!selectedRequest) return
    if (!actionNote.trim()) {
      alert(t('orders.rejectReasonRequired'))
      return
    }
    setSubmitting(true)
    try {
      await adminApi.rejectRefund(selectedRequest.id, { note: actionNote })
      alert(t('orders.refundRejected'))
      setSelectedRequest(null)
      setActionNote('')
      loadRequests()
    } catch (err) {
      alert(t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: t('orders.pending') },
      approved: { bg: 'bg-green-100', text: 'text-green-700', label: t('orders.approved') },
      rejected: { bg: 'bg-red-100', text: 'text-red-700', label: t('orders.rejected') }
    }
    const b = badges[status] || badges.pending
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${b.bg} ${b.text}`}>{b.label}</span>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/finance/orders')} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-bold">{t('orders.refundApproval')}</h1>
        </div>
      </header>

      {/* Filter */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex gap-2">
          {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setTimeout(loadRequests, 0) }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                filter === f ? 'bg-primary text-white' : 'bg-gray-100'
              }`}
            >
              {f === 'all' ? t('common.all') : f === 'pending' ? t('orders.pending') : f === 'approved' ? t('orders.approved') : t('orders.rejected')}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="p-4 space-y-3">
        {loading ? (
          <div className="text-center py-8 text-gray-500">{t('common.loading')}</div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl">
            <p className="text-gray-500">{t('orders.noRefundRequests')}</p>
          </div>
        ) : (
          requests.map(req => (
            <div
              key={req.id}
              onClick={() => setSelectedRequest(req)}
              className="bg-white rounded-xl shadow-sm p-4 cursor-pointer hover:shadow-md"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold">{req.orderNumber}</p>
                  <p className="text-xs text-gray-500">{formatDateTime(req.createdAt)}</p>
                </div>
                {getStatusBadge(req.status)}
              </div>
              <p className="text-sm text-gray-600 mb-2">{req.reason}</p>
              {req.requestedByName && (
                <p className="text-xs text-gray-400">{t('orders.applicant')}: {req.requestedByName}</p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Detail Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white w-[90%] max-w-lg rounded-xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white p-4 border-b flex items-center justify-between">
              <h3 className="font-bold text-lg">{t('orders.refundDetail')}</h3>
              <button onClick={() => setSelectedRequest(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <XCircle size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">{t('orders.orderNumber')}</p>
                  <p className="font-medium">{selectedRequest.orderNumber}</p>
                </div>
                <div>
                  <p className="text-gray-500">{t('orders.status')}</p>
                  {getStatusBadge(selectedRequest.status)}
                </div>
                <div>
                  <p className="text-gray-500">{t('orders.refundAmount')}</p>
                  <p className="font-bold text-lg text-red-500">
                    {formatCurrency(selectedRequest.order?.finalAmount || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">{t('orders.applicant')}</p>
                  <p className="font-medium">{selectedRequest.requestedByName || selectedRequest.requestedBy}</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-500 mb-1">{t('orders.refundReason')}</p>
                <p className="text-sm">{selectedRequest.reason}</p>
              </div>

              {selectedRequest.order?.items && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">{t('orders.items')}</p>
                  <div className="space-y-1">
                    {selectedRequest.order.items.map((item: any, i: number) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span>{item.quantity}x {item.productName}</span>
                        <span>{formatCurrency(item.unitPrice * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedRequest.status === 'pending' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-2">{t('orders.approvalNote')}</label>
                    <textarea
                      value={actionNote}
                      onChange={(e) => setActionNote(e.target.value)}
                      placeholder={t('orders.approvalNotePlaceholder')}
                      rows={2}
                      className="w-full p-3 border border-gray-200 rounded-xl resize-none focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleReject}
                      disabled={submitting}
                      className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:bg-gray-300"
                    >
                      <XCircle size={18} />
                      {t('orders.reject')}
                    </button>
                    <button
                      onClick={handleApprove}
                      disabled={submitting}
                      className="flex-1 py-3 bg-green-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:bg-gray-300"
                    >
                      <CheckCircle size={18} />
                      {t('orders.approve')}
                    </button>
                  </div>
                </div>
              )}

              {selectedRequest.status !== 'pending' && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <p className="text-gray-500">{t('orders.processResult')}</p>
                  <p className="font-medium">{selectedRequest.status === 'approved' ? t('orders.approved') : t('orders.rejected')}</p>
                  {selectedRequest.note && <p className="mt-1">{t('orders.note')}: {selectedRequest.note}</p>}
                  {selectedRequest.approvedByName && <p>{t('orders.approver')}: {selectedRequest.approvedByName}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}