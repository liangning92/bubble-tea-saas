import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { authApi } from '../services/api'
import { Eye, EyeOff, Loader2, Phone, Lock, ArrowRight, Globe, Sparkles } from 'lucide-react'

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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showLangMenu, setShowLangMenu] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [floatingOrbs, setFloatingOrbs] = useState<Array<{ x: number; y: number; size: number; duration: number; delay: number }>>([])
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    // Generate floating orbs
    const orbs = Array.from({ length: 6 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 200 + 100,
      duration: Math.random() * 20 + 15,
      delay: Math.random() * 5
    }))
    setFloatingOrbs(orbs)
  }, [])

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
    <div className="min-h-screen bg-[#0a0a0f] relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-pink-500/20 via-transparent to-purple-500/20 animate-pulse" />
        <div className="absolute inset-0 bg-gradient-to-tr from-rose-500/10 via-transparent to-pink-500/10" />
      </div>

      {/* Floating orbs */}
      <div ref={canvasRef} className="absolute inset-0 overflow-hidden pointer-events-none">
        {floatingOrbs.map((orb, i) => (
          <div
            key={i}
            className="absolute rounded-full blur-3xl animate-float"
            style={{
              left: `${orb.x}%`,
              top: `${orb.y}%`,
              width: `${orb.size}px`,
              height: `${orb.size}px`,
              background: i % 2 === 0
                ? 'radial-gradient(circle, rgba(236, 109, 136, 0.4) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(168, 85, 247, 0.3) 0%, transparent 70%)',
              animationDuration: `${orb.duration}s`,
              animationDelay: `${orb.delay}s`
            }}
          />
        ))}
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />

      {/* Language selector */}
      <header className="absolute top-0 left-0 right-0 p-4 z-30">
        <div className="flex justify-end">
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full hover:bg-white/10 transition-all"
            >
              <Globe size={18} className="text-pink-400" />
              <span className="text-sm font-medium text-white/80">{currentLang.flag} {currentLang.label}</span>
            </button>
            {showLangMenu && (
              <div className="absolute right-0 mt-2 w-44 bg-black/60 backdrop-blur-xl rounded-xl py-2 z-50 border border-white/10">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => changeLanguage(lang.code)}
                    className={`w-full px-4 py-3 text-left hover:bg-white/10 flex items-center gap-3 ${i18n.language === lang.code ? 'text-pink-400 font-semibold' : 'text-white/70'}`}
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

      {/* Main content */}
      <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
        <div className={`w-full max-w-md transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>

          {/* Logo & Brand */}
          <div className="text-center mb-10">
            <div className="relative inline-block">
              {/* Glow effect */}
              <div className="absolute inset-0 bg-pink-500/30 blur-2xl rounded-full scale-150" />
              <div className="relative w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-2xl shadow-pink-500/30 transform hover:scale-105 transition-transform duration-300">
                <span className="text-5xl">🧋</span>
              </div>
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-400 via-rose-400 to-purple-400 bg-clip-text text-transparent">
              {t('auth.appName')}
            </h1>
            <p className="text-white/40 mt-2 text-sm tracking-wider uppercase">{t('auth.appSubtitle')}</p>
          </div>

          {/* Login card - Glassmorphism */}
          <div className="relative group">
            {/* Glow border */}
            <div className="absolute -inset-[1px] bg-gradient-to-r from-pink-500/50 via-purple-500/50 to-pink-500/50 rounded-2xl opacity-50 group-hover:opacity-80 transition-opacity duration-500 blur-sm" />

            <div className="relative bg-black/40 backdrop-blur-2xl rounded-2xl border border-white/10 p-8 shadow-2xl">
              {/* Header */}
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-white mb-1">{t('auth.loginTitle')}</h2>
                <p className="text-white/40 text-sm">{t('auth.loginSubtitle') || 'Welcome back to your workspace'}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm text-center backdrop-blur-sm">
                    <Sparkles size={14} className="inline mr-2 opacity-60" />
                    {error}
                  </div>
                )}

                {/* Phone input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/60">{t('auth.phone')}</label>
                  <div className="relative group/input">
                    <div className="absolute inset-0 bg-gradient-to-r from-pink-500/20 to-purple-500/20 rounded-xl opacity-0 group-hover/input:opacity-100 transition-opacity duration-300 blur-sm" />
                    <div className="relative flex items-center">
                      <div className="absolute left-4 flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 border border-white/10">
                        <Phone size={14} className="text-pink-400/70" />
                      </div>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="081234567890"
                        className="w-full pl-14 pr-4 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-pink-500/50 focus:bg-white/10 transition-all text-center"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Password input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/60">{t('auth.password')}</label>
                  <div className="relative group/input">
                    <div className="absolute inset-0 bg-gradient-to-r from-pink-500/20 to-purple-500/20 rounded-xl opacity-0 group-hover/input:opacity-100 transition-opacity duration-300 blur-sm" />
                    <div className="relative flex items-center">
                      <div className="absolute left-4 flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 border border-white/10">
                        <Lock size={14} className="text-pink-400/70" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-14 pr-12 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-pink-500/50 focus:bg-white/10 transition-all text-center"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 text-white/30 hover:text-white/60 transition-colors"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="relative w-full mt-6 group/btn"
                >
                  {/* Glow background */}
                  <div className="absolute -inset-[2px] bg-gradient-to-r from-pink-500 via-rose-500 to-purple-500 rounded-xl opacity-50 blur transition-all duration-500 group-hover/btn:opacity-80 group-hover/btn:blur-sm" />

                  <div className="relative flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 text-white font-bold text-lg overflow-hidden">
                    {/* Shimmer effect */}
                    <div className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                    {loading ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <>
                        <span>{t('auth.login')}</span>
                        <ArrowRight size={18} className="group-hover/btn:translate-x-1 transition-transform" />
                      </>
                    )}
                  </div>
                </button>
              </form>

              {/* Register link */}
              <p className="mt-6 text-center text-white/40 text-sm">
                {t('auth.noAccount')}{' '}
                <Link to="/register" className="text-pink-400 font-semibold hover:text-pink-300 transition-colors">
                  {t('auth.createAccount')}
                </Link>
              </p>
            </div>
          </div>

          {/* Test account card */}
          <div className="mt-4 p-4 bg-black/20 backdrop-blur-xl rounded-xl border border-white/5">
            <p className="text-center text-xs text-white/30 uppercase tracking-wider mb-3">{t('auth.testAccount')}</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-white/5 rounded-lg p-3 text-center border border-white/5">
                <div className="text-white/30 text-xs mb-1">{t('auth.phone')}</div>
                <div className="font-mono text-pink-400/80 text-sm">081234567890</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center border border-white/5">
                <div className="text-white/30 text-xs mb-1">{t('auth.password')}</div>
                <div className="font-mono text-pink-400/80 text-sm">admin123</div>
              </div>
            </div>
          </div>

          {/* Copyright */}
          <p className="text-center text-white/20 text-xs mt-8 tracking-wider">
            {t('auth.copyright')}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
        }
        .animate-float {
          animation: float 20s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
