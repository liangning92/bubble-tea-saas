import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { posApi } from '../services/api'
import { Eye, EyeOff, Loader2, Phone, Lock, ArrowRight, Globe } from 'lucide-react'

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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showLangMenu, setShowLangMenu] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Load saved credentials
    const savedPhone = localStorage.getItem('remembered_phone')
    const savedPassword = localStorage.getItem('remembered_password')
    const savedRemember = localStorage.getItem('remember_me')
    if (savedRemember === 'true' && savedPhone && savedPassword) {
      setPhone(savedPhone)
      setPassword(savedPassword)
      setRememberMe(true)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await posApi.login(phone, password)
      const { token, user } = response.data.data
      login(token, user)

      // Handle remember me
      if (rememberMe) {
        localStorage.setItem('remembered_phone', phone)
        localStorage.setItem('remembered_password', password)
        localStorage.setItem('remember_me', 'true')
      } else {
        localStorage.removeItem('remembered_phone')
        localStorage.removeItem('remembered_password')
        localStorage.setItem('remember_me', 'false')
      }

      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.message || t('auth.loginFailed'))
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

      {/* Main content */}
      <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
        <div className={`w-full max-w-sm transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>

          {/* Logo & Brand */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-lg shadow-primary/20">
              <span className="text-3xl">🧋</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              {t('auth.appName')}
            </h1>
            <p className="text-gray-500 mt-1 text-sm">{t('auth.appSubtitle')}</p>
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
                    placeholder="081234567890"
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
                    placeholder="••••••••"
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

          {/* Test account card */}
          <div className="mt-4 p-4 bg-white/80 border border-gray-200 rounded-xl">
            <p className="text-center text-xs text-gray-400 uppercase tracking-wider mb-3">{t('auth.testAccount')}</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
                <div className="text-gray-400 text-xs mb-1">{t('auth.phone')}</div>
                <div className="font-mono text-gray-700 text-sm">081234567890</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
                <div className="text-gray-400 text-xs mb-1">{t('auth.password')}</div>
                <div className="font-mono text-gray-700 text-sm">admin123</div>
              </div>
            </div>
          </div>

          {/* Copyright */}
          <p className="text-center text-gray-400 text-xs mt-8">
            {t('auth.copyright')}
          </p>
        </div>
      </div>
    </div>
  )
}