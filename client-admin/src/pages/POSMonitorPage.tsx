import { readPOSFailure } from '../utils/posMonitorFailure'
import { formatCurrency } from '../utils/helpers'
import { useMemo, useEffect } from 'react'
import { useDashboardContext, requireRead, finiteNumber, businessDay } from '../utils/dashboardNavigation'
import { DashboardReadFailure, DashboardContextNotice } from '../components/DashboardReadState'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { posActionLogApi, orderApi } from '../services/api'
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

const RECEIPT_REASON_KEYS:Record<string,string> = {PAYMENT_CONFIG_UNAVAILABLE:'receiptPaymentConfig',PAYMENT_METHOD_DISABLED:'receiptPaymentDisabled',OPEN_SHIFT_REQUIRED:'receiptShift',SHIFT_DISABLED:'receiptShift',INVENTORY_INSUFFICIENT:'receiptInventory'}

const ACTION_KEY_MAP: Record<string, string> = {
  login: 'actionLogin',
  logout: 'actionLogout',
  cart_add: 'actionCartAdd',
  cart_update: 'actionCartUpdate',
  cart_clear: 'actionCartClear',
  checkout_start: 'actionCheckoutStart',
  checkout_complete: 'actionCheckoutComplete',
  checkout_failed: 'actionCheckoutFailed',
  received_receipt: 'actionReceivedReceipt',
  order_created: 'actionOrderCreated',
  suspend: 'actionSuspend',
  resume: 'actionResume',
  member_add: 'actionMemberAdd',
  member_remove: 'actionMemberRemove',
  shift_open: 'actionShiftOpen',
  shift_close: 'actionShiftClose',
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  login: <User size={14} />,
  logout: <User size={14} />,
  cart_add: <ShoppingCart size={14} />,
  cart_update: <RefreshCw size={14} />,
  cart_clear: <XCircle size={14} />,
  checkout_start: <Activity size={14} />,
  checkout_complete: <CheckCircle size={14} />,
  checkout_failed: <AlertTriangle size={14} />,
  order_created: <CheckCircle size={14} />,
  suspend: <Clock size={14} />,
  resume: <RefreshCw size={14} />,
  member_add: <User size={14} />,
  member_remove: <User size={14} />,
  shift_open: <Clock size={14} />,
  shift_close: <Clock size={14} />,
}

function POSFailureDetails({ metadata }: { metadata: unknown }) {
  const { t } = useTranslation()
  const failure = readPOSFailure(metadata)
  return <div className="mt-2 rounded-lg bg-red-50 border border-red-100 p-3 text-sm" data-testid="pos-failure-reason">
    <p className="text-red-800"><span className="font-semibold">{t('posMonitor.failureReason')}: </span>{t(`posMonitor.${failure.reasonKey}`)}</p>
    {failure.code && <p className="mt-1 text-xs text-red-700 break-words">{t('posMonitor.failureCode')}: <code>{failure.code}</code>{failure.httpStatus ? ` · HTTP ${failure.httpStatus}` : ''}</p>}
    {failure.needsReview && <p className="mt-1 text-xs text-red-700">{t('posMonitor.failureNeedsReview')}</p>}
  </div>
}

function SeverityBadge({ severity }: { severity: string }) {
  const { t } = useTranslation()
  const severityKey = severity === 'critical' ? 'severityCritical'
    : severity === 'warning' ? 'severityWarning'
    : 'severityInfo'
  const Icon = severity === 'critical' ? ShieldAlert
    : severity === 'warning' ? AlertTriangle
    : Info
  const colorClass = severity === 'critical' ? 'bg-red-100 text-red-700 border-red-200'
    : severity === 'warning' ? 'bg-orange-100 text-orange-700 border-orange-200'
    : 'bg-blue-100 text-blue-700 border-blue-200'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}>
      <Icon size={12} />
      {t(`posMonitor.${severityKey}`)}
    </span>
  )
}

export function POSMonitorPage() {
  const context=useDashboardContext()
  const { t } = useTranslation()
  const [filter, setFilter] = useState({
    severity: '',
    action: '',
    staffId: '',
    dateRange: context.startDate ? 'dashboard' : 'today',
    page: 1,
  })
  useEffect(()=>{setFilter(prev=>({...prev,dateRange:context.startDate?'dashboard':'today',page:1}))},[context.startDate,context.endDate])
  const [autoRefresh, setAutoRefresh] = useState(true)

  const [rangeClock, setRangeClock] = useState(()=>Date.now())
  useEffect(()=>{
    if (!autoRefresh) return
    setRangeClock(Date.now())
    const timer = window.setInterval(()=>setRangeClock(Date.now()),15000)
    return ()=>window.clearInterval(timer)
  },[autoRefresh])

  // Build date range
  const getDateRange = () => {
    const now = new Date(rangeClock)
    let startDate: string | undefined
    let endDate: string | undefined

    switch (filter.dateRange) {
      case 'today':
        startDate = businessDay(now.toISOString()).startDate
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

  const { startDate, endDate } = useMemo(()=>filter.dateRange==='dashboard'?{startDate:context.startDate,endDate:context.endDate}:getDateRange(),[filter.dateRange,context.startDate,context.endDate,rangeClock])

  const {data:unpostedData,isError:receiptError,isPending:receiptPending,refetch:refetchReceipts} = useQuery({
    queryKey:['received-receipts',context.storeId],enabled:context.valid,
    queryFn:async()=>{const response=await orderApi.receivedReceipts();return requireRead(response,Array.isArray(response.data?.data))},
    refetchInterval:autoRefresh?15000:false,
  })
  const unposted = unpostedData?.data?.data || []
  // Fetch logs
  const { data, isLoading, isError:logsError, refetch } = useQuery({
    queryKey: ['pos-action-logs',context.storeId,startDate,endDate,filter],
    enabled:context.valid,
    queryFn: async () => {const response=await posActionLogApi.list({
      page: filter.page,
      limit: 50,
      severity: filter.severity || undefined,
      action: filter.action || undefined,
      staffId: filter.staffId || undefined,
      startDate,
      endDate,
    });return requireRead(response,Array.isArray(response.data?.data?.logs))},
    refetchInterval: autoRefresh ? 15000 : false,
  })

  // Fetch stats
  const { data: statsData, isError:statsError, isPending:statsPending, refetch:refetchStats } = useQuery({
    queryKey: ['pos-alert-stats',context.storeId,startDate,endDate],
    enabled:context.valid,
    queryFn: async () => {const response=await posActionLogApi.getStats({startDate,endDate});return requireRead(response,['warningCount','criticalCount','todayTotal'].every(k=>finiteNumber(response.data?.data?.[k])))},
    refetchInterval: autoRefresh ? 30000 : false,
  })

  // Fetch active sessions
  const { data: sessionsData, isError:sessionsError, isPending:sessionsPending, refetch:refetchSessions } = useQuery({
    queryKey: ['pos-active-sessions',context.storeId],
    enabled:context.valid,
    queryFn: async () => {const response=await posActionLogApi.getSessions();return requireRead(response,Array.isArray(response.data?.data))},
    refetchInterval: autoRefresh ? 10000 : false,
  })

  const refreshAll = () => {
    void refetchReceipts()
    // Changing the anchor triggers fresh queries for relative ranges; fixed URL
    // ranges retain their keys and are explicitly refetched with current sessions.
    setRangeClock(Date.now())
    return Promise.all([refetch(),refetchStats(),refetchSessions()])
  }

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

  if (!context.valid) return <DashboardReadFailure scope />
  if (logsError || statsError || sessionsError || receiptError) return <DashboardReadFailure retry={refreshAll} />
  if (isLoading || statsPending || sessionsPending || receiptPending) return <p>{t('common.loading')}</p>
  return (
    <div className="p-6">
      <DashboardContextNotice range={{startDate,endDate}} />
      <p className="text-sm text-gray-500 mb-2">{t('dashboardNavigation.sessionsCurrent')}</p>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('posMonitor.pageTitle')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('posMonitor.pageSubtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300"
            />
            {t('posMonitor.autoRefresh')}
          </label>
          <button onClick={refreshAll} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={16} />
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {!!unposted.length && <section role="alert" className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4">
        <h2 className="font-bold text-red-800">{t('posMonitor.unpostedReceipts')} · {unposted.length} · Rp {unposted.reduce((sum:number,row:any)=>sum+row.grandTotal,0).toLocaleString('id-ID')}</h2>
        <ul className="mt-2 text-sm space-y-1">{unposted.map((row:any)=><li key={row.id}>{row.orderNumber} · Rp {row.grandTotal.toLocaleString('id-ID')} · {row.paymentMethod} · {row.staffName || row.staffId} · {new Date(row.occurredAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})}{row.cashTender && <span className="ml-2">{t('posMonitor.receivedCash')}: Rp {row.cashTender.receivedCash.toLocaleString('id-ID')} · {t('posMonitor.changeGiven')}: Rp {row.cashTender.changeGiven.toLocaleString('id-ID')}</span>}{row.failureReason && <span className="ml-2 text-red-700">{t('posMonitor.'+(RECEIPT_REASON_KEYS[String(row.failureReason).split(':')[0]] || 'receiptNeedsReview'))}</span>}</li>)}</ul>
      </section>}
      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-100">
            <ShieldAlert size={20} className="text-red-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('posMonitor.criticalAlerts')}</p>
            <p className="text-xl font-bold text-red-600">{stats?.criticalCount || 0}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-100">
            <AlertTriangle size={20} className="text-orange-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('posMonitor.warnings')}</p>
            <p className="text-xl font-bold text-orange-600">{stats?.warningCount || 0}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100">
            <Activity size={20} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('posMonitor.todayOperations')}</p>
            <p className="text-xl font-bold text-blue-600">{stats?.todayTotal || 0}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className={`p-2 rounded-lg ${activeSessions.length > 0 ? 'bg-orange-100' : 'bg-green-100'}`}>
            <ShoppingCart size={20} className={activeSessions.length > 0 ? 'text-orange-600' : 'text-green-600'} />
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('posMonitor.unpaidSessions')}</p>
            <p className="text-xl font-bold">{activeSessions.length}</p>
          </div>
        </div>
      </div>

      {/* Active Sessions Alert */}
      {activeSessions.length > 0 && (
        <div className="card border-orange-200 bg-orange-50/50 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-orange-600" />
            <h3 className="font-semibold text-orange-800">{t('posMonitor.activeSessionsTitle')}</h3>
          </div>
          <div className="space-y-2">
            {activeSessions.map((session: any) => (
              <div key={session.sessionId} className="p-4 bg-white rounded-lg border border-orange-200" data-testid="unpaid-cart">
                <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <User size={16} className="text-gray-400" />
                  <div>
                    <p className="font-medium">{session.staffName}</p>
                    <p className="text-xs text-gray-500">
                      {t('posMonitor.lastAction')}: {ACTION_KEY_MAP[session.lastAction] ? t(`posMonitor.${ACTION_KEY_MAP[session.lastAction]}`) : session.lastAction} · {formatTime(session.lastActionAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-orange-600">
                    {session.itemCount} {t('posMonitor.itemsUnpaid')}
                  </span>
                  <SeverityBadge severity="warning" />
                </div>
                </div>
                <p className="mt-3 text-sm text-orange-700"><span className="font-medium">{t('posMonitor.alertReason')}: </span>{t('posMonitor.unpaidReason')}</p>
                {session.lastCheckoutFailure && <POSFailureDetails metadata={{ failureCode: session.lastCheckoutFailure.code, httpStatus: session.lastCheckoutFailure.httpStatus, outcome: session.lastCheckoutFailure.outcome }} />}
                {Array.isArray(session.items) && session.items.length > 0 ? <>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm" aria-label={t('posMonitor.cartDetails')}>
                      <thead className="text-left text-gray-500 border-b"><tr>
                        <th className="py-2 pr-4">{t('posMonitor.cartProduct')}</th>
                        <th className="py-2 px-3 text-right">{t('posMonitor.cartQuantity')}</th>
                        <th className="py-2 px-3 text-right">{t('posMonitor.cartUnitPrice')}</th>
                        <th className="py-2 pl-3 text-right">{t('posMonitor.cartLineTotal')}</th>
                      </tr></thead>
                      <tbody>{session.items.map((item: any, index: number) => <tr key={`${item.id}-${index}`} className="border-b border-gray-100">
                        <td className="py-3 pr-4"><p className="font-medium">{item.productName}</p>
                          {item.specName && <p className="text-xs text-gray-500 mt-1">{item.specName}{item.options ? ` · ${item.options}` : ''}</p>}
                          {Array.isArray(item.addons) && item.addons.length > 0 && <p className="text-xs text-gray-500 mt-1">{t('posMonitor.cartAddons')}: {item.addons.map((addon: any) => `${addon.name}${addon.quantity ? ` ×${addon.quantity}` : ''}`).join(', ')}</p>}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">{item.quantity}</td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">{typeof item.unitPrice === 'number' ? formatCurrency(item.unitPrice) : '—'}</td>
                        <td className="py-3 pl-3 text-right whitespace-nowrap">{typeof item.lineTotal === 'number' ? formatCurrency(item.lineTotal) : '—'}</td>
                      </tr>)}</tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-between gap-2"><span className="text-sm text-gray-600">{t(session.detailSource === 'snapshot' ? 'posMonitor.cartSubtotal' : 'posMonitor.cartEstimatedSubtotal')}</span><strong className="text-orange-700">{typeof session.subtotal === 'number' ? formatCurrency(session.subtotal) : t('posMonitor.cartAmountUnavailable')}</strong></div>
                  <p className="text-xs text-gray-500 mt-2">{t(session.detailSource === 'snapshot' ? 'posMonitor.cartPriceHint' : 'posMonitor.cartLegacyHint')}</p>
                  {session.detailsComplete === false && <p className="mt-2 text-xs text-orange-700">{t('posMonitor.cartDetailsUnavailable')}</p>}
                </> : <p className="mt-3 text-sm text-gray-500">{t('posMonitor.cartDetailsUnavailable')}</p>}
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
            <span className="text-sm font-medium text-gray-700">{t('posMonitor.filter')}:</span>
          </div>

          <select
            value={filter.dateRange}
            onChange={(e) => setFilter({ ...filter, dateRange: e.target.value, page: 1 })}
            className="input w-32"
          >
            {context.startDate && <option value="dashboard">{t('dashboardNavigation.dashboardRange')}</option>}
            <option value="today">{t('posMonitor.today')}</option>
            <option value="week">{t('posMonitor.week')}</option>
            <option value="month">{t('posMonitor.month')}</option>
          </select>

          <select
            value={filter.severity}
            onChange={(e) => setFilter({ ...filter, severity: e.target.value, page: 1 })}
            className="input w-32"
          >
            <option value="">{t('posMonitor.allSeverities')}</option>
            <option value="critical">{t('posMonitor.severityCritical')}</option>
            <option value="warning">{t('posMonitor.severityWarning')}</option>
            <option value="info">{t('posMonitor.severityInfo')}</option>
          </select>

          <select
            value={filter.action}
            onChange={(e) => setFilter({ ...filter, action: e.target.value, page: 1 })}
            className="input w-40"
          >
            <option value="">{t('posMonitor.allActions')}</option>
            {Object.keys(ACTION_KEY_MAP).map((key) => (
              <option key={key} value={key}>{t(`posMonitor.${ACTION_KEY_MAP[key]}`)}</option>
            ))}
          </select>

          {(filter.severity || filter.action) && (
            <button
              onClick={() => setFilter({ ...filter, severity: '', action: '', page: 1 })}
              className="text-sm text-red-500 hover:text-red-700"
            >
              {t('posMonitor.clearFilters')}
            </button>
          )}
        </div>
      </div>

      {/* Logs Table */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('posMonitor.operationLogs')}</h2>
          <span className="text-sm text-gray-500">{logs.length} {t('posMonitor.records')}</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Activity size={40} className="mx-auto mb-3 text-gray-300" />
            <p>{t('posMonitor.noRecords')}</p>
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
                      {t(`posMonitor.${ACTION_KEY_MAP[log.action]}`) || log.action}
                    </span>
                    <SeverityBadge severity={log.severity} />
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{log.description}</p>
                  {log.action === 'checkout_failed' && <POSFailureDetails metadata={log.metadata} />}
                  {log.metadata && log.severity !== 'info' && <details className="mt-2 text-xs text-gray-500"><summary className="cursor-pointer">{t('posMonitor.rawRecord')}</summary><pre className="mt-1 whitespace-pre-wrap break-words">{typeof log.metadata === 'string' ? log.metadata : JSON.stringify(log.metadata, null, 2)}</pre></details>}
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
              {t('common.prevPage')}
            </button>
            <span className="text-sm text-gray-500">
              {t('common.page')} {filter.page} / {data?.data?.data?.totalPages || 1}
            </span>
            <button
              onClick={() => setFilter({ ...filter, page: filter.page + 1 })}
              disabled={filter.page >= (data?.data?.data?.totalPages || 1)}
              className="btn-secondary disabled:opacity-50"
            >
              {t('common.nextPage')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
