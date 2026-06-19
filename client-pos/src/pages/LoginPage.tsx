import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import axios from 'axios'
import { getApiUrl, setApiUrl, clearApiUrl } from '../config'
import { updateApiUrl } from '../services/api'
import { connectionManager } from '../services/ConnectionManager'
import { Eye, EyeOff, Loader2, Phone, Lock, ArrowRight, Sparkles } from 'lucide-react'

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showApiConfig, setShowApiConfig] = useState(false)
  const [apiUrl, setApiUrlInput] = useState(getApiUrl())
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await axios.post(`${getApiUrl()}/auth/login`, { phone, password })
      const { token, user } = res.data.data
      login(token, user)

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

  return (
    <div className="min-h-screen bg-[#0a0a0f] relative overflow-hidden flex items-center justify-center p-4">
      {/* Animated gradient background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-pink-500/20 via-transparent to-purple-500/20 animate-pulse" />
        <div className="absolute inset-0 bg-gradient-to-tr from-rose-500/10 via-transparent to-pink-500/10" />
      </div>

      {/* Floating orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[
          { x: 10, y: 20, size: 300, duration: 18, delay: 0 },
          { x: 70, y: 60, size: 200, duration: 22, delay: 3 },
          { x: 40, y: 80, size: 250, duration: 20, delay: 6 }
        ].map((orb, i) => (
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

      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />

      {/* Login card */}
      <div className={`w-full max-w-sm relative z-10 transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-pink-500/30 blur-2xl rounded-full scale-150" />
            <div className="relative w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-2xl shadow-pink-500/30">
              <span className="text-4xl">🧋</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-400 via-rose-400 to-purple-400 bg-clip-text text-transparent">
            {t('login.title')}
          </h1>
          <p className="text-white/40 mt-2 text-sm">{t('login.subtitle')}</p>
        </div>

        {/* API Config Toggle */}
        <div className="mb-4 text-center">
          <button
            type="button"
            onClick={() => setShowApiConfig(!showApiConfig)}
            className="text-xs text-white/30 hover:text-white/50 transition-colors underline underline-offset-2"
          >
            {showApiConfig ? t('login.hideApiConfig') : t('login.showApiConfig')}
          </button>
        </div>

        {/* API Config Panel */}
        {showApiConfig && (
          <div className="mb-4 bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl p-4">
            <h3 className="text-sm font-medium text-white/60 mb-3">{t('login.apiServerConfig')}</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrlInput(e.target.value)}
                placeholder="https://api.example.com"
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-pink-500/50"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveApiUrl}
                  className="flex-1 bg-pink-500/20 text-pink-400 py-2 rounded-lg text-sm font-medium hover:bg-pink-500/30 transition-colors border border-pink-500/30"
                >
                  {t('common.save')}
                </button>
                <button
                  type="button"
                  onClick={handleResetApiUrl}
                  className="px-3 py-2 text-white/30 text-sm hover:text-white/50 transition-colors"
                >
                  {t('login.resetDefault')}
                </button>
              </div>
              <p className="text-xs text-white/20">
                {t('login.currentApi')}: {getApiUrl()}
              </p>
            </div>
          </div>
        )}

        {/* Login form - Glassmorphism */}
        <div className="relative group">
          <div className="absolute -inset-[1px] bg-gradient-to-r from-pink-500/30 via-purple-500/30 to-pink-500/30 rounded-2xl opacity-30 group-hover:opacity-50 transition-opacity duration-500 blur-sm" />

          <div className="relative bg-black/50 backdrop-blur-2xl rounded-2xl border border-white/10 p-8 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-6 text-center">{t('login.loginTitle')}</h2>

            <form onSubmit={handleLogin} className="space-y-5">
              {error && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm text-center backdrop-blur-sm">
                  <Sparkles size={14} className="inline mr-2 opacity-60" />
                  {error}
                </div>
              )}

              {/* Phone */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/50">{t('login.phone')}</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 border border-white/10">
                    <Phone size={14} className="text-pink-400/70" />
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="081234567890"
                    className="w-full pl-14 pr-4 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-pink-500/50 focus:bg-white/10 transition-all text-center text-lg"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/50">{t('login.password')}</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 border border-white/10">
                    <Lock size={14} className="text-pink-400/70" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-14 pr-12 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-pink-500/50 focus:bg-white/10 transition-all text-center text-lg"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="relative w-full mt-6 group/btn"
              >
                <div className="absolute -inset-[2px] bg-gradient-to-r from-pink-500 via-rose-500 to-purple-500 rounded-xl opacity-40 blur transition-all duration-500 group-hover/btn:opacity-70 group-hover/btn:blur-sm" />
                <div className="relative flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 text-white font-bold text-lg">
                  <div className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  {loading ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <>
                      <span>{t('login.loginButton')}</span>
                      <ArrowRight size={18} className="group-hover/btn:translate-x-1 transition-transform" />
                    </>
                  )}
                </div>
              </button>
            </form>
          </div>
        </div>

        {/* Demo Info */}
        <div className="mt-4 p-4 bg-black/20 backdrop-blur-xl rounded-xl border border-white/5">
          <p className="text-center text-xs text-white/30 uppercase tracking-wider mb-2">{t('login.testAccount')}</p>
          <div className="text-center text-white/40 text-xs space-y-1">
            <p>{t('login.roleAdmin')}: <span className="font-mono text-pink-400/60">081234567890</span></p>
            <p>{t('login.roleCashier')}: <span className="font-mono text-pink-400/60">081234567892</span></p>
            <p>{t('login.testPassword')}: <span className="font-mono text-pink-400/60">admin123</span></p>
          </div>
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
