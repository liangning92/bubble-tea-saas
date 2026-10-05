import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Truck,
  CheckCircle,
  Clock,
  XCircle,
  Plus,
  RefreshCw,
  Volume2,
  VolumeX,
  Filter,
  Loader2
} from 'lucide-react'

interface DeliveryOrder {
  id: string
  platform: 'grabfood' | 'gofood' | 'shopee' | 'direct'
  platformOrderId: string
  customerName: string
  customerPhone: string
  deliveryAddress?: string
  items: {
    productName: string
    specName: string
    quantity: number
    notes?: string
  }[]
  subtotal: number
  deliveryFee: number
  platformFee: number
  finalAmount: number
  status: 'new' | 'confirmed' | 'preparing' | 'ready' | 'picked_up' | 'delivered' | 'cancelled'
  createdAt: string
  estimatedReadyTime?: number
}

const PLATFORM_CONFIG: Record<string, { name: string; color: string; bgColor: string }> = {
  grabfood: { name: 'GrabFood', color: 'text-green-600', bgColor: 'bg-green-500' },
  gofood: { name: 'GoFood', color: 'text-red-600', bgColor: 'bg-red-500' },
  shopee: { name: 'ShopeeFood', color: 'text-orange-600', bgColor: 'bg-orange-500' },
  direct: { name: 'Dine-in', color: 'text-blue-600', bgColor: 'bg-blue-500' }
}

const MOCK_PRODUCTS = ['Pearl Milk Tea', 'Coconut Jelly', 'Mango Smoothie', 'Green Tea', 'Taro', 'Jasmine Tea']
const MOCK_NAMES = ['Customer A', 'Customer B', 'Customer C', 'Customer D', 'Customer E']
const MOCK_STREETS = [
  'Jl. Utama No.' + Math.floor(Math.random() * 999 + 1),
  'Jl. Besar No.' + Math.floor(Math.random() * 999 + 1),
  'Jl. Kecil No.' + Math.floor(Math.random() * 999 + 1),
  'Jl. Raya No.' + Math.floor(Math.random() * 999 + 1)
]

export function DeliveryHubPage() {
  const { t } = useTranslation()
  const [orders, setOrders] = useState<DeliveryOrder[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [filterPlatform, setFilterPlatform] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('active')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Load initial mock data
  useEffect(() => {
    loadMockData()
  }, [])

  const loadMockData = () => {
    setIsLoading(true)
    setTimeout(() => {
      setOrders([
        {
          id: 'DEL-001',
          platform: 'gofood',
          platformOrderId: 'GF-' + Math.random().toString(36).substr(2, 8).toUpperCase(),
          customerName: 'Ahmad Wijaya',
          customerPhone: '08xxxxxxxxxx',
          deliveryAddress: 'Jl. Utama No.' + Math.floor(Math.random() * 999 + 1),
          items: [
            { productName: 'Pearl Milk Tea', specName: 'Large', quantity: 2, notes: 'Less Ice' },
            { productName: 'Coconut Milk Tea', specName: 'Medium', quantity: 1 }
          ],
          subtotal: 65000,
          deliveryFee: 15000,
          platformFee: 5000,
          finalAmount: 75000,
          status: 'new',
          createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
          estimatedReadyTime: 15
        },
        {
          id: 'DEL-002',
          platform: 'grabfood',
          platformOrderId: 'GR-' + Math.random().toString(36).substr(2, 8).toUpperCase(),
          customerName: 'Siti Nurhaliza',
          customerPhone: '08xxxxxxxxxx',
          deliveryAddress: 'Jl. Besar No.' + Math.floor(Math.random() * 999 + 1),
          items: [
            { productName: 'Mango Smoothie', specName: 'Large', quantity: 1 }
          ],
          subtotal: 28000,
          deliveryFee: 12000,
          platformFee: 3000,
          finalAmount: 43200,
          status: 'preparing',
          createdAt: new Date(Date.now() - 12 * 60000).toISOString(),
          estimatedReadyTime: 8
        },
        {
          id: 'DEL-003',
          platform: 'shopee',
          platformOrderId: 'SH-' + Math.random().toString(36).substr(2, 8).toUpperCase(),
          customerName: 'Budi Santoso',
          customerPhone: '08xxxxxxxxxx',
          items: [
            { productName: 'Green Tea', specName: 'Medium', quantity: 3 },
            { productName: 'Pearl Milk Tea', specName: 'Large', quantity: 2 }
          ],
          subtotal: 125000,
          deliveryFee: 18000,
          platformFee: 8000,
          finalAmount: 151000,
          status: 'ready',
          createdAt: new Date(Date.now() - 25 * 60000).toISOString()
        }
      ])
      setIsLoading(false)
    }, 500)
  }

  // Generate random mock order (simulating new order from platform)
  const generateMockOrder = () => {
    const platforms: ('grabfood' | 'gofood' | 'shopee' | 'direct')[] = ['grabfood', 'gofood', 'shopee']
    const platform = platforms[Math.floor(Math.random() * platforms.length)]
    const platformPrefix = platform === 'grabfood' ? 'GR' : platform === 'gofood' ? 'GF' : 'SH'

    const order: DeliveryOrder = {
      id: 'DEL-' + Date.now(),
      platform,
      platformOrderId: platformPrefix + '-' + Math.random().toString(36).substr(2, 8).toUpperCase(),
      customerName: MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)],
      customerPhone: '08' + Math.floor(Math.random() * 1000000000).toString(),
      deliveryAddress: Math.random() > 0.3 ? MOCK_STREETS[Math.floor(Math.random() * MOCK_STREETS.length)] : undefined,
      items: [
        {
          productName: MOCK_PRODUCTS[Math.floor(Math.random() * MOCK_PRODUCTS.length)],
          specName: Math.random() > 0.5 ? 'Large' : 'Medium',
          quantity: Math.floor(Math.random() * 3) + 1,
          notes: Math.random() > 0.7 ? 'Less Ice/No Ice' : undefined
        }
      ],
      subtotal: Math.floor(Math.random() * 100000) + 20000,
      deliveryFee: 15000,
      platformFee: Math.floor(Math.random() * 10000) + 3000,
      finalAmount: 0,
      status: 'new',
      createdAt: new Date().toISOString(),
      estimatedReadyTime: Math.floor(Math.random() * 20) + 10
    }
    // 注意: 这是 mock 数据计算，实际 finalAmount 应由服务端根据真实订单数据计算
    order.finalAmount = order.subtotal + order.deliveryFee - order.platformFee

    setOrders(prev => [order, ...prev])

    if (soundEnabled && audioRef.current) {
      audioRef.current.play().catch(() => {})
    }
  }

  // Update order status
  const updateOrderStatus = (orderId: string, newStatus: string) => {
    setOrders(prev => prev.map(order =>
      order.id === orderId ? { ...order, status: newStatus as DeliveryOrder['status'] } : order
    ))
  }

  // Filter orders
  const filteredOrders = orders.filter(order => {
    if (filterPlatform !== 'all' && order.platform !== filterPlatform) return false
    if (filterStatus === 'active' && ['delivered', 'cancelled'].includes(order.status)) return false
    if (filterStatus === 'new' && order.status !== 'new') return false
    if (filterStatus === 'preparing' && order.status !== 'preparing') return false
    if (filterStatus === 'ready' && order.status !== 'ready') return false
    return true
  })

  // Get status summary
  const getSummary = () => ({
    new: orders.filter(o => o.status === 'new').length,
    confirmed: orders.filter(o => o.status === 'confirmed').length,
    preparing: orders.filter(o => o.status === 'preparing').length,
    ready: orders.filter(o => o.status === 'ready').length,
    picked_up: orders.filter(o => o.status === 'picked_up').length,
    total: orders.length
  })

  const summary = getSummary()

  // Format time ago
  const formatTimeAgo = (dateStr: string) => {
    const minutes = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
    if (minutes < 1) return t('delivery.justNow')
    if (minutes < 60) return `${minutes}m ${t('delivery.ago')}`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ${minutes % 60}m ${t('delivery.ago')}`
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount)
  }

  // Get status config
  const getStatusConfig = (status: string) => {
    const configs: Record<string, { label: string; bg: string; text: string; nextLabel?: string }> = {
      new: { label: t('delivery.new'), bg: 'bg-yellow-100', text: 'text-yellow-800', nextLabel: t('delivery.confirm') },
      confirmed: { label: t('delivery.confirmed'), bg: 'bg-blue-100', text: 'text-blue-800', nextLabel: t('delivery.startPrepare') },
      preparing: { label: t('delivery.preparing'), bg: 'bg-purple-100', text: 'text-purple-800', nextLabel: t('delivery.markReady') },
      ready: { label: t('delivery.ready'), bg: 'bg-green-100', text: 'text-green-800', nextLabel: t('delivery.pickedUp') },
      picked_up: { label: t('delivery.pickedUp'), bg: 'bg-indigo-100', text: 'text-indigo-800', nextLabel: t('delivery.delivered') },
      delivered: { label: t('delivery.delivered'), bg: 'bg-green-100', text: 'text-green-800' },
      cancelled: { label: t('delivery.cancelled'), bg: 'bg-red-100', text: 'text-red-800' }
    }
    return configs[status] || { label: status, bg: 'bg-gray-100', text: 'text-gray-800' }
  }

  // Get next status
  const getNextStatus = (status: string) => {
    const next: Record<string, string> = {
      new: 'confirmed',
      confirmed: 'preparing',
      preparing: 'ready',
      ready: 'picked_up',
      picked_up: 'delivered'
    }
    return next[status]
  }

  // Get platform label
  const getPlatformLabel = (platform: string) => {
    const labels: Record<string, string> = {
      grabfood: t('delivery.grabfood'),
      gofood: t('delivery.gofood'),
      shopee: t('delivery.shopee'),
      direct: t('delivery.direct')
    }
    return labels[platform] || platform
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hidden audio for notifications */}
      <audio ref={audioRef} preload="auto">
        <source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQIAE3eJ4Pl7AAAUiIqmtrWYdCsKZn/DyqF2AAAJ" type="audio/wav" />
      </audio>

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
              <Truck className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{t('delivery.title')}</h1>
              <p className="text-sm text-gray-500">
                {summary.total} {t('delivery.orders')} • {summary.new} {t('delivery.new')} • {summary.preparing} {t('delivery.preparing')} • {summary.ready} {t('delivery.ready')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={generateMockOrder}
              className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm font-medium flex items-center gap-1"
            >
              <Plus size={18} />
              {t('delivery.simulate')}
            </button>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-lg ${soundEnabled ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}
            >
              {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
            <button
              onClick={loadMockData}
              disabled={isLoading}
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 disabled:opacity-50"
            >
              <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="p-4 grid grid-cols-5 gap-3">
        <StatCard
          icon={Clock}
          label={t('delivery.new')}
          count={summary.new}
          bgColor="yellow"
          highlight={summary.new > 0}
        />
        <StatCard
          icon={CheckCircle}
          label={t('delivery.confirmed')}
          count={summary.confirmed}
          bgColor="blue"
        />
        <StatCard
          icon={Clock}
          label={t('delivery.preparing')}
          count={summary.preparing}
          bgColor="purple"
        />
        <StatCard
          icon={CheckCircle}
          label={t('delivery.ready')}
          count={summary.ready}
          bgColor="green"
        />
        <StatCard
          icon={Truck}
          label={t('delivery.pickedUp')}
          count={summary.picked_up}
          bgColor="indigo"
        />
      </div>

      {/* Filters */}
      <div className="px-4 pb-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-400" />
          <select
            value={filterPlatform}
            onChange={(e) => setFilterPlatform(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="all">{t('common.all')} {t('delivery.platform')}</option>
            <option value="grabfood">{t('delivery.grabfood')}</option>
            <option value="gofood">{t('delivery.gofood')}</option>
            <option value="shopee">{t('delivery.shopee')}</option>
            <option value="direct">{t('delivery.direct')}</option>
          </select>
        </div>

        <div className="flex gap-2">
          {[
            { key: 'active', label: t('delivery.active') },
            { key: 'new', label: `${t('delivery.new')} (${summary.new})` },
            { key: 'preparing', label: `${t('delivery.preparing')} (${summary.preparing})` },
            { key: 'ready', label: `${t('delivery.ready')} (${summary.ready})` }
          ].map(filter => (
            <button
              key={filter.key}
              onClick={() => setFilterStatus(filter.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filterStatus === filter.key
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List */}
      <div className="px-4 pb-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl">
            <Truck size={64} className="mb-4 text-gray-300" />
            <p className="text-lg font-medium text-gray-500">{t('delivery.noOrders')}</p>
            <p className="text-sm text-gray-400">{t('delivery.noOrdersHint')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map(order => {
              const platform = PLATFORM_CONFIG[order.platform]
              const statusConfig = getStatusConfig(order.status)
              const nextStatus = getNextStatus(order.status)

              return (
                <div key={order.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  {/* Order Header */}
                  <div className="p-4 flex items-center justify-between bg-gray-50 border-b border-gray-200">
                    <div className="flex items-center gap-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium text-white ${platform.bgColor}`}>
                        {getPlatformLabel(order.platform)}
                      </span>
                      <div>
                        <p className="font-bold text-gray-900">{order.platformOrderId}</p>
                        <p className="text-xs text-gray-500">{formatTimeAgo(order.createdAt)}</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
                      {statusConfig.label}
                    </span>
                  </div>

            