import { useState, useEffect } from 'react'
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

interface DualScreenConfig {
  enabled: boolean
  layoutStyle: 'simple' | 'full'
  welcomeText: string
  showLogo: boolean
  adImageUrl: string
  promotions: string[]
}

// Default promotions
const DEFAULT_PROMOTIONS = ['🧋', '🍓', '💳', '🎁']

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
    layoutStyle: 'full',
    welcomeText: 'Bubble Tea Malaysia',
    showLogo: false,
    adImageUrl: '',
    promotions: DEFAULT_PROMOTIONS,
  })

  // Load dualScreen config from localStorage
  useEffect(() => {
    const savedConfig = localStorage.getItem('dualScreenConfig')
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig)
        setDualScreenConfig(config)
      } catch (e) {
        console.error('Failed to parse dualScreenConfig:', e)
      }
    }
  }, [])

  // Auto-rotate promotions
  const promotions = dualScreenConfig.promotions?.length > 0 ? dualScreenConfig.promotions : DEFAULT_PROMOTIONS
  useEffect(() => {
    if (displayState === 'idle') {
      const interval = setInterval(() => {
        setCurrentPromotion(p => (p + 1) % promotions.length)
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [displayState, promotions.length])

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

  // Simple layout style - just logo and welcome text
  if (dualScreenConfig.layoutStyle === 'simple') {
    if (displayState === 'idle') {
      return (
        <div className="min-h-screen bg-gradient-to-br from-primary to-primary/80 flex flex-col items-center justify-center text-white">
          {dualScreenConfig.showLogo && (
            <div className="text-8xl mb-6">🧋</div>
          )}
          <h1 className="text-5xl font-bold mb-2">
            {dualScreenConfig.welcomeText || 'Bubble Tea Malaysia'}
          </h1>
        </div>
      )
    }
  }

  // Idle state - show promotions (full layout)
  if (displayState === 'idle') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-500 to-pink-600 flex flex-col items-center justify-center text-white">
        {dualScreenConfig.adImageUrl ? (
          <img
            src={dualScreenConfig.adImageUrl}
            alt="Advertisement"
            className="w-full h-full object-cover absolute inset-0"
          />
        ) : (
          <>
            <div className="text-8xl mb-6 animate-pulse">{promotion}</div>
            <h1 className="text-5xl font-bold mb-2">
              {dualScreenConfig.welcomeText || t('customerDisplay.promotions.welcome')}
            </h1>
            <p className="text-2xl opacity-90">Bubble Tea Malaysia</p>
            <div className="flex gap-2 mt-8">
              {promotions.map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full ${i === currentPromotion ? 'bg-white' : 'bg-white/40'}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  // Order complete state - show thank you message
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

  // Ordering or paying - show order details
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-primary text-white py-4 px-6 text-center">
        <h2 className="text-2xl font-bold">{t('customerDisplay.yourOrder')}</h2>
      </div>

      {/* Order Items */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="space-y-4">
          {orderData?.items.map((item) => (
            <div key={item.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🧋</span>
                    <div>
                      <p className="font-bold text-lg">{item.productName}</p>
                      <p className="text-gray-500 text-sm">{item.specName}</p>
                      {item.addons.length > 0 && (
                        <p className="text-gray-400 text-xs mt-1">
                          + {item.addons.map(a => a.name).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg text-primary">
                    {formatCurrency(item.unitPrice * item.quantity)}
                  </p>
                  <p className="text-gray-500 text-sm">x{item.quantity}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer - Total */}
      <div className="bg-white border-t shadow-lg p-6">
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-gray-500">
            <span>{t('customerDisplay.subtotal')}</span>
            <span>{formatCurrency(orderData?.subtotal || 0)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>{t('customerDisplay.tax')}</span>
            <span>{formatCurrency(orderData?.ppn || 0)}</span>
          </div>
          {(orderData?.discount || 0) > 0 && (
            <div className="flex justify-between text-green-500">
              <span>{t('customerDisplay.discount')}</span>
              <span>-{formatCurrency(orderData?.discount || 0)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-2xl pt-3 border-t">
            <span>{t('customerDisplay.total')}</span>
            <span className="text-primary">{formatCurrency(orderData?.total || 0)}</span>
          </div>
        </div>

        {displayState === 'ordering' && (
          <div className="bg-yellow-100 text-yellow-800 py-3 rounded-lg text-center font-medium">
            {t('customerDisplay.pleasePayAtCounter')}
          </div>
        )}
      </div>
    </div>
  )
}