import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { orderApi } from '../../services/api'
import { formatCurrency, formatDateTime } from '../../utils/helpers'
import { ArrowLeft, Printer, RotateCcw, CheckCircle, Clock, XCircle, Loader2 } from 'lucide-react'

export function OrderDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [refundReason, setRefundReason] = useState('')
  const [showRefund, setShowRefund] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => orderApi.get(id!),
    enabled: !!id
  })

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => orderApi.updateStatus(id!, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order', id] })
  })

  const refundMutation = useMutation({
    mutationFn: (reason: string) => orderApi.refund(id!, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      setShowRefund(false)
    }
  })

  const order = data?.data?.data
  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
  if (!order) return <div className="text-center py-8">{t('common.noData')}</div>

  const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    pending: { label: t('orders.pending'), color: 'bg-yellow-100 text-yellow-700', icon: Clock },
    preparing: { label: t('orders.preparing'), color: 'bg-blue-100 text-blue-700', icon: Clock },
    ready: { label: t('orders.ready'), color: 'bg-green-100 text-green-700', icon: CheckCircle },
    completed: { label: t('orders.completed'), color: 'bg-gray-100 text-gray-700', icon: CheckCircle },
    cancelled: { label: t('orders.cancelled'), color: 'bg-red-100 text-red-700', icon: XCircle },
    refunded: { label: t('orders.refunded'), color: 'bg-red-100 text-red-700', icon: RotateCcw }
  }

  const canRefund = order.status !== 'refunded' && order.status !== 'cancelled'
  const canChangeStatus = order.status !== 'completed' && order.status !== 'cancelled' && order.status !== 'refunded'

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link to="/finance/orders" className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeft size={20} /></Link>
        <h1 className="text-2xl font-bold text-gray-900">{t('orders.orderDetail')}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Order Info */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-gray-500">{t('orders.orderNumber')}</p>
                <p className="text-lg font-bold text-gray-900">{order.orderNumber || order.id}</p>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${statusConfig[order.status]?.color}`}>
                {statusConfig[order.status]?.label}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">{t('orders.date')}:</span> <span className="font-medium">{formatDateTime(order.createdAt)}</span></div>
              <div><span className="text-gray-500">{t('orders.payment')}:</span> <span className="font-medium uppercase">{order.paymentMethod}</span></div>
              {order.member &&<div><span className="text-gray-500">{t('orders.customer')}:</span> <span className="font-medium">{order.member.name} ({order.member.phone})</span></div>}
           </div>
          </div>

          {/* Order Items */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">{t('orders.items')}</h2>
            <div className="space-y-3">
              {order.items?.map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium text-gray-900">{item.productName}</p>
                    <p className="text-sm text-gray-500">{item.specName} x {item.quantity}</p>
                  </div>
                  <p className="font-medium">{formatCurrency(item.price * item.quantity)}</p>
                </div>
              ))}
            </div>
           <div className="mt-4 pt-4 border-t flex justify-between text-lg font-bold">
              <span>{t('common.total')}</span>
              <span className="text-primary">{formatCurrency(order.totalAmount || order.total)}</span>
            </div>
          </div>

          {/* Notes */}
          {order.notes && <div className="card"><h2 className="font-semibold text-gray-900 mb-2">{t('orders.notes')}</h2><p className="text-gray-600">{order.notes}</p></div>}
        </div>

        {/* Actions Sidebar */}
        <div className="space-y-4">
          {canChangeStatus && (
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">{t('orders.updateStatus')}</h2>
              <div className="space-y-2">
                {order.status === 'pending' && <button onClick={() => updateStatusMutation.mutate('preparing')} className="btn-primary w-full">{t('orders.startPrepare')}</button>}
                {order.status === 'preparing' && <button onClick={() => updateStatusMutation.mutate('ready')} className="btn-primary w-full">{t('orders.markReady')}</button>}
                {order.status === 'ready' && <button onClick={() => updateStatusMutation.mutate('completed')} className="btn-primary w-full">{t('orders.complete')}</button>}
              </div>
            </div>
          )}

          {canRefund && (
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">{t('orders.refund')}</h2>
              {!showRefund ? (
                <button onClick={() => setShowRefund(true)} className="btn-danger w-full">{t('orders.refund')}</button>
              ) : (
                <div className="space-y-3">
                  <textarea value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder={t('orders.refundReason')} className="input text-sm" rows={3} />
                  <button onClick={() => refundMutation.mutate(refundReason)} disabled={refundMutation.isPending} className="btn-danger w-full">{refundMutation.isPending ? t('common.loading') : t('common.confirm')}</button>
                  <button onClick={() => setShowRefund(false)} className="btn-secondary w-full">{t('common.cancel')}</button>
                </div>
              )}
            </div>
          )}

          <button onClick={() => window.print()} className="btn-secondary w-full flex items-center justify-center gap-2">
            <Printer size={18} /> {t('orders.printReceipt')}
          </button>
        </div>
      </div>
    </div>
  )
}