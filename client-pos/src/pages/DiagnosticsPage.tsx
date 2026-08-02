import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getApiUrl } from '../config'
import { connectionManager } from '../services/ConnectionManager'

interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  timestamp: string
}

interface DiagnosticStatus {
  api: 'ok' | 'error' | 'checking'
  apiLatency: number | null
  db: 'ok' | 'error' | 'unknown'
  network: 'online' | 'offline'
  version: string
  userData: string
  logs: LogEntry[]
  errors: string[]
}

export function DiagnosticsPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<DiagnosticStatus>({
    api: 'checking',
    apiLatency: null,
    db: 'unknown' as 'ok' | 'error' | 'unknown',
    network: navigator.onLine ? 'online' : 'offline',
    version: '',
    userData: '',
    logs: [],
    errors: [],
  })
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'network'>('overview')

  useEffect(() => {
    loadDiagnostics()
  }, [])

  const loadDiagnostics = async () => {
    // Version
    let version = 'unknown'
    try {
      version = await (window as any).electronAPI?.getAppVersion?.() || import.meta.env.VITE_APP_VERSION || 'dev'
    } catch {}

    // API test
    let apiStatus: 'ok' | 'error' = 'error'
    let latency: number | null = null
    const apiUrl = getApiUrl()
    try {
      const start = Date.now()
      const res = await fetch(`${apiUrl}/health`, { method: 'GET', signal: AbortSignal.timeout(5000) })
      latency = Date.now() - start
      apiStatus = res.ok ? 'ok' : 'error'
    } catch {}

    // DB test
    let dbStatus: 'ok' | 'error' | 'unknown' = 'unknown'
    try {
      if ('indexedDB' in window) {
        const dbs = await indexedDB.databases()
        dbStatus = dbs.length >= 0 ? 'ok' : 'error'
      }
    } catch { dbStatus = 'error' }

    // Electron log entries via IPC
    let logs: LogEntry[] = []
    let errors: string[] = []
    try {
      const logData = await (window as any).electronAPI?.getLogEntries?.()
      if (logData) {
        logs = JSON.parse(logData)
        errors = logs.filter(l => l.level === 'error').map(l => l.message)
      }
    } catch {}

    setStatus(prev => ({
      ...prev,
      api: apiStatus,
      apiLatency: latency,
      db: dbStatus,
      network: navigator.onLine ? 'online' : 'offline',
      version,
      logs,
      errors,
    }))
  }

  const statusColor = (s: 'ok' | 'error' | 'checking' | 'unknown' | 'online' | 'offline') => {
    switch (s) {
      case 'ok': return 'text-green-600 bg-green-50'
      case 'online': return 'text-green-600 bg-green-50'
      case 'error': return 'text-red-600 bg-red-50'
      case 'offline': return 'text-red-600 bg-red-50'
      case 'checking': return 'text-yellow-600 bg-yellow-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const StatusBadge = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center gap-3 p-3 bg-white rounded-xl border">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className={`px-2 py-1 rounded-full text-xs font-bold ${statusColor(value as any)}`}>
        {value.toUpperCase()}
      </span>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">🔧 诊断中心</h1>
          <button onClick={loadDiagnostics} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">
            刷新
          </button>
        </div>

        {/* Tabs */}
        <div className="flex bg-white rounded-xl overflow-hidden border">
          {(['overview', 'logs', 'network'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-medium ${activeTab === tab ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {tab === 'overview' ? '总览' : tab === 'logs' ? '日志' : '网络'}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <StatusBadge label="云端API" value={status.api} />
              <StatusBadge label="本地网络" value={status.network} />
              <StatusBadge label="本地数据库" value={status.db} />
              <div className="flex items-center gap-3 p-3 bg-white rounded-xl border">
                <span className="text-gray-500 text-sm">API延迟</span>
                <span className={`font-bold ${status.apiLatency && status.apiLatency < 1000 ? 'text-green-600' : 'text-red-600'}`}>
                  {status.apiLatency ? `${status.apiLatency}ms` : '-'}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-xl border p-3 space-y-2">
              <h2 className="font-bold text-sm text-gray-700">系统信息</h2>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">版本</span>
                  <span className="font-mono">{status.version}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">API地址</span>
                  <span className="font-mono text-xs">{getApiUrl()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">错误数</span>
                  <span className={`font-bold ${status.errors.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {status.errors.length}
                  </span>
                </div>
              </div>
            </div>

            {status.errors.length > 0 && (
              <div className="bg-red-50 rounded-xl border border-red-200 p-3">
                <h2 className="font-bold text-sm text-red-700 mb-2">⚠️ 最新错误</h2>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {status.errors.slice(-5).reverse().map((err, i) => (
                    <div key={i} className="text-xs text-red-600 font-mono bg-red-100 rounded p-2 break-all">
                      {err}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="p-3 border-b bg-gray-50">
              <span className="text-sm font-medium">最近日志（来自 electron-log）</span>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {status.logs.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">暂无日志</div>
              ) : (
                <div className="divide-y">
                  {status.logs.slice(-50).reverse().map((log, i) => (
                    <div key={i} className={`px-3 py-2 text-xs font-mono ${log.level === 'error' ? 'bg-red-50 text-red-700' : log.level === 'warn' ? 'bg-yellow-50 text-yellow-700' : 'text-gray-600'}`}>
                      <span className="text-gray-400 mr-2">{log.timestamp}</span>
                      <span className={`mr-2 font-bold uppercase text-[10px] ${log.level === 'error' ? 'text-red-500' : log.level === 'warn' ? 'text-yellow-500' : 'text-blue-500'}`}>[{log.level}]</span>
                      {log.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'network' && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl border p-4">
              <h2 className="font-bold text-sm mb-3">🌐 API 连接测试</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">API地址</span>
                  <span className="font-mono text-xs">{getApiUrl()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">状态</span>
                  <span className={`font-bold ${status.api === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                    {status.api === 'ok' ? '✅ 可连接' : '❌ 不可连接'}
                  </span>
                </div>
                {status.apiLatency && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">响应时间</span>
                    <span className={`font-bold ${status.apiLatency < 1000 ? 'text-green-600' : 'text-yellow-600'}`}>
                      {status.apiLatency}ms
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border p-4">
              <h2 className="font-bold text-sm mb-3">💾 IndexedDB 状态</h2>
              <div className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">数据库</span>
                  <span className={`font-bold ${status.db === 'ok' ? 'text-green-600' : 'text-gray-600'}`}>
                    {status.db === 'ok' ? '✅ 正常' : status.db === 'error' ? '❌ 异常' : '❓ 未知'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
