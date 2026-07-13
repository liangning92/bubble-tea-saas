import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { posApi } from '../../services/api'
import { QrCode, RefreshCw, Loader2, X } from 'lucide-react'
import QRCodeLib from 'qrcode'

interface AttendanceQRProps {
  posId: string
  onClose: () => void
}

export function AttendanceQR({ posId, onClose }: AttendanceQRProps) {
  const { t } = useTranslation()
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [storeName, setStoreName] = useState<string>('')
  const [expiresAt, setExpiresAt] = useState<number>(0)
  const [refreshInterval, setRefreshInterval] = useState<number>(300000) // 5 min default
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const loadQR = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await posApi.generateAttendanceQR(posId)
      if (response.data?.code === 200) {
        const data = response.data.data
        // Generate QR code as data URL
        const qrUrl = await QRCodeLib.toDataURL(data.qrData, {
          width: 200,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' }
        })
        setQrDataUrl(qrUrl)
        setStoreName(data.storeName)
        setExpiresAt(data.expiresAt)
        setRefreshInterval(data.refreshInterval || 300000)
      } else {
        setError(response.data?.message || t('common.error'))
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('common.error'))
    } finally {
      setIsLoading(false)
    }
  }, [posId])

  // Initial load
  useEffect(() => {
    loadQR()
  }, [loadQR])

  // Countdown timer
  useEffect(() => {
    const updateTimer = () => {
      const remaining = Math.max(0, expiresAt - Date.now())
      setTimeLeft(remaining)
    }
    updateTimer()
    intervalRef.current = setInterval(updateTimer, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [expiresAt])

  // Auto-refresh before expiry (refresh 30 seconds before)
  useEffect(() => {
    if (refreshInterval <= 0) return

    const refreshTime = refreshInterval - 30000 // 30 seconds before expiry
    const timeout = setTimeout(() => {
      loadQR()
    }, refreshTime)

    return () => clearTimeout(timeout)
  }, [refreshInterval, loadQR])

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const isExpiringSoon = timeLeft < 60000 // Less than 1 minute

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-primary text-white px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode size={24} />
            <span className="font-bold">{t('attendance.qrTitle') }</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 text-center">
          {/* Store Name */}
          <div className="mb-4">
            <p className="text-sm text-gray-500">{t('attendance.scanAtStore') || 'Scan at'}</p>
            <p className="font-bold text-lg text-gray-900">{storeName}</p>
            <p className="text-xs text-gray-400">POS: {posId}</p>
          </div>

          {/* QR Code Display */}
          {isLoading ? (
            <div className="w-48 h-48 mx-auto bg-gray-100 rounded-xl flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : error ? (
            <div className="w-48 h-48 mx-auto bg-red-50 rounded-xl flex flex-col items-center justify-center">
              <p className="text-red-500 text-sm">{error}</p>
              <button
                onClick={loadQR}
                className="mt-2 px-3 py-1 bg-red-500 text-white rounded text-sm"
              >
                {t('pos.retry')}
              </button>
            </div>
          ) : qrDataUrl ? (
            <div className="relative">
              {/* QR Code Image */}
              <div className="w-48 h-48 mx-auto bg-white p-2 rounded-xl border-2 border-gray-200">
                <img
                  src={qrDataUrl}
                  alt="Attendance QR Code"
                  className="w-full h-full"
                />
              </div>

              {/* Timer */}
              <div className={`mt-4 flex items-center justify-center gap-2 ${
                isExpiringSoon ? 'text-red-500' : 'text-gray-500'
              }`}>
                <RefreshCw size={14} className={isExpiringSoon ? 'animate-spin' : ''} />
                <span className="text-sm font-medium">
                  {t('attendance.qrExpiresIn') || 'Refreshes in'}: {formatTime(timeLeft)}
                </span>
              </div>

              {/* Instructions */}
              <div className="mt-4 p-3 bg-blue-50 rounded-xl text-left">
                <p className="text-sm text-blue-700">
                  {t('attendance.qrInstructions') || 'Staff scan this QR code to check in/out. QR refreshes automatically.'}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Manual Refresh Button */}
        <div className="px-6 pb-4">
          <button
            onClick={loadQR}
            disabled={isLoading}
            className="w-full py-2 bg-gray-100 text-gray-700 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-gray-200 disabled:opacity-50"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            {t('attendance.refreshQR') || 'Refresh QR'}
          </button>
        </div>
      </div>
    </div>
  )
}
