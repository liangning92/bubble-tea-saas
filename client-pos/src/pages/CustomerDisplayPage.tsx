import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { formatCurrency } from '../utils/helpers'
import { YOUME_LOGO_RED, YOUME_LOGO_WHITE } from '../assets/logo'

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
  promotionName?: string
  discountNote?: string
  upsellHint?: string
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
  showPromotionDetail?: boolean
  showUpsellHint?: boolean
  autoSyncPromotions?: boolean
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
    welcomeText: 'YOUME',
    mediaFiles: [],
    promotions: DEFAULT_PROMOTIONS,
    showPromotionDetail: true,
    showUpsellHint: true,
    autoSyncPromotions: true,
  })
  const [activePromotions, setActivePromotions] = useState<string[]>([])
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Load dualScreen config from localStorage and listen to real-time updates
  useEffect(() => {
    const loadConfig = () => {
      const savedConfig = localStorage.getItem('dualScreenConfig')
      if (savedConfig) {
        try {
          const config = JSON.parse(savedConfig)
          setDualScreenConfig({
            ...config,
            idleLayout: config.idleLayout || DEFAULT_IDLE_LAYOUT,
            orderingLayout: config.orderingLayout || DEFAULT_ORDERING_LAYOUT,
            showPromotionDetail: config.showPromotionDetail !== false,
            showUpsellHint: config.showUpsellHint !== false,
            autoSyncPromotions: config.autoSyncPromotions !== false,
          })
        } catch (e) {
          console.error('Failed to parse dualScreenConfig:', e)
        }
      }

      // 实时同步 POS 端生效中的营销活动
      const savedActivePromos = localStorage.getItem('pos_active_promotions')
      if (savedActivePromos) {
        try {
          const parsed = JSON.parse(savedActivePromos)
          if (Array.isArray(parsed) && parsed.length > 0) {
            setActivePromotions(parsed)
          }
        } catch (e) {
          console.error('Failed to parse pos_active_promotions:', e)
        }
      }
    }
    loadConfig()
    window.addEventListener('storage', loadConfig)
    return () => window.removeEventListener('storage', loadConfig)
  }, [])

  const mediaFiles = dualScreenConfig.mediaFiles || []
  const promotions = (dualScreenConfig.autoSyncPromotions !== false && activePromotions.length > 0)
    ? activePromotions
    : (dualScreenConfig.promotions?.length > 0 ? dualScreenConfig.promotions : DEFAULT_PROMOTIONS)

  // Use refs to avoid stale closure in interval callbacks
  const mediaFilesRef = useRef(mediaFiles)
  const promotionsRef = useRef(promotions)
  mediaFilesRef.current = mediaFiles
  promotionsRef.current = promotions

  // Get current layout based on display state
  const currentLayout = displayState === 'idle'
    ? dualScreenConfig.idleLayout || DEFAULT_IDLE_LAYOUT
    : displayState === 'complete'
      ? null
      : dualScreenConfig.orderingLayout || DEFAULT_ORDERING_LAYOUT

  // Auto-rotate media (images or promotions)
  useEffect(() => {
    if (displayState !== 'idle') return

    const mf = mediaFilesRef.current
    const pr = promotionsRef.current
    // If has media files, rotate through them
    if (mf.length > 0) {
      const interval = setInterval(() => {
        setCurrentMediaIndex(p => (p + 1) % mf.length)
      }, 10000) // 10 seconds per media
      return () => clearInterval(interval)
    }

    // Otherwise rotate promotions
    const interval = setInterval(() => {
      setCurrentPromotion(p => (p + 1) % pr.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [displayState])

  // Auto-play video when it's the current media
  useEffect(() => {
    if (displayState === 'idle' && mediaFiles.length > 0 && videoRef.current) {
      const currentMedia = mediaFiles[currentMediaIndex]
      if (currentMedia?.isVideo) {
        videoRef.current.play().catch(() => {})
      }
    }
  }, [currentMediaIndex, displayState, mediaFiles])

  const [paymentQr, setPaymentQr] = useState<{ qrImage: string; amount: number; orderNumber?: string } | null>(null)

  // Listen for order updates from main screen via Electron IPC
  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api) return

    api.onOrderUpdate((data: OrderData) => {
      setOrderData(data)
      setDisplayState('ordering')
      setPaymentQr(null)
      setOrderComplete({ show: false, orderNumber: '' })
    })

    api.onOrderClear(() => {
      setOrderData(null)
      setPaymentQr(null)
      setDisplayState('idle')
    })

    api.onOrderComplete((orderNumber: string) => {
      setDisplayState('complete')
      setPaymentQr(null)
      setOrderComplete({ show: true, orderNumber })
      setTimeout(() => {
        setDisplayState('idle')
        setOrderComplete({ show: false, orderNumber: '' })
      }, 5000)
    })

    if (api.onPaymentQr) {
      api.onPaymentQr((qrData: any) => {
        if (qrData && qrData.qrImage) {
          setPaymentQr(qrData)
          setDisplayState('paying')
        } else {
          setPaymentQr(null)
          setDisplayState(prev => (prev === 'paying' ? 'ordering' : prev))
        }
      })
    }
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
      case 'promotions': {
        const isPromoText = typeof promotion === 'string' && promotion.length > 2
        return (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-600 via-pink-600 to-rose-500 text-white p-6 shadow-inner relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-2xl" />
            <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-white/10 rounded-full blur-2xl" />
            <div className="relative z-10 flex flex-col items-center text-center max-w-md w-full">
              {isPromoText ? (
                <div className="bg-white/15 backdrop-blur-md border border-white/20 p-6 rounded-2xl shadow-xl w-full">
                  <span className="inline-block px-3 py-1 bg-yellow-400 text-purple-950 font-black text-xs rounded-full mb-3 tracking-wider uppercase">
                    {t('pos.specialOffer')}
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-extrabold tracking-wide mb-2 leading-tight drop-shadow-sm">
                    {promotion}
                  </h3>
                  <p className="text-white/80 text-sm">
                    {dualScreenConfig.welcomeText || t('customer_welcome', 'Welcome')}
                  </p>
                </div>
              ) : (
                <>
                  <div className="text-6xl mb-4 animate-bounce">{promotion}</div>
                  <div className="text-2xl font-bold tracking-wide text-center drop-shadow-sm">
                    {dualScreenConfig.welcomeText || t('customer_welcome', 'Welcome')}
                  </div>
                </>
              )}
              <div className="flex gap-2 mt-6">
                {promotions.map((_, i) => (
                  <div
                    key={i}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      i === currentPromotion ? 'w-6 bg-white' : 'w-2 bg-white/40'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        )
      }
      case 'welcome': {
        const storeLogo = (typeof window !== 'undefined' && localStorage.getItem('pos_store_logo')) || ''
        return (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-pink-500 to-pink-600 p-8 text-white">
            <img
              src={((storeLogo && !storeLogo.startsWith('/youme-logo')) ? storeLogo : '') || YOUME_LOGO_WHITE}
              alt="YOUME"
              onError={(e) => {
                const target = e.currentTarget as HTMLImageElement
                target.onerror = null
                target.src = YOUME_LOGO_WHITE
              }}
              className="max-w-[80%] max-h-48 object-contain mb-6 drop-shadow-lg"
            />
            {dualScreenConfig.welcomeText && (
              <h2 className="text-3xl font-bold text-center tracking-wide">{dualScreenConfig.welcomeText}</h2>
            )}
          </div>
        )
      }
      case 'order':
        return (
          <div className="w-full h-full flex flex-col bg-gray-50">
            <div className="bg-primary text-white py-3 px-4 text-center font-bold">{t('pos.cart', 'Your Order')}</div>
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {orderData?.items.map((item) => (
                <div key={item.id} className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">✨</span>
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

            {/* 智能凑单 / 促单诱导横幅 (Upsell Hint) */}
            {dualScreenConfig.showUpsellHint !== false && orderData?.upsellHint && (
              <div className="mx-4 mb-2 p-2.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-orange-200 rounded-xl flex items-center justify-between text-orange-800 text-xs sm:text-sm font-medium animate-pulse shadow-sm">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">✨</span>
                  <span>{orderData.upsellHint}</span>
                </div>
                <span className="bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider whitespace-nowrap">
                  {t('pos.promoDeal')}
                </span>
              </div>
            )}

            <div className="bg-white border-t p-4">
              <div className="space-y-1 mb-3">
                <div className="flex justify-between text-gray-500 text-sm">
                  <span>{t('pos.subtotal', 'Subtotal')}</span>
                  <span>{formatCurrency(orderData?.subtotal || 0)}</span>
                </div>
                <div className="flex justify-between text-gray-500 text-sm">
                  <span>{t('pos.tax', 'Tax')}</span>
                  <span>{formatCurrency(orderData?.ppn || 0)}</span>
                </div>
                {(orderData?.discount || 0) > 0 && (
                  <div className="flex justify-between items-center text-green-600 text-sm font-medium">
                    <div className="flex items-center gap-1.5">
                      <span>{t('pos.discount', 'Discount')}</span>
                      {dualScreenConfig.showPromotionDetail !== false && orderData?.promotionName && (
                        <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                          {orderData.promotionName}
                        </span>
                      )}
                    </div>
                    <span>-{formatCurrency(orderData?.discount || 0)}</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between font-bold text-xl pt-2 border-t">
                <span>{t('pos.total', 'Total')}</span>
                <span className="text-primary">{formatCurrency(orderData?.total || 0)}</span>
              </div>
              {displayState === 'ordering' && (
                <div className="mt-3 bg-yellow-100 text-yellow-800 py-2 rounded-lg text-center text-sm font-medium">
                  {t('customerDisplay.payAtCounter', 'Please pay at counter')}
                </div>
              )}
            </div>
          </div>
        )
      case 'logo': {
        const displayLogo = (typeof window !== 'undefined' && localStorage.getItem('pos_store_logo')) || ''
        return (
          <div className="w-full h-full flex items-center justify-center bg-gray-100 p-8">
            <img
              src={((displayLogo && !displayLogo.startsWith('/youme-logo')) ? displayLogo : '') || YOUME_LOGO_RED}
              alt="YOUME"
              onError={(e) => {
                const target = e.currentTarget as HTMLImageElement
                target.onerror = null
                target.src = YOUME_LOGO_RED
              }}
              className="max-w-[80%] max-h-48 object-contain"
            />
          </div>
        )
      }
      default:
        return null
    }
  }

  // Paying state - show prominent payment QR code to customer
  if (displayState === 'paying' && paymentQr) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 flex flex-col items-center justify-center p-8 text-white">
        <div className="bg-white text-gray-900 p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm w-full animate-in fade-in zoom-in duration-300">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">📱</span>
            <span className="font-bold text-lg text-primary">{t('pos.scanToPay', 'Scan QR to Pay')}</span>
          </div>
          {paymentQr.orderNumber && (
            <p className="text-xs text-gray-400 font-mono mb-2">#{paymentQr.orderNumber}</p>
          )}
          <div className="p-3 bg-white border-2 border-indigo-100 rounded-2xl shadow-sm mb-4 flex items-center justify-center">
            <img src={paymentQr.qrImage} alt="Payment QR" className="w-56 h-56 object-contain" />
          </div>
          <p className="text-gray-500 text-xs mb-1 uppercase tracking-wider">{t('pos.total', 'Total Amount')}</p>
          <p className="text-3xl font-extrabold text-primary mb-4">{formatCurrency(paymentQr.amount)}</p>
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span>QRIS / GoPay / OVO / Dana / BCA</span>
          </div>
        </div>
      </div>
    )
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
