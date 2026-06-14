import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { orderApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import {
  ChefHat,
  Clock,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Volume2,
  VolumeX,
  Loader2
} from 'lucide-react'

interface KDSOrder {
  id: string
  orderNumber: string
  status: 'pending' | 'preparing' | 'ready'
  items: {
    productName: string
    specName: string
    quantity: number
    addons?: string
  }[]
  createdAt: string
  staffName?: string
  platform?: 'grabfood' | 'gofood' | 'shopee' | 'direct'
  elapsedMinutes?: number
}

const PLATFORM_COLORS = {
  grabfood: 'bg-green-100 text-green-800 border-green-200',
  gofood: 'bg-red-100 text-red-800 border-red-200',
  shopee: 'bg-orange-100 text-orange-800 border-orange-200',
  direct: 'bg-blue-100 text-blue-800 border-blue-200'
}

export function KDSPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [lastOrderCount, setLastOrderCount] = useState(0)

  // Fetch KDS orders
  const { data: ordersData, isLoading, refetch } = useQuery({
    queryKey: ['kds-orders'],
    queryFn: () => orderApi.getKDS(user?.storeId || '', { limit: 50 }),
    refetchInterval: 5000 // Refresh every 5 seconds for real-time updates
  })

  const orders: KDSOrder[] = ordersData?.data?.data?.list || []

  // Play sound when new orders arrive
  useEffect(() => {
    if (soundEnabled && orders.length > lastOrderCount && lastOrderCount > 0) {
      if (audioRef.current) {
        audioRef.current.play().catch(() => {})
      }
    }
    setLastOrderCount(orders.length)
  }, [orders.length, lastOrderCount, soundEnabled])

  // Update order status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      orderApi.updateStatus(orderId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kds-orders'] })
    }
  })

  // Calculate elapsed time and check for overdue
  const processedOrders = orders.map(order => {
    const createdAt = new Date(order.createdAt)
    const now = new Date()
    const elapsedMinutes = Math.floor((now.getTime() - createdAt.getTime()) / 60000)
    return { ...order, elapsedMinutes }
  })

  const filteredOrders = filterStatus === 'all'
    ? processedOrders
    : processedOrders.filter(o => o.status === filterStatus)

  // Get next status action
  const getNextAction = (status: string) => {
    switch (status) {
      case 'pending':
        return { label: t('kds.startPrepare'), status: 'preparing', color: 'bg-blue-500 hover:bg-blue-600' }
      case 'preparing':
        return { label: t('kds.markReady'), status: 'ready', color: 'bg-green-500 hover:bg-green-600' }
      default:
        return null
    }
  }

  // Get status config
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'pending':
        return { bg: 'bg-yellow-50 border-yellow-200', badge: 'bg-yellow-100 text-yellow-800', label: t('kds.new') }
      case 'preparing':
        return { bg: 'bg-blue-50 border-blue-200', badge: 'bg-blue-100 text-blue-800', label: t('kds.preparing') }
      case 'ready':
        return { bg: 'bg-green-50 border-green-200', badge: 'bg-green-100 text-green-800', label: t('kds.ready') }
      default:
        return { bg: 'bg-gray-50 border-gray-200', badge: 'bg-gray-100 text-gray-800', label: status }
    }
  }

  // Get platform label
  const getPlatformLabel = (platform?: string) => {
    switch (platform) {
      case 'grabfood': return 'GrabFood'
      case 'gofood': return 'GoFood'
      case 'shopee': return 'ShopeeFood'
      case 'direct': return t('delivery.direct')
      default: return ''
    }
  }

  // Count by status
  const pendingCount = processedOrders.filter(o => o.status === 'pending').length
  const preparingCount = processedOrders.filter(o => o.status === 'preparing').length
  const readyCount = processedOrders.filter(o => o.status === 'ready').length

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Sound Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-lg ${soundEnabled ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'} hover:opacity-80`}
              title={soundEnabled ? t('kds.soundOn') : t('kds.soundOff')}
            >
              {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>

            {/* Status Filter */}
            <div className="flex gap-2">
              {[
                { key: 'all', label: t('common.all') },
                { key: 'pending', label: t('kds.new') },
                { key: 'preparing', label: t('kds.preparing') },
                { key: 'ready', label: t('kds.ready') }
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilterStatus(key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filterStatus === key
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Refresh */}
            <button
              onClick={() => refetch()}
              disabled={isLoading || updateStatusMutation.isPending}
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
            >
              <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </header>

      {/* Orders Grid */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <ChefHat size={64} className="mb-4 opacity-50" />
            <p className="text-lg">{t('kds.noOrders')}</p>
            <p className="text-sm">{t('kds.noOrdersHint')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredOrders.map(order => {
              const statusConfig = getStatusConfig(order.status)
              const nextAction = getNextAction(order.status)
              const isOverdue = order.elapsedMinutes && order.elapsedMinutes > 15

              return (
                <div
                  key={order.id}
                  className={`rounded-xl border-2 ${statusConfig.bg} ${
                    isOverdue && order.status !== 'ready' ? 'ring-2 ring-red-400 animate-pulse' : ''
                  }`}
                >
                  {/* Order Header */}
                  <div className="p-4 border-b border-gray-200">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-lg font-bold font-mono">{order.orderNumber}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(order.createdAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusConfig.badge}`}>
                        {statusConfig.label}
                      </span>
                    </div>

                    {/* Platform Badge */}
                    {order.platform && (
                      <div className="mt-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium border ${PLATFORM_COLORS[order.platform]}`}>
                          {getPlatformLabel(order.platform)}
                        </span>
                      </div>
                    )}

                    {/* Timer */}
                    <div className={`mt-2 flex items-center gap-1 text-sm ${
                      isOverdue ? 'text-red-600 font-bold' : 'text-gray-500'
                    }`}>
                      <Clock size={14} />
                      <span>{order.elapsedMinutes} {t('kds.minutes')}</span>
                      {isOverdue && <AlertCircle size={14} className="text-red-600" />}
                   </div>
                  </div>

                  {/* Order Items */}
                  <div className="p-4 space-y-2">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="w-7 h-7 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                          {item.quantity}
                        </span>
                        <div className="flex-1">
                          <p className="font-medium">{item.productName}</p>
                          <p className="text-sm text-gray-500">{item.specName}</p>
                          {item.addons && (
                            <p className="text-xs text-gray-400">+ {item.addons}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="p-4 border-t border-gray-200">
                    {nextAction ? (
                      <button
                        onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: nextAction.status })}
                        disabled={updateStatusMutation.isPending}
                        className={`w-full py-3 rounded-lg text-white font-medium transition-colors disabled:opacity-50 ${nextAction.color}`}
                      >
                        {updateStatusMutation.isPending ? (
                          <Loader2 size={18} className="animate-spin mx-auto" />
                        ) : (
                          nextAction.label
                        )}
                      </button>
                    ) : (
                      <div className="flex items-center justify-center gap-2 py-3 bg-green-100 text-green-800 rounded-lg font-medium">
                        <CheckCircle size={18} />
                        <span>{t('kds.readyToServe')}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Audio element for notifications */}
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />

      {/* Summary Bar */}
      <footer className="bg-white border-t border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-6">
            <span className="text-gray-500">
              <span className="font-bold text-yellow-600">{pendingCount}</span> {t('kds.new')}
            </span>
            <span className="text-gray-500">
              <span className="font-bold text-blue-600">{preparingCount}</span> {t('kds.preparing')}
            </span>
            <span className="text-gray-500">
              <span className="font-bold text-green-600">{readyCount}</span> {t('kds.ready')}
            </span>
          </div>
          <div className="text-gray-400">
            {t('kds.lastUpdated')}: {new Date().toLocaleTimeString('id-ID')}
          </div>
        </div>
      </footer>
    </div>
  )
}