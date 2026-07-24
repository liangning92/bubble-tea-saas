import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, RefreshCw, Check, AlertCircle, X } from 'lucide-react'

interface UpdateNotificationProps {
  className?: string
}

export function UpdateNotification({ className = '' }: UpdateNotificationProps) {
  // Only render in Electron environment (not in browser/web)
  if (typeof window !== 'undefined' && !(window as any).electronAPI) {
    return null
  }

  const { t } = useTranslation()
  const [status, setStatus] = useState<string>('idle')
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [progress, setProgress] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const electronAPI = (window as any).electronAPI
    if (!electronAPI) return

    // Listen for update status changes
    electronAPI.onUpdateStatus((newStatus: string, info?: any) => {
      setStatus(newStatus)
      setUpdateInfo(info)
      setError(null)

      // Show notification for important statuses
      if (newStatus === 'available' || newStatus === 'downloaded' || newStatus === 'error') {
        setIsVisible(true)
      }
      if (newStatus === 'not-available') {
        // Auto-hide after 3 seconds when no update available
        setTimeout(() => setIsVisible(false), 3000)
      }
    })

    // Listen for download progress
    electronAPI.onUpdateProgress((prog: any) => {
      setProgress(prog.percent || 0)
    })

    // Listen for errors
    electronAPI.onUpdateError((err: string) => {
      setError(err)
      setIsVisible(true)
    })

    // Get current version
    electronAPI.getAppVersion().then((version: string) => {
    })
  }, [])

  const handleCheckUpdate = async () => {
    const electronAPI = (window as any).electronAPI
    if (!electronAPI) return

    setStatus('checking')
    setError(null)
    try {
      const result = await electronAPI.checkForUpdates()
      if (!result?.updateAvailable) {
        setStatus('up-to-date')
        setIsVisible(true)
        // Auto-hide after 3 seconds when no update available
        setTimeout(() => setIsVisible(false), 3000)
      }
    } catch (err: any) {
      setError(err.message || 'Check failed')
      setStatus('error')
    }
  }

  const handleDownload = async () => {
    const electronAPI = (window as any).electronAPI
    if (!electronAPI) return

    setStatus('downloading')
    setError(null)
    try {
      await electronAPI.downloadUpdate()
      // Status will be updated via onUpdateStatus event listener
    } catch (err: any) {
      setError(err.message || 'Download failed')
      setStatus('error')
    }
  }

  const handleInstall = () => {
    const electronAPI = (window as any).electronAPI
    if (!electronAPI) return

    electronAPI.installUpdate()
  }

  const handleClose = () => {
    setIsVisible(false)
  }

  // Don't render if not visible and no active status
  if (!isVisible && status === 'idle') {
    return (
      <button
        onClick={handleCheckUpdate}
        className={`flex items-center gap-1 text-gray-500 hover:text-gray-700 text-xs ${className}`}
        title={t('pos.checkUpdate')}
      >
        <RefreshCw size={14} />
      </button>
    )
  }

  // Only show banner for important statuses
  if (!isVisible && status !== 'idle') {
    return (
      <button
        onClick={handleCheckUpdate}
        className={`flex items-center gap-1 text-gray-500 hover:text-gray-700 text-xs ${className}`}
      >
        <RefreshCw size={14} className={status === 'checking' ? 'animate-spin' : ''} />
      </button>
    )
  }

  return (
    <div className={`fixed top-4 right-4 z-50 max-w-sm ${className}`}>
      <div className="bg-white rounded-xl shadow-2xl border p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-900">
            {t('pos.updateAvailable')}
          </h3>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Status content */}
        {status === 'checking' && (
          <div className="flex items-center gap-2 text-gray-600">
            <RefreshCw size={18} className="animate-spin" />
            <span>{t('pos.checkingUpdate')}</span>
          </div>
        )}

        {status === 'available' && updateInfo && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              {t('pos.newVersionReady', { version: updateInfo.version })}
            </p>
            <button
              onClick={handleDownload}
              className="w-full py-2 bg-primary text-white rounded-lg font-medium flex items-center justify-center gap-2"
            >
              <Download size={16} />
              {t('pos.downloadUpdate')}
            </button>
          </div>
        )}

        {status === 'downloading' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-gray-600">
              <Download size={18} className="animate-pulse" />
              <span>{t('pos.downloading')}</span>
              <span className="ml-auto font-medium">{progress.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {status === 'downloaded' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-600">
              <Check size={18} />
              <span>{t('pos.updateReady')}</span>
            </div>
            <button
              onClick={handleInstall}
              className="w-full py-2 bg-green-600 text-white rounded-lg font-medium flex items-center justify-center gap-2"
            >
              <Check size={16} />
              {t('pos.installUpdate')}
            </button>
          </div>
        )}

        {status === 'up-to-date' && (
          <div className="flex items-center gap-2 text-green-600">
            <Check size={18} />
            <span>{t('pos.upToDate')}</span>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle size={18} />
              <span>{error || t('pos.updateError')}</span>
            </div>
            <button
              onClick={handleCheckUpdate}
              className="w-full py-2 border border-gray-300 rounded-lg font-medium"
            >
              {t('pos.retry')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}