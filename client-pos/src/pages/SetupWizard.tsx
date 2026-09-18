import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2, Wifi, WifiOff, AlertCircle, CheckCircle } from 'lucide-react'
import { syncConnect, syncFull, checkSyncStatus } from '../services/syncApi'

export function SetupWizard() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'login' | 'syncing' | 'done'>('login')
  const [syncResult, setSyncResult] = useState<{ storeName: string; categories: number; products: number; specs: number; addons: number } | null>(null)

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const connResult = await syncConnect(phone, password)

      setStep('syncing')
      const fullResult = await syncFull(connResult.storeId, connResult.token, connResult.phone, connResult.passwordHash)

      setSyncResult(fullResult)
      setStep('done')
    } catch (err: any) {
      setError(err.message || 'Connection failed. Check your internet.')
      setStep('login')
    } finally {
      setLoading(false)
    }
  }

  const handleDone = () => {
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/youme-logo-red.png" alt="YOUME" className="w-32 h-16 object-contain mb-2" />
          <h1 className="text-2xl font-bold text-gray-800">YOUME POS</h1>
          <p className="text-gray-500 text-sm mt-1">首次设置 · First Setup</p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start gap-3">
            <AlertCircle className="text-red-500 mt-0.5 flex-shrink-0" size={20} />
            <div>
              <p className="text-red-700 text-sm font-medium">{t('auth.connectionFailed')}</p>
              <p className="text-red-600 text-xs mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Login Step */}
        {step === 'login' && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <Wifi className="text-pink-500" size={20} />
              <h2 className="font-semibold text-gray-800">{t('auth.connectCloudTitle')}</h2>
            </div>
            <p className="text-gray-500 text-sm mb-4">
              {t('auth.connectCloudHint')}<br />
              <span className="text-xs">从云端同步产品、分类和配置</span>
            </p>

            <form onSubmit={handleConnect} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.phone')}</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('auth.phoneExample')}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.password')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.passwordPlaceholder') || '••••••••'}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-pink-500 hover:bg-pink-600 disabled:bg-pink-300 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    {t('auth.connecting')}...
                  </>
                ) : (
                  t('auth.connectAndSync') + ' ➜'
                )}
              </button>
            </form>

            <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
              <WifiOff size={14} />
              <span>{t('auth.offlineModeNote')}</span>
            </div>

          </div>
        )}

        {/* Syncing Step */}
        {step === 'syncing' && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="flex justify-center mb-4">
              <Loader2 className="animate-spin text-pink-500" size={48} />
            </div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">{t('auth.syncingData')}</h2>
            <p className="text-gray-500 text-sm">
              {t('auth.pullingFromCloud')}<br />
              {t('auth.keepNetwork')}
            </p>
          </div>
        )}

        {/* Done Step */}
        {step === 'done' && syncResult && (
          <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle className="text-green-500" size={48} />
            </div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">{t('auth.syncComplete')}</h2>
            <p className="text-gray-600 text-sm mb-1">
              {t('auth.store')}: <strong>{syncResult.storeName}</strong>
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
              <p className="text-xs text-gray-500 mb-2">{t('auth.syncedData')}:</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('pos.categories')}</span>
                  <span className="font-medium text-gray-800">{syncResult.categories}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('pos.products')}</span>
                  <span className="font-medium text-gray-800">{syncResult.products}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('pos.specs')}</span>
                  <span className="font-medium text-gray-800">{syncResult.specs}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('pos.addons')}</span>
                  <span className="font-medium text-gray-800">{syncResult.addons}</span>
                </div>
              </div>
            </div>
            <button
              onClick={handleDone}
              className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {t('auth.startUsing')} ➜
            </button>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-gray-400 text-xs mt-6">
          YOUME POS v2026.9
        </p>
      </div>
    </div>
  )
}
