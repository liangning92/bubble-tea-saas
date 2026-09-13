import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import axios from 'axios'
import { getApiUrl, setApiUrl, clearApiUrl } from '../config'
import { updateApiUrl } from '../services/api'
import { connectionManager } from '../services/ConnectionManager'
import { Eye, EyeOff, Loader2, Phone, Lock, ArrowRight, Settings, Globe } from 'lucide-react'

const LANGUAGES = [
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'id', label: 'Indonesia', flag: '🇮🇩' }
]

export function LoginPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showApiConfig, setShowApiConfig] = useState(false)
  const [apiUrl, setApiUrlInput] = useState(getApiUrl())
  const [mounted, setMounted] = useState(false)
  const [showLangMenu, setShowLangMenu] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Load saved phone number only (never store password)
    const savedPhone = localStorage.getItem('remembered_phone')
    const savedRemember = localStorage.getItem('remember_me')
    if (savedRemember === 'true' && savedPhone) {
      setPhone(savedPhone)
      setRememberMe(true)
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await axios.post(`${getApiUrl()}/auth/login`, { phone, password })
      const { token, user } = res.data.data
      login(token, user)

      // Handle remember me - only store phone number, never password
      if (rememberMe) {
        localStorage.setItem('remembered_phone', phone)
        localStorage.setItem('remember_me', 'true')
      } else {
        localStorage.removeItem('remembered_phone')
        localStorage.removeItem('remember_me')
      }

      try {
        const urlChanged = await connectionManager.checkForUrlUpdate()
        if (urlChanged) {
        }
      } catch {}

      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.message || t('auth.loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleSaveApiUrl = () => {
    setApiUrl(apiUrl)
    updateApiUrl(apiUrl)
    connectionManager.addFallbackUrl(apiUrl)
    connectionManager.forceReconnect()
    if (window.electronAPI?.setApiUrl) {
      window.electronAPI.setApiUrl(apiUrl)
    }
    setShowApiConfig(false)
  }

  const handleResetApiUrl = () => {
    clearApiUrl()
    setApiUrlInput('/api')
    updateApiUrl('/api')
    connectionManager.forceReconnect()
    if (window.electronAPI?.setApiUrl) {
      window.electronAPI.setApiUrl('/api')
    }
    setShowApiConfig(false)
  }

  const changeLanguage = (langCode: string) => {
    i18n.changeLanguage(langCode)
    localStorage.setItem('bubble-tea-language', langCode)
    setShowLangMenu(false)
  }

  const currentLang = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0]

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.3]"
        style={{
          backgroundImage: `linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }}
      />

      {/* Language selector */}
      <header className="absolute top-0 left-0 right-0 p-4 z-30">
        <div className="flex justify-end">
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
            >
              <Globe size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">{currentLang.flag} {currentLang.label}</span>
            </button>
            {showLangMenu && (
              <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-lg py-1 z-50 shadow-lg">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => changeLanguage(lang.code)}
                    className={`w-full px-4 py-2.5 text-left hover:bg-gray-50 flex items-center gap-3 ${i18n.language === lang.code ? 'text-primary font-medium' : 'text-gray-700'}`}
                  >
                    <span className="text-lg">{lang.flag}</span>
                    <span>{lang.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Login card */}
      <div className={`w-full max-w-sm relative z-10 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4">
            <img src="/youme-logo-light.png" alt="YOUME" className="h-12 w-auto" style={{ display: 'block' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#EC6D88' }}>
            YOUME
          </h1>
          <p className="text-gray-500 mt-1 text-sm">{t('auth.appSubtitle')}</p>
        </div>

        {/* API Config Toggle */}
        <div className="mb-4 text-center">
          <button
            type="button"
            onClick={() => setShowApiConfig(!showApiConfig)}
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Settings size={12} />
            {showApiConfig ? t('auth.hideApiConfig') : t('auth.showApiConfig')}
          </button>
        </div>

        {/* API Config Panel */}
        {showApiConfig && (
          <div className="mb-4 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-sm font-medium text-gray-700 mb-3">{t('auth.apiServerConfig')}</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrlInput(e.target.value)}
                placeholder={t('auth.apiUrlPlaceholder')}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveApiUrl}
                  className="flex-1 px-3 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors"
                >
                  {t('common.save')}
                </button>
                <button
                  type="button"
                  onClick={handleResetApiUrl}
                  className="px-3 py-2 text-gray-500 text-sm hover:text-gray-700 transition-colors"
                >
                  {t('auth.resetDefault')}
                </button>
              </div>
              <p className="text-xs text-gray-400">
                {t('auth.currentApi')}: {getApiUrl()}
              </p>
            </div>
          </div>
        )}

        {/* Login form */}
        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-6 text-center">
            {t('auth.loginTitle')}
          </h2>

          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm text-center">
                {error}
              </div>
            )}

            {/* Phone */}
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

            {/* Password */}
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
                className="text-sm text-primary hover:text-primary-hover font-medium transition-colors"
              >
                {t('auth.forgotPassword')}
              </button>
            </div>

            {/* Submit */}
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

          {/* Register link */}
          <p className="mt-6 text-center text-gray-500 text-sm">
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="text-primary font-medium hover:text-primary-hover transition-colors">
              {t('auth.createAccount')}
            </Link>
          </p>
        </div>

      </div>
    </div>
  )
}