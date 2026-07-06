import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { formatCurrency } from '../utils/helpers'

interface OrderItem {
  id: string
  productName: string
  specName: string
  quantity: number
  unitPrice: number
  addons: { name: string; price: number }[]
}

interface OrderData {
  items: OrderItem[]
  subtotal: number
  ppn: number
  discount: number
  total: number
}

interface MediaFile {
  url: string
  filename: string
  mimetype: string
  isVideo: boolean
}

type ColumnContent = 'media' | 'promotions' | 'welcome' | 'order' | 'logo'

interface LayoutColumn {
  width: number
  content: ColumnContent
}

interface Layout {
  columns: LayoutColumn[]
}

interface DualScreenConfig {
  enabled: boolean
  idleLayout: Layout
  orderingLayout: Layout
  welcomeText: string
  mediaFiles: MediaFile[]
  promotions: string[]
}

// Default promotions
const DEFAULT_PROMOTIONS = ['🧋', '🍓', '💳', '🎁']

// Default layouts
const DEFAULT_IDLE_LAYOUT: Layout = {
  columns: [
    { width: 60, content: 'media' },
    { width: 40, content: 'promotions' },
  ]
}

const DEFAULT_ORDERING_LAYOUT: Layout = {
  columns: [
    { width: 30, content: 'media' },
    { width: 70, content: 'order' },
  ]
}

export function CustomerDisplayPage() {
  const { t } = useTranslation()
  const [orderData, setOrderData] = useState<OrderData | null>(null)
  const [orderComplete, setOrderComplete] = useState<{ show: boolean; orderNumber: string }>({
    show: false,
    orderNumber: ''
  })
  const [currentPromotion, setCurrentPromotion] = useState(0)
  const [displayState, setDisplayState] = useState<'idle' | 'ordering' | 'paying' | 'complete'>('idle')
  const [dualScreenConfig, setDualScreenConfig] = useState<DualScreenConfig>({
    enabled: false,
    idleLayout: DEFAULT_IDLE_LAYOUT,
    orderingLayout: DEFAULT_ORDERING_LAYOUT,
    welcomeText: 'Bubble Tea Malaysia',
    mediaFiles: [],
    promotions: DEFAULT_PROMOTIONS,
  })
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Load dualScreen config from localStorage
  useEffect(() => {
    const savedConfig = localStorage.getItem('dualScreenConfig')
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig)
        setDualScreenConfig({
          ...config,
          idleLayout: config.idleLayout || DEFAULT_IDLE_LAYOUT,
          orderingLayout: config.orderingLayout || DEFAULT_ORDERING_LAYOUT,
        })
      } catch (e) {
        console.error('Failed to parse dualScreenConfig:', e)
      }
    }
  }, [])

  const mediaFiles = dualScreenConfig.mediaFiles || []
  const promotions = dualScreenConfig.promotions?.length > 0 ? dualScreenConfig.promotions : DEFAULT_PROMOTIONS

  // Get current layout based on display state
  const currentLayout = displayState === 'idle'
    ? dualScreenConfig.idleLayout || DEFAULT_IDLE_LAYOUT
    : displayState === 'complete'
      ? null
      : dualScreenConfig.orderingLayout || DEFAULT_ORDERING_LAYOUT

  // Auto-rotate media (images or promotions)
  useEffect(() => {
    if (displayState !== 'idle') return

    // If has media files, rotate through them
    if (mediaFiles.length > 0) {
      const interval = setInterval(() => {
        setCurrentMediaIndex(p => (p + 1) % mediaFiles.length)
      }, 10000) // 10 seconds per media
      return () => clearInterval(interval)
    }

    // Otherwise rotate promotions
    const interval = setInterval(() => {
      setCurrentPromotion(p => (p + 1) % promotions.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [displayState, mediaFiles.length, promotions.length])

  // Auto-play video when it's the current media
  useEffect(() => {
    if (displayState === 'idle' && mediaFiles.length > 0 && videoRef.current) {
      const currentMedia = mediaFiles[currentMediaIndex]
      if (currentMedia?.isVideo) {
        videoRef.current.play().catch(() => {})
      }
    }
  }, [currentMediaIndex, displayState, mediaFiles])

  // Listen for order updates from main screen via Electron IPC
  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api) return

    api.onOrderUpdate((data: OrderData) => {
      setOrderData(data)
      setDisplayState('ordering')
      setOrderComplete({ show: false, orderNumber: '' })
    })

    api.onOrderClear(() => {
      setOrderData(null)
      setDisplayState('idle')
    })

    api.onOrderComplete((orderNumber: string) => {
      setDisplayState('complete')
      setOrderComplete({ show: true, orderNumber })
      setTimeout(() => {
        setDisplayState('idle')
        setOrderComplete({ show: false, orderNumber: '' })
      }, 5000)
    })
  }, [])

  const promotion = promotions[currentPromotion]
  const currentMedia = mediaFiles[currentMediaIndex]

  // Render column content based on type
  const renderColumnContent = (content: ColumnContent, isVideoRef?: React.RefObject<HTMLVideoElement | null>) => {
    switch (content) {
      case 'media':
        if (mediaFiles.length > 0) {
          const media = mediaFiles[currentMediaIndex]
          if (media?.isVideo) {
            return (
              <video
                ref={isVideoRef as React.RefObject<HTMLVideoElement>}
                src={media.url}
                className="w-full h-full object-contain"
                autoPlay
                loop
                muted
                playsInline
              />
            )
          }
          return <img src={media?.url} alt="" className="w-full h-full object-contain" />
        }
        return (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-500 to-pink-600 text-white">
            <span className="text-6xl">{promotion}</span>
          </div>
        )
      case 'promotions':
        return (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-500 to-purple-600 text-white p-4">
            <div className="text-5xl mb-4">{promotion}</div>
            <div className="text-xl text-center">{dualScreenConfig.welcomeText || 'Welcome'}</div>
            <div className="flex gap-2 mt-4">
              {promotions.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full ${i === currentPromotion ? 'bg-white' : 'bg-white/40'}`}
                />
              ))}
            </div>
          </div>
        )
      case 'welcome':
        return (
          <div className="w-full h-full flex items-center justify-center bg-gray-800 text-white">
            <span className="text-3xl font-bold">{dualScreenConfig.welcomeText || 'Welcome'}</span>
          </div>
        )
      case 'order':
        return (
          <div className="w-full h-full flex flex-col bg-gray-50">
            <div className="bg-primary text-white py-3 px-4 text-center font-bold">Your Order</div>
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {orderData?.items.map((item) => (
                <div key={item.id} className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🧋</span>
                    <div>
                      <p className="font-bold">{item.productName}</p>
                      <p className="text-gray-500 text-sm">{item.specName}</p>
                      {item.addons.length > 0 && (
                        <p className="text-gray-400 text-xs">+ {item.addons.map(a => a.name).join(', ')}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary">{formatCurrency(item.unitPrice * item.quantity)}</p>
                    <p className="text-gray-500 text-sm">x{item.quantity}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-white border-t p-4">
              <div className="space-y-1 mb-3">
                <div className="flex justify-between text-gray-500 text-sm">
                  <span>Subtotal</span>
                  <span>{formatCurrency(orderData?.subtotal || 0)}</span>
                </div>
                <div className="flex justify-between text-gray-500 text-sm">
                  <span>Tax</span>
                  <span>{formatCurrency(orderData?.ppn || 0)}</span>
                </div>
                {(orderData?.discount || 0) > 0 && (
                  <div className="flex justify-between text-green-500 text-sm">
                    <span>Discount</span>
                    <span>-{formatCurrency(orderData?.discount || 0)}</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between font-bold text-xl pt-2 border-t">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(orderData?.total || 0)}</span>
              </div>
              {displayState === 'ordering' && (
                <div className="mt-3 bg-yellow-100 text-yellow-800 py-2 rounded-lg text-center text-sm font-medium">
                  Please pay at counter
                </div>
              )}
            </div>
          </div>
        )
      case 'logo':
        return (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <span className="text-8xl">🧋</span>
          </div>
        )
      default:
        return null
    }
  }

  // Order complete state - show thank you message (always full screen)
  if (displayState === 'complete') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-green-600 flex flex-col items-center justify-center text-white">
        <div className="text-8xl mb-6">✓</div>
        <h1 className="text-5xl font-bold mb-2">{t('customerDisplay.thankYou')}</h1>
        <p className="text-2xl opacity-90">
          {t('customerDisplay.orderNumber')}: {orderComplete.orderNumber}
        </p>
        <p className="text-xl mt-8 opacity-80">{t('customerDisplay.pleaseWait')}</p>
      </div>
    )
  }

  // Render dynamic layout
  return (
    <div className="min-h-screen bg-gray-900 flex">
      {currentLayout?.columns.map((col, index) => (
        <div
          key={index}
          className="h-screen overflow-hidden"
          style={{ width: `${col.width}%` }}
        >
          {renderColumnContent(col.content, index === 0 ? videoRef : undefined)}
        </div>
      ))}
    </div>
  )
}
