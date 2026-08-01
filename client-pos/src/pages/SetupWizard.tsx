import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Wifi, WifiOff, AlertCircle, CheckCircle, ArrowLeft, ArrowRight, User, Phone, Lock, Store, Eye, EyeOff } from 'lucide-react'
import { syncConnect, syncFull, checkSyncStatus, registerStore } from '../services/syncApi'

export function SetupWizard() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'login' | 'register' | 'syncing' | 'done'>('login')
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

  // Registration state
  const [regForm, setRegForm] = useState({ name: '', phone: '', password: '', storeName: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [regStep, setRegStep] = useState(1)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await registerStore(regForm.name, regForm.phone, regForm.password, regForm.storeName)
      // Auto-fill login after register
      setPhone(regForm.phone)
      setPassword(regForm.password)
      setStep('login')
    } catch (err: any) {
      setError(err.message || 'Registration failed')
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
          <div className="text-5xl mb-2">🧋</div>
          <h1 className="text-2xl font-bold text-gray-800">BubbleTeaPOS</h1>
          <p className="text-gray-500 text-sm mt-1">首次设置 · First Setup</p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start gap-3">
            <AlertCircle className="text-red-500 mt-0.5 flex-shrink-0" size={20} />
            <div>
              <p className="text-red-700 text-sm font-medium">连接失败</p>
              <p className="text-red-600 text-xs mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Login Step */}
        {step === 'login' && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <Wifi className="text-pink-500" size={20} />
              <h2 className="font-semibold text-gray-800">连接云端账户</h2>
            </div>
            <p className="text-gray-500 text-sm mb-4">
              输入您的门店管理员账户（手机号 + 密码）<br />
              <span className="text-xs">从云端同步产品、分类和配置</span>
            </p>

            <form onSubmit={handleConnect} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">手机号</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0812xxxxxxxx"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
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
                    连接中...
                  </>
                ) : (
                  '连接云端同步 ➜'
                )}
              </button>
            </form>

            <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
              <WifiOff size={14} />
              <span>离线模式：安装后需联网设置一次，之后可完全离线使用</span>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 text-center">
              <span className="text-xs text-gray-400">还没有账户？</span>
              <button
                type="button"
                onClick={() => { setStep('register'); setRegStep(1); setError(''); }}
                className="text-xs text-pink-500 font-medium ml-1 hover:underline"
              >
                立即创建门店账户 ➜
              </button>
            </div>
          </div>
        )}

        {/* Register Step */}
        {step === 'register' && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <button
              onClick={() => setStep('login')}
              className="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm mb-4 transition-colors"
            >
              <ArrowLeft size={16} /> 返回登录
            </button>

            <div className="flex items-center gap-2 mb-4">
              <User className="text-pink-500" size={20} />
              <h2 className="font-semibold text-gray-800">创建新门店账户</h2>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-600 text-xs">
                {error}
              </div>
            )}

            {regStep === 1 && (
              <form onSubmit={(e) => { e.preventDefault(); if (regForm.name && regForm.phone && regForm.password) setRegStep(2); }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={regForm.name}
                      onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                      placeholder="您的姓名"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">手机号</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="tel"
                      value={regForm.phone}
                      onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                      placeholder="0812xxxxxxxx"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={regForm.password}
                      onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                      placeholder="至少6位"
                      className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                      required
                      minLength={6}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full bg-pink-500 hover:bg-pink-600 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  下一步 <ArrowRight size={18} />
                </button>
              </form>
            )}

            {regStep === 2 && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">门店名称</label>
                  <div className="relative">
                    <Store size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={regForm.storeName}
                      onChange={(e) => setRegForm({ ...regForm, storeName: e.target.value })}
                      placeholder="我的奶茶店（选填）"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">不填则默认使用"姓名+的奶茶店"</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 space-y-1">
                  <div className="flex justify-between"><span className="text-gray-400">姓名:</span><span>{regForm.name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">手机:</span><span>{regForm.phone}</span></div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setRegStep(1)}
                    className="flex-1 bg-gray-100 text-gray-700 font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    <ArrowLeft size={18} /> 返回
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-pink-500 hover:bg-pink-600 disabled:bg-pink-300 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    {loading ? <Loader2 className="animate-spin" size={18} /> : null}
                    {loading ? '创建中...' : '创建账户 ➜'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Syncing Step */}
        {step === 'syncing' && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="flex justify-center mb-4">
              <Loader2 className="animate-spin text-pink-500" size={48} />
            </div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">同步数据中...</h2>
            <p className="text-gray-500 text-sm">
              正在从云端拉取产品、分类、配置等数据<br />
              请保持网络连接
            </p>
          </div>
        )}

        {/* Done Step */}
        {step === 'done' && syncResult && (
          <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle className="text-green-500" size={48} />
            </div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">同步完成！</h2>
            <p className="text-gray-600 text-sm mb-1">
              门店：<strong>{syncResult.storeName}</strong>
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
              <p className="text-xs text-gray-500 mb-2">已同步数据：</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">分类</span>
                  <span className="font-medium text-gray-800">{syncResult.categories}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">产品</span>
                  <span className="font-medium text-gray-800">{syncResult.products}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">规格</span>
                  <span className="font-medium text-gray-800">{syncResult.specs}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">加料</span>
                  <span className="font-medium text-gray-800">{syncResult.addons}</span>
                </div>
              </div>
            </div>
            <button
              onClick={handleDone}
              className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              开始使用 ➜
            </button>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-gray-400 text-xs mt-6">
          BubbleTeaPOS v2026.7
        </p>
      </div>
    </div>
  )
}
