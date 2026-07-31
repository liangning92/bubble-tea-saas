import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Wifi, WifiOff, AlertCircle, CheckCircle } from 'lucide-react'
import { syncConnect, syncFull, checkSyncStatus } from '../services/syncApi'

export function SetupWizard() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'login' | 'syncing' | 'done'>('login')
  const [syncResult, setSyncResult] = useState<{ storeName: string; products: number } | null>(null)

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Step 1: Connect to cloud and get storeId + token + passwordHash
      const connResult = await syncConnect(phone, password)

      // Step 2: Full sync (creates local User so login works)
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
            <p className="text-gray-500 text-xs mb-6">
              已同步 {syncResult.products} 个产品
            </p>
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
