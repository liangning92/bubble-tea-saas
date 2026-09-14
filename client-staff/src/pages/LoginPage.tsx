import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import { Lock, Phone, Loader2, Globe } from 'lucide-react'

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
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showLangMenu, setShowLangMenu] = useState(false)

  const changeLanguage = (langCode: string) => {
    i18n.changeLanguage(langCode)
    localStorage.setItem('bubble-tea-language', langCode)
    setShowLangMenu(false)
  }

  const currentLang = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0]

  useEffect(() => {
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
    setError('')
    setIsLoading(true)

    try {
      const response = await staffApi.login(phone, password)
      if (response.code === 200) {
        login(response.data.token, response.data.user)

        // Handle remember me - only store phone number, never password
        if (rememberMe) {
          localStorage.setItem('remembered_phone', phone)
          localStorage.setItem('remember_me', 'true')
        } else {
          localStorage.removeItem('remembered_phone')
          localStorage.removeItem('remember_me')
        }

        navigate('/', { replace: true })
      } else {
        setError(response.message || t('auth.loginFailed'))
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('auth.invalidCredentials'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      {/* Subtle background */}
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
                    className={`w-full px-4 py-2.5 text-left hover:bg-gray-50 flex items-center gap-3 ${i18n.language === lang.code ? 'text-primary-hover font-medium' : 'text-gray-700'}`}
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

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/youme-logo-red.png" alt="YOUME" className="h-12 w-auto mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold text-gray-900">{t('auth.appName')}</h1>
          <p className="text-gray-500 mt-1">{t('auth.loginTitle')}</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm text-center mb-4">
              {error}
            </div>
          )}

          {/* Phone Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              {t('auth.phone')}
            </label>
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

          {/* Password Input */}
          <div className="space-y-2 mt-4">
            <label className="text-sm font-medium text-gray-700">
              {t('auth.password')}
            </label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 border border-gray-200">
                <Lock size={14} className="text-gray-400" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.passwordPlaceholder')}
                className="w-full pl-14 pr-4 py-3.5 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                required
              />
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

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-6 flex items-center justify-center gap-2 py-3.5 bg-primary hover:bg-primary-hover text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>{t('common.loading')}</span>
              </>
            ) : (
              <span>{t('auth.login')}</span>
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-gray-400 text-sm mt-6">
          © 2026 YOUME POS System
        </p>
      </div>
    </div>
  )
}