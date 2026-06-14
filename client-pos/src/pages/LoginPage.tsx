import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import axios from 'axios'
import { getApiUrl, setApiUrl, clearApiUrl } from '../config'
import { updateApiUrl } from '../services/api'
import { connectionManager } from '../services/ConnectionManager'

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showApiConfig, setShowApiConfig] = useState(false)
  const [apiUrl, setApiUrlInput] = useState(getApiUrl())

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await axios.post(`${getApiUrl()}/auth/login`, { phone, password })
      const { token, user } = res.data.data
      login(token, user)

      // Check if Admin changed the API URL
      try {
        const urlChanged = await connectionManager.checkForUrlUpdate()
        if (urlChanged) {
          console.log('[Login] API URL updated by Admin:', connectionManager.getCurrentUrl())
        }
      } catch {}

      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.message || t('login.loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleSaveApiUrl = () => {
    setApiUrl(apiUrl)
    updateApiUrl(apiUrl)
    // Add to ConnectionManager fallback URLs for auto-reconnect
    connectionManager.addFallbackUrl(apiUrl)
    // Force reconnect with new URL
    connectionManager.forceReconnect()
    // 同时通过 Electron IPC 持久化到文件系统（供主进程使用）
    if (window.electronAPI?.setApiUrl) {
      window.electronAPI.setApiUrl(apiUrl)
    }
    setShowApiConfig(false)
  }

  const handleResetApiUrl = () => {
    clearApiUrl()
    setApiUrlInput('/api')
    updateApiUrl('/api')
    // Force reconnect with default URL
    connectionManager.forceReconnect()
    if (window.electronAPI?.setApiUrl) {
      window.electronAPI.setApiUrl('/api')
    }
    setShowApiConfig(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-24 h-24 rounded-3xl bg-primary mx-auto mb-4 flex items-center justify-center shadow-lg">
            <span className="text-5xl">🧋</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{t('login.title')}</h1>
          <p className="text-gray-500 mt-2">{t('login.subtitle')}</p>
        </div>

        {/* API Config Toggle */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowApiConfig(!showApiConfig)}
            className="text-sm text-gray-400 hover:text-gray-600 underline"
          >
            {showApiConfig ? t('login.hideApiConfig') : t('login.showApiConfig')}
          </button>
        </div>

        {/* API Config Panel */}
        {showApiConfig && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
            <h3 className="font-medium text-yellow-800 mb-3">{t('login.apiServerConfig')}</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrlInput(e.target.value)}
                placeholder="https://api.example.com"
                className="w-full px-3 py-2 rounded-lg border border-yellow-300 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveApiUrl}
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium"
                >
                  {t('common.save')}
                </button>
                <button
                  type="button"
                  onClick={handleResetApiUrl}
                  className="px-3 py-2 text-gray-500 text-sm"
                >
                  {t('login.resetDefault')}
                </button>
              </div>
              <p className="text-xs text-yellow-600">
                {t('login.currentApi')}: {getApiUrl()}
              </p>
            </div>
          </div>
        )}

        {/* Login Form */}
        <div className="bg-white rounded-3xl shadow-xl p-8">
          <h2 className="text-xl font-semibold text-center mb-6">{t('login.loginTitle')}</h2>

          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('login.phone')}
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="081234567890"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-primary focus:outline-none text-center text-lg"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('login.password')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-primary focus:outline-none text-center text-lg"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {loading ? t('common.loading') : t('login.loginButton')}
            </button>
          </form>
        </div>

        {/* Demo Info */}
        <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
          <p className="text-blue-800 font-medium text-center mb-2">{t('login.testAccount')}</p>
          <div className="text-center text-blue-600 text-sm space-y-1">
            <p>{t('login.roleAdmin')}: <span className="font-mono">081234567890</span></p>
            <p>{t('login.roleCashier')}: <span className="font-mono">081234567892</span></p>
            <p>{t('login.testPassword')} <span className="font-mono">admin123</span></p>
          </div>
        </div>
      </div>
    </div>
  )
}