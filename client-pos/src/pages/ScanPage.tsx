import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { X, ScanLine, Keyboard } from 'lucide-react'
import { posApi } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { formatCurrency } from '../utils/helpers'

interface ScannedProduct {
  id: string
  name: string
  price: number
  barcode: string
}

interface ScannedMember {
  id: string
  name: string
  phone: string
  points: number
}

export function ScanPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [mode, setMode] = useState<'camera' | 'keyboard'>('keyboard')
  const [manualInput, setManualInput] = useState('')
  const [scannedProduct, setScannedProduct] = useState<ScannedProduct | null>(null)
  const [scannedMember, setScannedMember] = useState<ScannedMember | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus()
  }, [mode])

  // Keyboard mode scan (USB scanner is essentially keyboard input)
  const handleManualScan = async () => {
    if (!manualInput.trim()) return
    setLoading(true)
    setError('')
    setScannedProduct(null)
    setScannedMember(null)

    let found = false
    try {
      // Try product first
      const productRes = await posApi.getProductByBarcode(manualInput.trim())
      if (productRes.data?.data) {
        setScannedProduct(productRes.data.data)
        found = true
      } else {
        // Try member
        const memberRes = await posApi.getMemberByBarcode(manualInput.trim())
        if (memberRes.data?.data) {
          setScannedMember(memberRes.data.data)
          found = true
        } else {
          setError(t('scan.notFound'))
        }
      }
    } catch (err) {
      setError(t('scan.scanFailed'))
    } finally {
      setLoading(false)
      // Only clear input on success, keep on error so user can see what they typed
      if (found) {
        setManualInput('')
      }
      inputRef.current?.focus()
    }
  }

  // Add product to cart (via localStorage)
  const handleAddToCart = () => {
    if (!scannedProduct) return
    const cartData = {
      productId: scannedProduct.id,
      productName: scannedProduct.name,
      specName: scannedProduct.name,
      unitPrice: scannedProduct.price,
      quantity: 1,
      addons: []
    }
    // Save to localStorage, POSPage will detect and add
    localStorage.setItem('scan_to_cart', JSON.stringify(cartData))
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 rounded-lg">
              <X size={20} />
            </button>
            <h1 className="text-lg font-bold">{t('scan.title')}</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setMode('keyboard')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 ${
                mode === 'keyboard' ? 'bg-pink-500 text-white' : 'bg-gray-100'
              }`}
            >
              <Keyboard size={16} />
              {t('scan.keyboardMode')}
            </button>
            <button
              onClick={() => setMode('camera')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 ${
                mode === 'camera' ? 'bg-pink-500 text-white' : 'bg-gray-100'
              }`}
            >
              <ScanLine size={16} />
              {t('scan.cameraMode')}
            </button>
          </div>
        </div>
      </header>

      <div className="p-4">
        {mode === 'keyboard' ? (
          /* Keyboard Mode */
          <div className="bg-white rounded-xl p-6">
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <ScanLine size={40} className="text-pink-500" />
              </div>
              <h2 className="text-lg font-bold">{t('scan.scanBarcode')}</h2>
              <p className="text-sm text-gray-500 mt-1">{t('scan.scanHint')}</p>
            </div>

            <div className="space-y-4">
              <input
                ref={inputRef}
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleManualScan()}
                placeholder={t('scan.enterBarcode')}
                className="w-full p-4 border-2 border-gray-200 rounded-xl text-lg text-center focus:border-pink-500 focus:outline-none"
              />
              <button
                onClick={handleManualScan}
                disabled={loading || !manualInput.trim()}
                className="w-full py-4 bg-pink-500 text-white rounded-xl font-bold text-lg disabled:bg-gray-300"
              >
                {loading ? t('common.loading') : t('scan.confirm')}
              </button>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-center">
                {error}
              </div>
            )}

            {scannedProduct && (
              <div className="mt-4 p-4 bg-green-50 rounded-xl">
                <p className="text-sm text-gray-500">{t('scan.product')}</p>
                <p className="font-bold text-lg">{scannedProduct.name}</p>
                <p className="text-pink-500 font-bold">{formatCurrency(scannedProduct.price)}</p>
                <button
                  onClick={handleAddToCart}
                  className="w-full mt-3 py-3 bg-green-500 text-white rounded-xl font-bold"
                >
                  {t('scan.addToCart')}
                </button>
              </div>
            )}

            {scannedMember && (
              <div className="mt-4 p-4 bg-blue-50 rounded-xl">
                <p className="text-sm text-gray-500">{t('scan.member')}</p>
                <p className="font-bold text-lg">{scannedMember.name}</p>
                <p className="text-sm text-gray-500">{scannedMember.phone}</p>
                <p className="text-sm text-blue-600">{t('scan.points')}: {scannedMember.points}</p>
              </div>
            )}
          </div>
        ) : (
          /* Camera Mode */
          <div className="bg-white rounded-xl p-6">
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <ScanLine size={40} className="text-pink-500" />
              </div>
              <h2 className="text-lg font-bold">{t('scan.cameraMode')}</h2>
              <p className="text-sm text-gray-500 mt-1">{t('scan.scanHint')}</p>
            </div>

            {/* Camera scan area */}
            <div className="bg-gray-900 rounded-xl aspect-square flex items-center justify-center mb-4">
              <div className="text-center text-white">
                <ScanLine size={60} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm opacity-75">{t('scan.cameraPermission')}</p>
              </div>
            </div>

            <p className="text-sm text-gray-500 text-center">
              {t('scan.cameraNote')}
            </p>
          </div>
        )}

        {/* Instructions */}
        <div className="mt-6">
          <h3 className="font-bold mb-3">{t('scan.instructions')}</h3>
          <div className="bg-white rounded-xl p-4 space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="w-6 h-6 bg-pink-100 text-pink-600 rounded-full flex items-center justify-center text-xs font-bold">1</span>
              <p>{t('scan.instruction1')}</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-6 h-6 bg-pink-100 text-pink-600 rounded-full flex items-center justify-center text-xs font-bold">2</span>
              <p>{t('scan.instruction2')}</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-6 h-6 bg-pink-100 text-pink-600 rounded-full flex items-center justify-center text-xs font-bold">3</span>
              <p>{t('scan.instruction3')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}