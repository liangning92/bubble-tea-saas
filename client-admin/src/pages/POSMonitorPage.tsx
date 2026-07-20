import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { posActionLogApi } from '../services/api'
import {
  AlertTriangle,
  ShieldAlert,
  Info,
  Clock,
  User,
  ShoppingCart,
  CheckCircle,
  XCircle,
  RefreshCw,
  Loader2,
  Activity,
  Filter,
} from 'lucide-react'

const ACTION_LABELS: Record<string, string> = {
  login: '登录',
  logout: '退出',
  cart_add: '加商品',
  cart_update: '修改商品',
  cart_clear: '清空购物车',
  checkout_start: '开始结账',
  checkout_complete: '结账完成',
  order_created: '创建订单',
  suspend: '挂单',
  resume: '取单',
  member_add: '添加会员',
  member_remove: '移除会员',
  shift_open: '开班',
  shift_close: '交班',
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  login: <User size={14} />,
  logout: <User size={14} />,
  cart_add: <ShoppingCart size={14} />,
  cart_update: <RefreshCw size={14} />,
  cart_clear: <XCircle size={14} />,
  checkout_start: <Activity size={14} />,
  checkout_complete: <CheckCircle size={14} />,
  order_created: <CheckCircle size={14} />,
  suspend: <Clock size={14} />,
  resume: <RefreshCw size={14} />,
  member_add: <User size={14} />,
  member_remove: <User size={14} />,
  shift_open: <Clock size={14} />,
  shift_close: <Clock size={14} />,
}

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === 'critical') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
        <ShieldAlert size={12} />
        严重
      </span>
    )
  }
  if (severity === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">
        <AlertTriangle size={12} />
        警告
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
      <Info size={12} />
      信息
    </span>
  )
}

export function POSMonitorPage() {
  const [filter, setFilter] = useState({
    severity: '',
    action: '',
    staffId: '',
    dateRange: 'today',
    page: 1,
  })
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Build date range
  const getDateRange = () => {
    const now = new Date()
    let startDate: string | undefined
    let endDate: string | undefined

    switch (filter.dateRange) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0)).toISOString()
        break
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7)).toISOString()
        break
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1)).toISOString()
        break
    }
    return { startDate, endDate }
  }

  const { startDate, endDate } = getDateRange()

  // Fetch logs
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pos-action-logs', filter],
    queryFn: () => posActionLogApi.list({
      page: filter.page,
      limit: 50,
      severity: filter.severity || undefined,
      action: filter.action || undefined,
      staffId: filter.staffId || undefined,
      startDate,
      endDate,
    }),
    refetchInterval: autoRefresh ? 15000 : false,
  })

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['pos-alert-stats'],
    queryFn: () => posActionLogApi.getStats({ startDate, endDate }),
    refetchInterval: autoRefresh ? 30000 : false,
  })

  // Fetch active sessions
  const { data: sessionsData } = useQuery({
    queryKey: ['pos-active-sessions'],
    queryFn: () => posActionLogApi.getSessions(),
    refetchInterval: autoRefresh ? 10000 : false,
  })

  const logs = data?.data?.data?.logs || []
  const stats = statsData?.data?.data
  const activeSessions = sessionsData?.data?.data || []

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">POS 操作监控</h1>
          <p className="text-sm text-gray-500 mt-1">收银员操作审计与预警</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300"
            />
            自动刷新 (15s)
          </label>
          <button onClick={() => refetch()} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={16} />
            刷新
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-100">
            <ShieldAlert size={20} className="text-red-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">严重预警</p>
            <p className="text-xl font-bold text-red-600">{stats?.criticalCount || 0}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-100">
            <AlertTriangle size={20} className="text-orange-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">警告</p>
            <p className="text-xl font-bold text-orange-600">{stats?.warningCount || 0}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100">
            <Activity size={20} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">今日操作</p>
            <p className="text-xl font-bold text-blue-600">{stats?.todayTotal || 0}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className={`p-2 rounded-lg ${activeSessions.length > 0 ? 'bg-orange-100' : 'bg-green-100'}`}>
            <ShoppingCart size={20} className={activeSessions.length > 0 ? 'text-orange-600' : 'text-green-600'} />
          </div>
          <div>
            <p className="text-sm text-gray-500">未结账会话</p>
            <p className="text-xl font-bold">{activeSessions.length}</p>
          </div>
        </div>
      </div>

      {/* Active Sessions Alert */}
      {activeSessions.length > 0 && (
        <div className="card border-orange-200 bg-orange-50/50 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-orange-600" />
            <h3 className="font-semibold text-orange-800">进行中的未结账会话</h3>
          </div>
          <div className="space-y-2">
            {activeSessions.map((session: any) => (
              <div key={session.sessionId} className="flex items-center justify-between p-3 bg-white rounded-lg border border-orange-200">
                <div className="flex items-center gap-3">
                  <User size={16} className="text-gray-400" />
                  <div>
                    <p className="font-medium">{session.staffName}</p>
                    <p className="text-xs text-gray-500">
                      最后操作: {session.lastAction} · {formatTime(session.lastActionAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-orange-600">
                    {session.itemCount} 件商品未结账
                  </span>
                  <SeverityBadge severity="warning" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-700">筛选:</span>
          </div>

          <select
            value={filter.dateRange}
            onChange={(e) => setFilter({ ...filter, dateRange: e.target.value, page: 1 })}
            className="input w-32"
          >
            <option value="today">今日</option>
            <option value="week">本周</option>
            <option value="month">本月</option>
          </select>

          <select
            value={filter.severity}
            onChange={(e) => setFilter({ ...filter, severity: e.target.value, page: 1 })}
            className="input w-32"
          >
            <option value="">全部严重度</option>
            <option value="critical">严重</option>
            <option value="warning">警告</option>
            <option value="info">信息</option>
          </select>

          <select
            value={filter.action}
            onChange={(e) => setFilter({ ...filter, action: e.target.value, page: 1 })}
            className="input w-40"
          >
            <option value="">全部操作</option>
            {Object.entries(ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          {(filter.severity || filter.action) && (
            <button
              onClick={() => setFilter({ ...filter, severity: '', action: '', page: 1 })}
              className="text-sm text-red-500 hover:text-red-700"
            >
              清除筛选
            </button>
          )}
        </div>
      </div>

      {/* Logs Table */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">操作日志</h2>
          <span className="text-sm text-gray-500">{logs.length} 条记录</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Activity size={40} className="mx-auto mb-3 text-gray-300" />
            <p>暂无操作记录</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log: any) => (
              <div
                key={log.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors hover:bg-gray-50 ${
                  log.severity === 'critical' ? 'border-red-200 bg-red-50/30' :
                  log.severity === 'warning' ? 'border-orange-200 bg-orange-50/30' :
                  'border-gray-200'
                }`}
              >
                <div className="mt-0.5">
                  {ACTION_ICONS[log.action] || <Info size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{log.staffName}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-sm text-gray-600">
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                    <SeverityBadge severity={log.severity} />
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{log.description}</p>
                  {log.metadata && log.severity !== 'info' && (
                    <p className="text-xs text-gray-400 mt-1 font-mono">
                      {JSON.stringify(log.metadata)}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-500">{formatDate(log.createdAt)}</p>
                  <p className="text-xs text-gray-400">{formatTime(log.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {data?.data?.data?.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              onClick={() => setFilter({ ...filter, page: Math.max(1, filter.page - 1) })}
              disabled={filter.page === 1}
              className="btn-secondary disabled:opacity-50"
            >
              上一页
            </button>
            <span className="text-sm text-gray-500">
              第 {filter.page} / {data?.data?.data?.totalPages || 1} 页
            </span>
            <button
              onClick={() => setFilter({ ...filter, page: filter.page + 1 })}
              disabled={filter.page >= (data?.data?.data?.totalPages || 1)}
              className="btn-secondary disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
