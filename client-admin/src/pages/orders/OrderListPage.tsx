import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { orderApi, channelApi, adminApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { formatCurrency, formatDateTime } from '../../utils/helpers'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'

interface RefundRequest {
  id: string
  orderId: string
  orderNumber: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  requestedByName?: string
  createdAt: string
  order?: {
    finalAmount: number
    paymentMethod: string
    items: any[]
  }
}

type OrderSubTab = 'orders' | 'refunds'

export function OrderListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user: _user } = useAuthStore()
  const [subTab, setSubTab] = useState<OrderSubTab>('orders')
  const [statusFilter, setStatusFilter] = useState('')
  const [channelFilter, setChannelFilter] = useState('')

  // Refund requests state
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([])
  const [selectedRefund, setSelectedRefund] = useState<RefundRequest | null>(null)
  const [refundAction, setRefundAction] = useState<'approve' | 'reject' | null>(null)
  const [refundNote, setRefundNote] = useState('')

  // Get channels for filter dropdown
  const { data: channelsData } = useQuery({
    queryKey: ['channels'],
    queryFn: () => channelApi.list()
  })
  const channels = channelsData?.data?.data?.list || []

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['orders', statusFilter, channelFilter],
    queryFn: () => orderApi.list({
      pageSize: 100,
      status: statusFilter || undefined,
      channelId: channelFilter || undefined
    })
  })

  const orders = data?.data?.data?.list || []

  // Load pending refund requests
  const loadRefundRequests = async () => {
    try {
      const res = await adminApi.getRefundRequests('pending')
      setRefundRequests(res.data?.data?.list || [])
    } catch (err) {
      console.error('Failed to load refund requests:', err)
    }
  }

  useEffect(() => {
    loadRefundRequests()
  }, [])

  const handleApproveRefund = async () => {
    if (!selectedRefund) return
    try {
      await adminApi.approveRefund(selectedRefund.id, { note: refundNote })
      alert(t('orders.refundApproved'))
      setSelectedRefund(null)
      setRefundAction(null)
      setRefundNote('')
      loadRefundRequests()
    } catch (err) {
      alert(t('common.error'))
    }
  }

  const handleRejectRefund = async () => {
    if (!selectedRefund || !refundNote.trim()) {
      alert(t('orders.rejectReasonRequired'))
      return
    }
    try {
      await adminApi.rejectRefund(selectedRefund.id, { note: refundNote })
      alert(t('orders.refundRejected'))
      setSelectedRefund(null)
      setRefundAction(null)
      setRefundNote('')
      loadRefundRequests()
    } catch (err) {
      alert(t('common.error'))
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return 'badge-success'
      case 'refunded': return 'badge-error'
      case 'pending': return 'badge-warning'
      default: return 'badge-info'
    }
  }

  const pendingRefundCount = refundRequests.filter(r => r.status === 'pending').length

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('orders.title')}</h1>

      {/* Sub-tabs: Orders / Refunds */}
      <div className="flex gap-1 bg-white p-1 rounded-lg shadow-sm inline-flex mb-6">
        <button
          onClick={() => setSubTab('orders')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            subTab === 'orders' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {t('orders.list') || 'Orders'}
          {pendingRefundCount > 0 && (
            <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{pendingRefundCount}</span>
          )}
        </button>
        <button
          onClick={() => setSubTab('refunds')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            subTab === 'refunds' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {t('orders.refunds') || 'Refunds'}
        </button>
      </div>

      {/* Orders Tab */}
      {subTab === 'orders' && (
        <>
      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-40">
          <option value="">{t('common.all')} {t('orders.status')}</option>
          <option value="pending">{t('orders.pending')}</option>
          <option value="completed">{t('orders.completed')}</option>
          <option value="refunded">{t('orders.refunded')}</option>
        </select>
        <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} className="input w-40">
          <option value="">{t('channels.allChannels') || 'All Channels'}</option>
          {channels.map((ch: any) => (
            <option key={ch.id} value={ch.id}>
              {ch.icon} {ch.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : isError ? (
          <div className="text-center py-8">
            <p className="text-red-500 mb-2">{t('common.error')}</p>
            <p className="text-sm text-gray-500">{String(error?.message || 'Failed to load orders')}</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">{t('common.noData')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">{t('orders.orderNumber')}</th>
                  <th className="pb-3 font-medium">{t('channels.channel') || 'Channel'}</th>
                  <th className="pb-3 font-medium">{t('orders.date')}</th>
                  <th className="pb-3 font-medium">{t('orders.customer')}</th>
                  <th className="pb-3 font-medium">{t('orders.amount')}</th>
                  <th className="pb-3 font-medium">{t('orders.payment')}</th>
                  <th className="pb-3 font-medium">{t('orders.status')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order: any) => (
                  <tr key={order.id} className="border-b last:border-0 hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/finance/orders/${order.id}`)}>
                    <td className="py-3 font-mono text-sm">{order.orderNumber || order.id}</td>
                    <td className="py-3">
                      {order.channel ? (
                        <span className="flex items-center gap-1">
                          <span>{order.channel.icon}</span>
                          <span className="text-sm">{order.channel.name}</span>
                        </span>
                      ) : '-'}
                    </td>
                    <td className="py-3 text-sm">{formatDateTime(order.createdAt)}</td>
                    <td className="py-3">{order.member?.name || order.staff?.name || '-'}</td>
                    <td className="py-3 font-medium">{formatCurrency(order.finalAmount || order.total)}</td>
                    <td className="py-3 capitalize">{order.paymentMethod}</td>
                    <td className="py-3"><span className={`badge ${getStatusBadge(order.status)} capitalize`}>{order.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      )}

      {/* Refunds Tab */}
      {subTab === 'refunds' && (
        <div className="space-y-4">
          {refundRequests.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl">
              <p className="text-gray-500">{t('orders.noRefunds') || 'No refund requests'}</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-500 border-b bg-gray-50">
                    <th className="p-4 font-medium">{t('orders.orderNumber')}</th>
                    <th className="p-4 font-medium">{t('orders.reason')}</th>
                    <th className="p-4 font-medium">{t('orders.requestedBy')}</th>
                    <th className="p-4 font-medium">{t('orders.date')}</th>
                    <th className="p-4 font-medium">{t('orders.status')}</th>
                    <th className="p-4 font-medium">{t('orders.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {refundRequests.map((req) => (
                    <tr key={req.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="p-4 font-mono text-sm">{req.orderNumber}</td>
                      <td className="p-4 text-sm">{req.reason}</td>
                      <td className="p-4 text-sm">{req.requestedByName || '-'}</td>
                      <td className="p-4 text-sm">{formatDateTime(req.createdAt)}</td>
                      <td className="p-4">
                        <span className={`badge ${
                          req.status === 'pending' ? 'badge-warning' :
                          req.status === 'approved' ? 'badge-success' : 'badge-error'
                        }`}>{req.status}</span>
                      </td>
                      <td className="p-4">
                        {req.status === 'pending' && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setSelectedRefund(req); setRefundAction('approve') }}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                              title={t('orders.approve')}
                            >
                              <CheckCircle size={18} />
                            </button>
                            <button
                              onClick={() => { setSelectedRefund(req); setRefundAction('reject') }}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                              title={t('orders.reject')}
                            >
                              <XCircle size={18} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Refund Action Modal */}
      {selectedRefund && refundAction && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-xl p-6 mx-4 pointer-events-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">
              {refundAction === 'approve' ? t('orders.approveRefund') : t('orders.rejectRefund')}
            </h2>
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <p className="font-medium">{selectedRefund.orderNumber}</p>
              <p className="text-sm text-gray-500">{selectedRefund.reason}</p>
            </div>
            {refundAction === 'reject' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('orders.rejectReason')}
                </label>
                <textarea
                  value={refundNote}
                  onChange={(e) => setRefundNote(e.target.value)}
                  rows={3}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder={t('orders.rejectReasonPlaceholder')}
                />
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setSelectedRefund(null); setRefundAction(null); setRefundNote('') }}
                className="flex-1 py-3 border border-gray-200 rounded-xl"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={refundAction === 'approve' ? handleApproveRefund : handleRejectRefund}
                className={`flex-1 py-3 rounded-xl text-white ${
                  refundAction === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {refundAction === 'approve' ? t('common.confirm') : t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}