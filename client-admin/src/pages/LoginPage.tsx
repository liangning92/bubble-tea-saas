import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { authApi } from '../services/api'
import { Eye, EyeOff, Loader2, Phone, Lock, ArrowRight, Globe } from 'lucide-react'

const LANGUAGES = [
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'id', label: 'Indonesia', flag: '🇮🇩' }
]

// 9个核心模块
const MODULES = [
  { emoji: '📊', name: 'Dashboard', desc: '数据看板' },
  { emoji: '🧋', name: 'Products', desc: '商品管理' },
  { emoji: '📦', name: 'Inventory', desc: '库存管理' },
  { emoji: '💰', name: 'Finance', desc: '财务管理' },
  { emoji: '🛒', name: 'POS', desc: '收银系统' },
  { emoji: '👥', name: 'Staff', desc: '员工管理' },
  { emoji: '✨', name: 'Marketing', desc: '营销中心' },
  { emoji: '🎯', name: 'Analytics', desc: '数据分析' },
  { emoji: '⚙️', name: 'Settings', desc: '系统设置' },
]

export function LoginPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showLangMenu, setShowLangMenu] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await authApi.login(phone, password)
      const { token, user } = response.data.data
      login(token, user)
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
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-rose-50">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-pink-100/40 to-rose-100/20 rounded-full -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-rose-100/30 to-pink-100/20 rounded-full translate-y-1/3 -translate-x-1/4" />
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fadeInUp 0.6s ease-out both; }
      `}</style>

      <header className="absolute top-0 left-0 right-0 p-4 z-30">
        <div className="flex justify-end">
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur rounded-full shadow-lg hover:bg-white transition-all border border-white/50"
            >
              <Globe size={18} className="text-primary" />
              <span className="text-sm font-medium">{currentLang.flag} {currentLang.label}</span>
            </button>
            {showLangMenu && (
              <div className="absolute right-0 mt-2 w-44 bg-white/95 backdrop-blur rounded-xl shadow-xl py-2 z-50 border border-white/20">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => changeLanguage(lang.code)}
                    className={`w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 ${i18n.language === lang.code ? 'text-primary font-semibold' : 'text-gray-700'}`}
                  >
                    <span className="text-xl">{lang.flag}</span>
                    <span>{lang.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="min-h-screen flex">
        {/* Left Brand Panel */}
        <div className={`hidden lg:flex lg:w-[55%] relative overflow-hidden transition-all duration-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <div className="absolute inset-0 bg-gradient-to-br from-[#EC6D88] via-[#D94D6E] to-[#C44D5E]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-[500px] h-[500px] rounded-full bg-white/10 blur-3xl" />
          </div>

          {/* 顶部标题 */}
          <div className="absolute top-12 left-12 z-20 animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <h1 className="text-5xl font-bold text-white tracking-tight">{t('auth.appName')}</h1>
            <p className="text-white/60 text-2xl mt-3">{t('auth.appSubtitle')}</p>
          </div>

          {/* 中心大Logo */}
          <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 10 }}>
            <div className="text-center animate-fade-in" style={{ animationDelay: '0.3s' }}>
              <div className="text-[120px] leading-none mb-4">🧋</div>
              <div className="text-white/90 text-2xl font-light tracking-[0.2em] uppercase">{t('auth.appName')}</div>
            </div>
          </div>

          {/* 9个功能模块 - 底部网格布局 */}
          <div className="absolute bottom-16 left-12 right-12 z-20 animate-fade-in" style={{ animationDelay: '0.5s' }}>
            <p className="text-white/40 text-sm uppercase tracking-widest mb-6">9 Core Modules</p>
            <div className="grid grid-cols-9 gap-3">
              {MODULES.map((mod, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center group cursor-pointer"
                >
                  <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mb-2 group-hover:bg-white/25 transition-all border border-white/20">
                    <span className="text-2xl">{mod.emoji}</span>
                  </div>
                  <span className="text-white/80 text-xs text-center">{mod.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 底部统计 */}
          <div className="absolute bottom-12 right-12 text-right z-20 animate-fade-in" style={{ animationDelay: '0.7s' }}>
            <div className="text-4xl font-bold text-white">500+</div>
            <div className="text-white/50 text-sm mt-1">{t('auth.storeCount')}</div>
          </div>
        </div>

        {/* Right Login Panel */}
        <div className={`flex-1 flex items-center justify-center p-6 transition-all duration-1000 delay-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <div className="w-full max-w-md">
            <div className="lg:hidden text-center mb-8">
              <div className="text-7xl mb-4">🧋</div>
              <h1 className="text-3xl font-bold text-gray-900">{t('auth.appName')}</h1>
              <p className="text-gray-500 mt-2">{t('auth.appSubtitle')}</p>
            </div>

            <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-10 border border-white/50">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">{t('auth.loginTitle')}</h2>
              <p className="text-gray-500 mb-8">{t('auth.loginSubtitle') || 'Welcome back'}</p>

              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">{t('auth.phone')}</label>
                  <div className="relative">
                    <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="081234567890"
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-primary focus:outline-none text-center text-lg"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">{t('auth.password')}</label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-12 pr-12 py-4 rounded-xl border-2 border-gray-200 focus:border-primary focus:outline-none text-center text-lg"
                      required
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-[#EC6D88] to-[#D94D6E] text-white font-bold text-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : <ArrowRight size={20} />}
                  {loading ? t('auth.loggingIn') : t('auth.login')}
                </button>
              </form>

              <p className="mt-6 text-center text-gray-500 text-sm">
                {t('auth.noAccount')}{' '}
                <Link to="/register" className="text-primary font-bold hover:underline">
                  {t('auth.createAccount')}
                </Link>
              </p>
            </div>

            <div className="mt-4 p-5 bg-white/80 backdrop-blur rounded-xl border border-white/50">
              <p className="text-center text-sm font-semibold text-gray-600 mb-3">{t('auth.testAccount')}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-gray-400 text-xs">{t('auth.phone')}</div>
                  <div className="font-mono font-bold">081234567890</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-gray-400 text-xs">{t('auth.password')}</div>
                  <div className="font-mono font-bold">admin123</div>
                </div>
              </div>
            </div>

            <p className="text-center text-gray-400 text-sm mt-6">{t('auth.copyright')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}