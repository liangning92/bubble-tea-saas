import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { posApi, updateApiUrl } from '../services/api'
import { syncConnect, syncFull, checkSyncStatus } from '../services/syncApi'
import { getApiUrl, setApiUrl, normalizeApiUrl, CLOUD_API_URL } from '../config'
import { Eye, EyeOff, Loader2, Phone, Lock, ArrowRight, Globe, RefreshCw, Check, Settings, Server, Wifi, WifiOff, X } from 'lucide-react'
import { YOUME_LOGO_RED } from '../assets/logo'
import { WindowControls } from '../components/WindowControls'

const LANGUAGES = [
  { code: 'zh', labelKey: '中文', flag: '🇨🇳' },
  { code: 'en', labelKey: 'English', flag: '🇺🇸' },
  { code: 'id', labelKey: 'Bahasa Indonesia', flag: '🇮🇩' }
]

export function LoginPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { login, loginOffline } = useAuthStore()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showLangMenu, setShowLangMenu] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateStatusText, setUpdateStatusText] = useState('')
  const [isUpToDate, setIsUpToDate] = useState(false)

  // Server Settings Modal State
  const [showServerModal, setShowServerModal] = useState(false)
  const [serverUrl, setServerUrl] = useState(getApiUrl())
  const [testingServer, setTestingServer] = useState(false)
  const [serverStatus, setServerStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [serverLatency, setServerLatency] = useState<number | null>(null)
  const [serverErrorMsg, setServerErrorMsg] = useState('')

  useEffect(() => {
    setMounted(true)
    // Load saved phone number only (never store password)
    const savedPhone = localStorage.getItem('remembered_phone')
    const savedRemember = localStorage.getItem('remember_me')
    if (savedRemember === 'true' && savedPhone) {
      setPhone(savedPhone)
      setRememberMe(true)
    }
    // 获取软件版本号
    const api = (window as any).electronAPI
    if (api?.getAppVersion) {
      api.getAppVersion().then((v: string) => setAppVersion(v)).catch(() => {})
    }
  }, [])

  const handleCheckUpdate = async () => {
    const api = (window as any).electronAPI
    if (!api?.checkForUpdates) {
      setUpdateStatusText(t('auth.notElectron', '仅客户端支持更新'))
      setTimeout(() => setUpdateStatusText(''), 3000)
      return
    }

    setCheckingUpdate(true)
    setIsUpToDate(false)
    setUpdateStatusText(t('pos.checkingUpdate', '正在检查更新...'))

    const offStatus = api.onUpdateStatus?.((status: string, info?: any) => {
      if (status === 'up-to-date' || status === 'not-available') {
        setCheckingUpdate(false)
        setIsUpToDate(true)
        setUpdateStatusText(t('pos.upToDate', '已是最新版本'))
        setTimeout(() => {
          setUpdateStatusText('')
          setIsUpToDate(false)
        }, 4000)
      } else if (status === 'available') {
        setCheckingUpdate(false)
        setIsUpToDate(false)
        setUpdateStatusText(t('pos.newVersionReady', { version: info?.version || '' }) || t('pos.updateAvailable', '发现新版本'))
        setTimeout(() => setUpdateStatusText(''), 5000)
      } else if (status === 'error') {
        setCheckingUpdate(false)
        setIsUpToDate(false)
        setUpdateStatusText(t('pos.updateError', '检查失败'))
        setTimeout(() => setUpdateStatusText(''), 4000)
      }
    })

    try {
      await api.checkForUpdates()
    } catch (err: any) {
      setCheckingUpdate(false)
      setIsUpToDate(false)
      setUpdateStatusText(t('pos.updateError', '检查失败'))
      setTimeout(() => setUpdateStatusText(''), 4000)
    }

    offStatus?.()

    // 10秒超时防呆保护
    setTimeout(() => {
      setCheckingUpdate(false)
    }, 10000)
  }

  const handleTestServer = async (urlToTest = serverUrl) => {
    setTestingServer(true)
    setServerStatus('idle')
    setServerErrorMsg('')
    try {
      const normalized = normalizeApiUrl(urlToTest)
      const start = Date.now()
      const res = await fetch(`${normalized}/health`, { method: 'GET', signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        setServerLatency(Date.now() - start)
        setServerStatus('ok')
      } else {
        setServerStatus('error')
        setServerErrorMsg(`HTTP ${res.status}`)
      }
    } catch (err: any) {
      setServerStatus('error')
      setServerErrorMsg(err.message || t('pos.serverConnectFailed', '无法连接服务器'))
    } finally {
      setTestingServer(false)
    }
  }

  const handleSaveServer = () => {
    const normalized = normalizeApiUrl(serverUrl)
    setApiUrl(normalized)
    updateApiUrl(normalized)
    setShowServerModal(false)
  }

  const handleResetCloud = () => {
    setServerUrl(CLOUD_API_URL)
    handleTestServer(CLOUD_API_URL)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      // Try online login first
      const response = await posApi.login(phone, password)
      const { token, user } = response.data.data
      await login(token, user, password)

      // Handle remember me - only store phone number, never password
      if (rememberMe) {
        localStorage.setItem('remembered_phone', phone)
        localStorage.setItem('remember_me', 'true')
      } else {
        localStorage.removeItem('remembered_phone')
        localStorage.removeItem('remember_me')
      }

      // Auto-sync from cloud if local DB is empty (first login)
      try {
        const syncStatus = await checkSyncStatus()
        if (!syncStatus.isSetUp) {
          // Local DB is empty, auto-sync from cloud
          const connResult = await syncConnect(phone, password)
          await syncFull(connResult.storeId, connResult.syncTicket)
        }
      } catch (syncErr) {
        console.warn('[Login] Auto-sync failed:', syncErr)
        // Continue anyway - user can still use the app
      }

      navigate('/pos')
    } catch (err: any) {
      // Check if network error (server unreachable) - try offline login
      // axios error codes: ECONNREFUSED, NETWORK_ERROR, ETIMEDOUT, etc.
      // Also check !navigator.onLine for browser offline state
      const isNetworkError = !navigator.onLine ||
        err.code === 'ECONNREFUSED' ||
        err.code === 'ECONNRESET' ||
        err.code === 'NETWORK_ERROR' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ENOTFOUND' ||
        err.message?.includes('Network') ||
        err.message?.includes('fetch') ||
        err.message?.includes('Failed to fetch') ||
        err.message?.includes('Network Error') ||
        (!err.response && err.message)

      if (isNetworkError) {
        const offlineResult = await loginOffline(phone, password)
        if (offlineResult.success) {
          navigate('/pos')
          return
        }
        // Offline login failed - show specific error
        if (offlineResult.error === 'offlineCredentialsNotFound') {
          setError(t('auth.offlineCredentialsNotFound'))
        } else {
          setError(t('auth.offlineLoginFailed'))
        }
      } else {
        setError(err.response?.data?.message || t('auth.loginFailed'))
      }
    } finally {
      setLoading(false)
    }
  }

  const changeLanguage = (langCode: string) => {
    i18n.changeLanguage(langCode)
    localStorage.setItem('bubble-tea-language', langCode)
    setShowLangMenu(false)
  }

  const currentLang = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0]

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.3]"
        style={{
          backgroundImage: `linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }}
      />

      {/* Top bar: Language selector and Window Controls */}
      <header className="absolute top-0 left-0 right-0 p-3 z-30 flex items-center justify-between">
        <div />
        <div className="flex items-center gap-2">
          {/* Server Settings button */}
          <button
            type="button"
            onClick={() => {
              setServerUrl(getApiUrl())
              setShowServerModal(true)
              handleTestServer(getApiUrl())
            }}
            title={t('pos.serverSettings', '服务器设置')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm text-gray-700 cursor-pointer"
          >
            <Settings size={16} className="text-gray-500" />
            <span className="text-sm font-medium hidden sm:inline">{t('pos.serverSettings', '服务器')}</span>
          </button>

          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
            >
              <Globe size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">{currentLang.flag} {t(currentLang.labelKey)}</span>
            </button>
            {showLangMenu && (
              <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-lg py-1 z-50 shadow-lg">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => changeLanguage(lang.code)}
                    className={`w-full px-4 py-2.5 text-left hover:bg-gray-50 flex items-center gap-3 ${i18n.language === lang.code ? 'text-primary-hover font-medium' : 'text-gray-700'}`}
                  >
                    <span className="text-lg">{lang.flag}</span>
                    <span>{t(lang.labelKey)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <WindowControls variant="dark" />
        </div>
      </header>

      {/* Main content */}
      <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
        <div className={`w-full max-w-sm transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>

          {/* Logo & Brand */}
          <div className="text-center mb-8 flex justify-center items-center h-16 min-h-[64px]">
            {(() => {
              const rawLogo = (typeof window !== 'undefined' && localStorage.getItem('pos_store_logo')) || ''
              const storeLogo = (rawLogo && rawLogo !== '/youme-logo-red.png' && rawLogo !== '/youme-logo-white.png') ? rawLogo : ''
              return (
                <img
                  src={storeLogo || YOUME_LOGO_RED}
                  alt="YOUME"
                  onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement
                    target.onerror = null
                    target.src = YOUME_LOGO_RED
                  }}
                  className="h-16 max-w-[200px] mx-auto object-contain"
                />
              )
            })()}
          </div>

          {/* Login card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            {/* Header */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900">{t('auth.loginTitle')}</h2>
              <p className="text-gray-500 text-sm mt-1">{t('auth.loginSubtitle')}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm text-center">
                  {error}
                </div>
              )}

              {/* Phone input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">{t('auth.phone')}</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 border border-gray-200">
                    <Phone size={14} className="text-gray-400" />
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t('auth.phonePlaceholder')}
                    className="w-full pl-14 pr-4 py-3.5 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    required
                  />
                </div>
              </div>

              {/* Password input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">{t('auth.password')}</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 border border-gray-200">
                    <Lock size={14} className="text-gray-400" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('auth.passwordPlaceholder')}
                    className="w-full pl-14 pr-12 py-3.5 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between mt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/20"
                  />
                  <span className="text-sm text-gray-600">{t('auth.rememberMe')}</span>
                </label>
                <button
                  type="button"
                  className="text-sm text-primary-hover hover:text-primary-hover font-medium transition-colors"
                >
                  {t('auth.forgotPassword')}
                </button>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-6 flex items-center justify-center gap-2 py-3.5 bg-primary hover:bg-primary-hover text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    <span>{t('auth.login')}</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Copyright & Version & Update Check */}
          <div className="text-center text-gray-400 text-xs mt-8 space-y-2">
            <p>{t('auth.copyright')}</p>
            <div className="flex items-center justify-center gap-2.5 text-[11px]">
              {appVersion && (
                <span className="font-mono text-gray-400/80">v{appVersion}</span>
              )}
              <span className="text-gray-300">·</span>
              <button
                type="button"
                onClick={handleCheckUpdate}
                disabled={checkingUpdate}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-medium select-none ${
                  isUpToDate
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                    : 'bg-white border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50 shadow-2xs'
                } disabled:opacity-60 cursor-pointer`}
              >
                {isUpToDate ? (
                  <Check size={12} className="text-emerald-500" />
                ) : (
                  <RefreshCw size={12} className={checkingUpdate ? 'animate-spin text-primary' : 'text-gray-400'} />
                )}
                <span>{updateStatusText || t('pos.checkUpdate', '检查更新')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Server Settings Modal */}
      {showServerModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-200 p-6 space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-gray-900 font-semibold text-base">
                <Server size={18} className="text-primary" />
                <span>{t('pos.serverSettings', '服务器连接设置')}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowServerModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1.5">
                  {t('pos.serverUrl', 'API 服务器地址')}
                </label>
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => {
                    setServerUrl(e.target.value)
                    setServerStatus('idle')
                  }}
                  placeholder="https://api.aicube.online/api"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 font-mono text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              {/* Status Indicator */}
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  {serverStatus === 'ok' && (
                    <>
                      <Wifi size={16} className="text-emerald-500" />
                      <span className="text-emerald-600 font-medium">
                        {t('pos.serverConnected', '连接成功')} ({serverLatency}ms)
                      </span>
                    </>
                  )}
                  {serverStatus === 'error' && (
                    <>
                      <WifiOff size={16} className="text-red-500" />
                      <span className="text-red-600 font-medium text-xs">
                        {t('pos.serverConnectFailed', '连接失败')}: {serverErrorMsg}
                      </span>
                    </>
                  )}
                  {serverStatus === 'idle' && !testingServer && (
                    <>
                      <Server size={16} className="text-gray-400" />
                      <span className="text-gray-500 text-xs">{t('pos.serverClickTest', '点击测试以验证连通性')}</span>
                    </>
                  )}
                  {testingServer && (
                    <>
                      <Loader2 size={16} className="animate-spin text-primary" />
                      <span className="text-gray-500 text-xs">{t('pos.testingConnection', '正在测试连接...')}</span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleTestServer()}
                  disabled={testingServer}
                  className="text-xs font-medium px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {t('pos.testConnect', '测试连接')}
                </button>
              </div>

              {/* Fast presets */}
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleResetCloud}
                  className="flex-1 py-1.5 px-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium text-center cursor-pointer"
                >
                  {t('pos.resetToCloud', '恢复默认云端服务器')}
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowServerModal(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-sm rounded-xl transition-colors cursor-pointer"
              >
                {t('common.cancel', '取消')}
              </button>
              <button
                type="button"
                onClick={handleSaveServer}
                className="flex-1 py-2.5 bg-primary hover:bg-primary-hover text-white font-medium text-sm rounded-xl transition-colors cursor-pointer"
              >
                {t('common.save', '保存并应用')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
