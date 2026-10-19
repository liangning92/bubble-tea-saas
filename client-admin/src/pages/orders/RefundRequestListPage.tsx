import { notifyAdmin } from '../../components/AdminFeedback'
import { AdminDialog } from '../../components/AdminDialog'
import { OrderItemsTable } from '../../components/OrderItemsTable'
import { RefundPolicyReview, confirmPreparedRefund } from '../../components/RefundPolicyReview'
import { useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { adminApi } from '../../services/api'
import { formatCurrency, formatDateTime } from '../../utils/helpers'
import { CheckCircle, XCircle, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface RefundRequest {
  id: string
  orderId: string
  amount: number
  orderNumber: string
  reason: string
  reasonCode?: string
  selectedItemIds?: string
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
  const queryClient = useQueryClient()
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

  useEffect(() => { void loadRequests() }, [filter])

  const handleApprove = async () => {
    if (!selectedRequest) return
    if (!await confirmPreparedRefund(selectedRequest, t)) return
    setSubmitting(true)
    try {
      await adminApi.approveRefund(selectedRequest.id, { verifiedPrepared: selectedRequest.reasonCode === 'customer_dissatisfied', verifiedUnprepared: selectedRequest.reasonCode === 'paid_unprepared', note: actionNote })
      setSelectedRequest(null)
      setActionNote('')
      void queryClient.invalidateQueries()
      void loadRequests()
    } catch (err: any) {
      notifyAdmin(err?.response?.data?.message || t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!selectedRequest) return
    if (!actionNote.trim()) {
      notifyAdmin(t('orders.rejectReasonRequired'))
      return
    }
    setSubmitting(true)
    try {
      await adminApi.rejectRefund(selectedRequest.id, { note: actionNote })
      setSelectedRequest(null)
      setActionNote('')
      void queryClient.invalidateQueries()
      void loadRequests()
    } catch (err: any) {
      notifyAdmin(err?.response?.data?.message || t('common.error'))
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
              onClick={() => setFilter(f)}
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
                  <OrderItemsTable items={req.order?.items} />
                  <p className="text-xs text-gray-400">{t('orders.orderNumber')}: {req.orderNumber}</p>
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
        <AdminDialog title={t('orders.refundDetail')} onClose={() => setSelectedRequest(null)} className="max-w-lg" busy={Boolean(submitting)} trackChanges chrome>

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
                    {formatCurrency(selectedRequest.amount > 0 ? selectedRequest.amount : selectedRequest.order?.finalAmount || 0)}
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
              <RefundPolicyReview request={selectedRequest} />
              </div>

              {selectedRequest.order?.items && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">{t('orders.items')}</p>
                  <OrderItemsTable items={selectedRequest.order.items} amount={(_, index) => formatCurrency(selectedRequest.order!.items[index].unitPrice * selectedRequest.order!.items[index].quantity)} />
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
          </AdminDialog>
      )}
    </div>
  )
}