import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { posApi } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { formatCurrency, formatDateTime } from '../utils/helpers'
import { showToast } from '../components/ui'
import { ArrowLeft, RefreshCw, AlertTriangle, Trash2 } from 'lucide-react'

interface Order {
  id: string
  orderNumber: string
  totalAmount: number
  finalAmount: number
  discountAmount: number
  paymentMethod: string
  status: string
  createdAt: string
  channel?: string
  items: Array<{
    productId?: string
    name: string
    quantity: number
    price: number
    addons?: Array<{ name: string; price: number }>
  }>
  memberName?: string
  staffName?: string
}

export function OrderHistoryPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [showRefundModal, setShowRefundModal] = useState(false)
  const [refundReason, setRefundReason] = useState('')
  const [refundSubmitting, setRefundSubmitting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')

  const loadTodayOrders = useCallback(async () => {
    setIsLoading(true)
    try {
      // Always show only today's orders (Jakarta timezone)
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(new Date())
      const getPart = (type: string) => parts.find(p => p.type === type)?.value || '01'
      const today = `${getPart('year')}-${getPart('month')}-${getPart('day')}`

      const res = await posApi.getOrders({ storeId: user?.storeId, date: today })
      setOrders(res.data?.data?.list || [])
    } catch (error) {
      console.error('Failed to load orders:', error)
    } finally {
      setIsLoading(false)
    }
  }, [user?.storeId])

  // Load orders on mount
  useEffect(() => {
    loadTodayOrders()
  }, [loadTodayOrders])

  const getPaymentLabel = (method: string) => {
    const labels: Record<string, string> = {
      cash: t('pos.cash'),
      gopay: t('pos.gopay'),
      ovo: t('pos.ovo'),
      dana: t('pos.dana'),
      shopeepay: t('pos.shopeepay')
    }
    return labels[method] || method
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      completed: t('orders.completed'),
      pending: t('orders.pending'),
      preparing: t('orders.preparing'),
      refunded: t('orders.refunded'),
      cancelled: t('orders.cancelled')
    }
    return labels[status] || status
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      completed: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      preparing: 'bg-blue-100 text-blue-800',
      refunded: 'bg-gray-100 text-gray-600',
      cancelled: 'bg-red-100 text-red-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-600'
  }

  // Delete order (cashier mistake)
  const handleDeleteOrder = async () => {
    if (!selectedOrder || !deleteReason.trim()) {
      showToast(t('orders.deleteReasonRequired'), 'error')
      return
    }

    setRefundSubmitting(true)
    try {
      await posApi.requestRefund({ orderId: selectedOrder.id, reason: deleteReason, staffId: user?.staff?.id })
      showToast(t('orders.deleteSuccess'), 'success')
      setShowDeleteModal(false)
      setSelectedOrder(null)
      setDeleteReason('')
      loadTodayOrders()
    } catch {
      showToast(t('orders.deleteFailed'), 'error')
    } finally {
      setRefundSubmitting(false)
    }
  }

  // Refund request submit
  const handleRefundSubmit = async () => {
    if (!selectedOrder || !refundReason.trim()) {
      showToast(t('orders.refundReasonRequired'), 'error')
      return
    }
    setRefundSubmitting(true)
    try {
      await posApi.requestRefund({ orderId: selectedOrder.id, reason: refundReason, staffId: user?.staff?.id })
      showToast(t('orders.refundSubmitted'), 'success')
      setShowRefundModal(false)
      setRefundReason('')
      setSelectedOrder(null)
      loadTodayOrders()
    } catch {
      showToast(t('orders.refundFailed'), 'error')
    } finally {
      setRefundSubmitting(false)
    }
  }

  const handleRebuy = (order: Order) => {
    const cartItems = order.items.map(item => ({
      productId: item.productId || '',
      productName: item.name,
      specId: item.name,
      specName: item.name,
      unitPrice: item.price,
      quantity: item.quantity,
      addons: item.addons?.map(a => ({ id: '', name: a.name, price: a.price, qty: 1 })) || []
    }))
    try {
      localStorage.setItem('rebuy_items', JSON.stringify(cartItems))
      showToast(t('orders.rebuyAdded'), 'success')
      navigate('/')
    } catch {
      showToast('Failed to process rebuy', 'error')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-bold">{t('orders.todayOrders')}</h1>
            <p className="text-xs text-gray-500">
              {new Date().toLocaleDateString()}
            </p>
          </div>
          <button onClick={loadTodayOrders} className="ml-auto p-2 hover:bg-gray-100 rounded-lg">
            <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* Order List */}
      <div className="p-4 space-y-3">
        {orders.length === 0 && !isLoading && (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">{t('orders.noOrdersToday')}</p>
            <p className="text-sm mt-2">{t('orders.noOrdersHint')}</p>
          </div>
        )}

        {orders.map((order) => (
          <div
            key={order.id}
            className="bg-white rounded-xl p-4 shadow-sm"
            onClick={() => setSelectedOrder(order)}
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="font-bold">{order.orderNumber}</p>
                <p className="text-xs text-gray-500">{formatDateTime(order.createdAt)}</p>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                {getStatusLabel(order.status)}
              </span>
            </div>
            <div className="text-sm text-gray-600 mb-2">
              {order.items.slice(0, 3).map((item, i) => (
                <p key={i}>{item.quantity}x {item.name}</p>
              ))}
              {order.items.length > 3 && <p className="text-gray-400">+{order.items.length - 3} {t('orders.more')}</p>}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">{getPaymentLabel(order.paymentMethod)}</span>
              <span className="font-bold text-lg">{formatCurrency(order.finalAmount)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Order Detail Drawer */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setSelectedOrder(null)}>
          <div
            className="absolute right-0 top-0 bottom-0 w-[90%] max-w-md bg-white shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
              <h2 className="font-bold">{selectedOrder.orderNumber}</h2>
              <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <span className="sr-only">Close</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-gray-500">{t('orders.status')}</p>
                  <p className="font-medium">{getStatusLabel(selectedOrder.status)}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-gray-500">{t('orders.channel')}</p>
                  <p className="font-medium">{selectedOrder.channel || '-'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-gray-500">{t('orders.paymentMethod')}</p>
                  <p className="font-medium">{getPaymentLabel(selectedOrder.paymentMethod)}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-gray-500">{t('orders.time')}</p>
                  <p className="font-medium">{formatDateTime(selectedOrder.createdAt)}</p>
                </div>
              </div>

              {/* Items List */}
              <div>
                <h3 className="font-medium mb-2">{t('orders.itemsList')}</h3>
                <div className="space-y-2">
                  {selectedOrder.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{item.quantity}x {item.name}</span>
                      <span>{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Amount Summary */}
              <div className="border-t pt-4 space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{t('orders.total')}</span>
                  <span>{formatCurrency(selectedOrder.totalAmount)}</span>
                </div>
                {selectedOrder.discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>{t('orders.discount')}</span>
                    <span>-{formatCurrency(selectedOrder.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>{t('orders.actualReceived')}</span>
                  <span className="text-primary">{formatCurrency(selectedOrder.finalAmount)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4 border-t">
                <button
                  onClick={() => handleRebuy(selectedOrder)}
                  className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-medium"
                >
                  {t('orders.rebuy')}
                </button>
                {(selectedOrder.status === 'completed' || selectedOrder.status === 'pending') && (
                  <button
                    onClick={() => setShowRefundModal(true)}
                    className="flex-1 py-3 border border-red-200 text-red-500 rounded-xl font-medium"
                  >
                    {t('orders.refund')}
                  </button>
                )}
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="py-3 px-4 border border-gray-200 rounded-xl"
                  title={t('orders.deleteOrder')}
                >
                  <Trash2 size={20} className="text-gray-400" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-white rounded-xl w-[90%] max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <AlertTriangle className="text-red-500" />
              {t('orders.deleteOrderConfirm')}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {t('orders.deleteOrderHint')}
            </p>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder={t('orders.deleteReasonPlaceholder')}
              className="w-full p-3 border rounded-xl mb-4"
              rows={3}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-3 border rounded-xl"
              >
                {t('orders.cancel')}
              </button>
              <button
                onClick={handleDeleteOrder}
                disabled={refundSubmitting}
                className="flex-1 py-3 bg-red-500 text-white rounded-xl disabled:opacity-50"
              >
                {refundSubmitting ? t('orders.processing') : t('orders.confirmDelete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Request Modal */}
      {showRefundModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white w-[90%] max-w-md rounded-xl overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2">
                <AlertTriangle size={20} className="text-red-500" />
                {t('orders.refundModalTitle')}
              </h3>
              <button onClick={() => { setShowRefundModal(false); setRefundReason('') }} className="p-2 hover:bg-gray-100 rounded-lg">
                <span className="sr-only">Close</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-500">{t('orders.orderNumber')}</p>
                <p className="font-medium">{selectedOrder.orderNumber}</p>
                <p className="text-sm text-gray-500 mt-2">{t('orders.refundAmount')}</p>
                <p className="font-bold text-lg text-red-500">{formatCurrency(selectedOrder.finalAmount)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('orders.refundReason')}</label>
                <textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder={t('orders.refundReasonPlaceholder')}
                  rows={3}
                  className="w-full p-3 border rounded-xl resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowRefundModal(false); setRefundReason('') }}
                  className="flex-1 py-3 border rounded-xl"
                >
                  {t('orders.cancel')}
                </button>
                <button
                  onClick={handleRefundSubmit}
                  disabled={refundSubmitting || !refundReason.trim()}
                  className="flex-1 py-3 bg-red-500 text-white rounded-xl disabled:opacity-50"
                >
                  {refundSubmitting ? t('orders.submitting') : t('orders.confirmSubmit')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
