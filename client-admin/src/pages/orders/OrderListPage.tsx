import { notifyAdmin } from '../../components/AdminFeedback'
import { OrderSummaryCards } from '../../components/OrderSummaryCards'
import { AdminDialog } from '../../components/AdminDialog'
import { LocalizedDateTimeInput } from '../../../../shared/components/LocalizedDateTimeInput'
import { OrderItemsTable, OrderItemColumns } from '../../components/OrderItemsTable'
import { useDashboardContext, requireRead, dashboardLink } from '../../utils/dashboardNavigation'
import { DashboardReadFailure, DashboardContextNotice } from '../../components/DashboardReadState'
import { RefundPolicyReview, confirmPreparedRefund } from '../../components/RefundPolicyReview'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { orderApi, channelApi, adminApi, financeApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { formatCurrency, formatDateTime } from '../../utils/helpers'
import { exportText, jakartaInput, orderReportHtml } from '../../utils/orderExport'
import { Loader2, CheckCircle, XCircle, Search } from 'lucide-react'

interface RefundRequest {
  id: string
  orderId: string
  orderNumber: string
  reason: string
  reasonCode?: string
  selectedItemIds?: string
  status: 'pending' | 'approved' | 'rejected'
  requestedByName?: string
  createdAt: string
  order?: {
    finalAmount: number
    paymentMethod: string
    items: any[]
  }
}

type OrderSubTab = 'orders' | 'refunds'

export function OrderListPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user: _user } = useAuthStore()
  const context=useDashboardContext()
  const [subTab, setSubTab] = useState<OrderSubTab>('orders')
  const [statusFilter, setStatusFilter] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [search, setSearch] = useState('')
  const labels = exportText(i18n.language)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [shiftSessionId, setShiftSessionId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const startDate = startTime ? new Date(startTime + ':00+07:00').toISOString() : context.startDate
  const endDate = endTime ? new Date(endTime + ':59.999+07:00').toISOString() : context.endDate
  const validRange = !startDate || !endDate || new Date(startDate) <= new Date(endDate)
  const filters = { storeId: context.storeId, startDate, endDate, status: statusFilter || undefined, channelId: channelFilter || undefined, search: search.trim() || undefined, shiftSessionId: shiftSessionId || undefined, paymentMethod: paymentMethod || undefined }
  useEffect(() => { setPage(1); setExportError('') }, [context.storeId, startDate, endDate, statusFilter, channelFilter, search, shiftSessionId, paymentMethod])
  useEffect(() => { setShiftSessionId('') }, [context.storeId, startDate, endDate])
  const shiftRangeStart = jakartaInput(startDate).slice(0,10) || new Date().toISOString().slice(0,10)
  const shiftRangeEnd = jakartaInput(endDate).slice(0,10) || shiftRangeStart
  const shiftsQuery = useQuery({ queryKey: ['order-export-shifts', context.storeId, shiftRangeStart, shiftRangeEnd], enabled: context.valid && validRange, queryFn: () => financeApi.shiftSessions({ startDate: shiftRangeStart, endDate: shiftRangeEnd }) })
  const sessions = shiftsQuery.data?.data?.data?.sessions || []
  const shiftLabel = (row: any) => `${row.session?.definition?.[i18n.language.startsWith('zh') ? 'nameZh' : i18n.language.startsWith('id') ? 'nameId' : 'name'] || row.session?.definition?.name || row.session?.shift} · ${jakartaInput(row.windowStart).replace('T',' ')} · ${row.session?.opener?.name || ''}`
  const handleExport = async () => {
    if (!validRange) { setExportError(labels.rangeError); return }
    const popup = window.open('', '_blank')
    if (!popup) { setExportError(labels.blocked); return }
    popup.document.body.textContent = labels.loading
    setExporting(true); setExportError('')
    try {
      const generated = new Date().toISOString()
      const response = await orderApi.exportData({ ...filters, endDate: endDate && new Date(endDate) < new Date(generated) ? endDate : generated })
      const result = requireRead(response, Array.isArray(response.data?.data?.list)).data.data.list
      if (!result.length) { popup.close(); setExportError(labels.empty); return }
      const description = [`${context.storeId}`, `${startDate || labels.all} - ${endDate || generated}`, `${labels.shift}: ${sessions.find((r: any) => r.id === shiftSessionId) ? shiftLabel(sessions.find((r: any) => r.id === shiftSessionId)) : labels.all}`, `${labels.status}: ${statusFilter || labels.all}`, `${labels.channel}: ${channels.find((c: any) => c.id === channelFilter)?.name || labels.all}`, `${labels.payment}: ${paymentMethod || labels.all}`, `${labels.search}: ${search || labels.all}`].join(' | ')
      popup.document.open(); popup.document.write(orderReportHtml(result, description, i18n.language, generated)); popup.document.close()
      await popup.document.fonts.ready
      popup.focus(); popup.print()
    } catch { popup.close(); setExportError(labels.error) }
    finally { setExporting(false) }
  }

  // Refund requests state
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([])
  const [selectedRefund, setSelectedRefund] = useState<RefundRequest | null>(null)
  const [refundAction, setRefundAction] = useState<'approve' | 'reject' | null>(null)
  const [refundNote, setRefundNote] = useState('')

  // Get channels for filter dropdown
  const { data: channelsData } = useQuery({
    queryKey: ['channels',context.storeId],
    enabled:context.valid,
    queryFn: () => channelApi.list()
  })
  const channels = channelsData?.data?.data?.list || []

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['orders', filters, page],
    enabled: context.valid && validRange,
    queryFn: async () => { const response = await orderApi.list({ ...filters, page, pageSize: 100 }); return requireRead(response, Array.isArray(response.data?.data?.list)) }
  })

  const orders = data?.data?.data?.list || []

  // Load pending refund requests
  const loadRefundRequests = async () => {
    if (!context.valid) return
    try {
      const res = await adminApi.getRefundRequests('pending')
      setRefundRequests(res.data?.data?.list || [])
    } catch (err) {
      console.error('Failed to load refund requests:', err)
    }
  }

  useEffect(() => {
    loadRefundRequests()
  }, [])

  const handleApproveRefund = async () => {
    if (!selectedRefund) return
    if (!await confirmPreparedRefund(selectedRefund, t)) return
    try {
      await adminApi.approveRefund(selectedRefund.id, { verifiedPrepared: selectedRefund.reasonCode === 'customer_dissatisfied', verifiedUnprepared: selectedRefund.reasonCode === 'paid_unprepared', note: refundNote })
      notifyAdmin(t('orders.refundApproved'))
      setSelectedRefund(null)
      setRefundAction(null)
      setRefundNote('')
      loadRefundRequests()
    } catch (err) {
      notifyAdmin(t('common.error'))
    }
  }

  const handleRejectRefund = async () => {
    if (!selectedRefund || !refundNote.trim()) {
      notifyAdmin(t('orders.rejectReasonRequired'))
      return
    }
    try {
      await adminApi.rejectRefund(selectedRefund.id, { note: refundNote })
      notifyAdmin(t('orders.refundRejected'))
      setSelectedRefund(null)
      setRefundAction(null)
      setRefundNote('')
      loadRefundRequests()
    } catch (err) {
      notifyAdmin(t('common.error'))
    }
  }

  if (!context.valid) return <DashboardReadFailure scope />

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return 'badge-success'
      case 'refunded': return 'badge-error'
      case 'pending': return 'badge-warning'
      default: return 'badge-info'
    }
  }

  const pendingRefundCount = refundRequests.filter(r => r.status === 'pending').length

  return (
    <div>
      <DashboardContextNotice />
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('orders.title')}</h1>

      {/* Sub-tabs: Orders / Refunds */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4" data-testid="order-toolbar-heading">
      <div className="flex gap-1 bg-white p-1 rounded-lg shadow-sm inline-flex shrink-0">
        <button
          onClick={() => setSubTab('orders')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            subTab === 'orders' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {t('orders.list') || 'Orders'}
          {pendingRefundCount > 0 && (
            <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{pendingRefundCount}</span>
          )}
        </button>
        <button
          onClick={() => setSubTab('refunds')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            subTab === 'refunds' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {t('orders.refunds') || 'Refunds'}
        </button>
      </div>
      {subTab === 'orders' && <div className="flex flex-wrap items-center gap-3 ml-auto" data-testid="order-date-filters">
        <label className="flex items-center gap-2 text-xs text-gray-500 whitespace-nowrap">{labels.start}<LocalizedDateTimeInput aria-label={labels.start} type="datetime-local" className="input w-[205px] h-10 text-xs" value={startTime || jakartaInput(context.startDate)} onChange={e => setStartTime(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-xs text-gray-500 whitespace-nowrap">{labels.end}<LocalizedDateTimeInput aria-label={labels.end} type="datetime-local" className="input w-[205px] h-10 text-xs" value={endTime || jakartaInput(context.endDate)} onChange={e => setEndTime(e.target.value)} /></label>
      </div>}
      </div>

      {/* Orders Tab */}
      {subTab === 'orders' && (
        <>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3" data-testid="order-filter-toolbar">
        <div className="relative w-56 max-w-full shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={labels.search}
            placeholder={labels.searchPlaceholder}
            className="input pl-9 w-full h-10 text-sm"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label={t('orders.status')} className="input w-24 h-10 text-sm">
          <option value="">{t('orderVoid.activeOrders')}</option>
          <option value="pending">{t('orders.pending')}</option>
          <option value="completed">{t('orders.completed')}</option>
          <option value="refunded">{t('orders.refunded')}</option>
          <option value="cancelled">{t('orderVoid.voided')}</option>
        </select>
        <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} aria-label={t('channels.channel')} className="input w-28 h-10 text-sm">
          <option value="">{t('channels.allChannels') || 'All Channels'}</option>
          {channels.map((ch: any) => (
            <option key={ch.id} value={ch.id}>
              {ch.icon} {ch.name}
            </option>
          ))}
        </select>
        <select aria-label={labels.shift} className="input w-36 h-10 text-sm" value={shiftSessionId} title={sessions.find((row: any) => row.id === shiftSessionId) ? shiftLabel(sessions.find((row: any) => row.id === shiftSessionId)) : labels.shift} onChange={e => setShiftSessionId(e.target.value)} disabled={shiftsQuery.isLoading || shiftsQuery.isError}><option value="">{labels.shift}</option>{sessions.map((row: any) => <option key={row.id} value={row.id}>{shiftLabel(row)}</option>)}</select>
        <select aria-label={labels.payment} className="input w-32 h-10 text-sm" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option value="">{labels.payment}</option>{['cash','qris','gopay','ovo','dana','shopeepay','debit','card','member','bca_va','mandiri_va'].map(value => <option key={value} value={value}>{value === 'cash' ? t('uiDesign.cash') : value.toUpperCase()}</option>)}</select>
        <button className="btn-secondary h-10 px-3 text-sm whitespace-nowrap" onClick={() => { setStartTime(''); setEndTime(''); setShiftSessionId(''); setPaymentMethod(''); setSearch(''); setStatusFilter(''); setChannelFilter('') }}>{labels.reset}</button>
        <button className="btn-primary h-10 px-3 text-sm whitespace-nowrap" disabled={exporting || !validRange || isLoading || isError} onClick={handleExport}>{exporting ? labels.loading : labels.export}</button>
      </div>
      <p className="text-xs text-gray-500 mb-3">{labels.timezone}</p>
      {shiftsQuery.isError && <DashboardReadFailure retry={() => shiftsQuery.refetch()} />}
      {(!validRange || exportError) && <p role="alert" className="text-sm text-red-600 mb-3">{!validRange ? labels.rangeError : exportError}</p>}
      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : isError ? (
<DashboardReadFailure retry={()=>refetch()} />
        ) : !validRange || orders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">{t('common.noData')}</div>
        ) : (
          <div>
            <OrderSummaryCards orders={orders} onOpen={order=>navigate(dashboardLink(`/finance/orders/${encodeURIComponent(order.id)}`, { storeId: context.storeId, asOf: context.asOf, startDate: context.startDate, endDate: context.endDate }))}/>
            <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[1100px] table-fixed" data-testid="orders-table">
              <OrderItemColumns after={[120,180,undefined,128,112,112]} />
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 pr-4 font-medium">{t('shiftHandover.products')}</th>
                  <th className="text-right tabular-nums pb-3 px-2 text-left font-medium whitespace-nowrap">{t('shiftReview.quantity')}</th>
                  <th className="pb-3 pl-6 font-medium">{t('channels.channel') || 'Channel'}</th>
                  <th className="pb-3 font-medium">{t('orders.date')}</th>
                  <th className="pb-3 font-medium">{t('orders.customer')}</th>
                  <th className="text-right tabular-nums pb-3 font-medium">{t('orders.amount')}</th>
                  <th className="pb-3 font-medium">{t('orders.payment')}</th>
                  <th className="pb-3 font-medium">{t('orders.status')}</th>
                </tr>
              </thead>
              {orders.map((order: any) => {
                const items: { productName: string; quantity: number | null }[] = order.items?.length
                  ? order.items
                  : [{ productName: '-', quantity: null }]
                return (
                  <tbody
                    key={order.id}
                    className="border-b last:border-0 hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(dashboardLink(`/finance/orders/${encodeURIComponent(order.id)}`, { storeId: context.storeId, asOf: context.asOf, startDate: context.startDate, endDate: context.endDate }))}
                  >
                    {items.map((item, index) => (
                      <tr key={index}>
                        <td className="py-3 pr-4 text-sm text-gray-800 max-w-sm break-words">{item.productName}</td>
                        <td className="text-right tabular-nums py-3 px-2 text-left text-sm text-gray-800 whitespace-nowrap">{item.quantity ?? '-'}</td>
                        {index === 0 && (
                          <>
                            <td rowSpan={items.length} className="py-3 pl-6 pr-4">
                              {order.channel ? (
                                <span className="flex items-center gap-1">
                                  <span>{order.channel.icon}</span>
                                  <span className="text-sm">{order.channel.name}</span>
                                </span>
                              ) : '-'}
                            </td>
                            <td rowSpan={items.length} className="py-3 pr-4 text-sm">{formatDateTime(order.createdAt)}</td>
                            <td rowSpan={items.length} className="py-3 pr-4">{order.member?.name || order.staff?.name || '-'}</td>
                            <td rowSpan={items.length} className="text-right tabular-nums py-3 pr-4 font-medium">{formatCurrency(order.finalAmount ?? order.total)}</td>
                            <td rowSpan={items.length} className="py-3 pr-4 capitalize">{order.paymentMethod==='cash'?t('uiDesign.cash'):order.paymentMethod==='qris'?'QRIS':order.paymentMethod}</td>
                            <td rowSpan={items.length} className="py-3 pr-4"><span className={`badge ${getStatusBadge(order.status)} capitalize`}>{t('orders.'+order.status,{defaultValue:order.status})}</span></td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                )
              })}
            </table>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 mt-3 text-sm"><span>{labels.count}: {data?.data?.data?.pagination?.total || 0} · {labels.page} {page}</span><button className="btn-secondary" disabled={page <= 1 || isLoading} onClick={() => setPage(page-1)}>{labels.prev}</button><button className="btn-secondary" disabled={page >= (data?.data?.data?.pagination?.totalPages || 1) || isLoading} onClick={() => setPage(page+1)}>{labels.next}</button></div>
        </>
      )}

      {/* Refunds Tab */}
      {subTab === 'refunds' && (
        <div className="space-y-4">
          {refundRequests.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl">
              <p className="text-gray-500">{t('orders.noRefunds') || 'No refund requests'}</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-500 border-b bg-gray-50">
                    <th className="p-4 font-medium">{t('shiftHandover.products')}</th>
                    <th className="p-4 font-medium">{t('orders.reason')}</th>
                    <th className="p-4 font-medium">{t('orders.requestedBy')}</th>
                    <th className="p-4 font-medium">{t('orders.date')}</th>
                    <th className="p-4 font-medium">{t('orders.status')}</th>
                    <th className="p-4 font-medium">{t('orders.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {refundRequests.map((req) => (
                    <tr key={req.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="p-4"><OrderItemsTable items={req.order?.items} /><p className="text-xs text-gray-400">{req.orderNumber}</p></td>
                      <td className="p-4 text-sm">{req.reason}</td>
                      <td className="p-4 text-sm">{req.requestedByName || '-'}</td>
                      <td className="p-4 text-sm">{formatDateTime(req.createdAt)}</td>
                      <td className="p-4">
                        <span className={`badge ${
                          req.status === 'pending' ? 'badge-warning' :
                          req.status === 'approved' ? 'badge-success' : 'badge-error'
                        }`}>{req.status}</span>
                      </td>
                      <td className="p-4">
                        {req.status === 'pending' && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setSelectedRefund(req); setRefundAction('approve') }}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                              title={t('orders.approve')}
                            >
                              <CheckCircle size={18} />
                            </button>
                            <button
                              onClick={() => { setSelectedRefund(req); setRefundAction('reject') }}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                              title={t('orders.reject')}
                            >
                              <XCircle size={18} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Refund Action Modal */}
      {selectedRefund && refundAction && (
        <AdminDialog title={refundAction === 'approve' ? t('orders.approveRefund') : t('orders.rejectRefund')} onClose={() => { setSelectedRefund(null); setRefundAction(null); setRefundNote('') }} className="max-w-md" busy={false} trackChanges chrome>

            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <p className="font-medium">{selectedRefund.orderNumber}</p>
              <p className="text-sm text-gray-500">{selectedRefund.reason}</p>
              <RefundPolicyReview request={selectedRefund} />
            </div>
            {refundAction === 'reject' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('orders.rejectReason')}
                </label>
                <textarea
                  value={refundNote}
                  onChange={(e) => setRefundNote(e.target.value)}
                  rows={3}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder={t('orders.rejectReasonPlaceholder')}
                />
              </div>
            )}
            <div className="admin-dialog-footer flex gap-2">
              <button
                onClick={() => { setSelectedRefund(null); setRefundAction(null); setRefundNote('') }}
                className="flex-1 py-3 border border-gray-200 rounded-xl"
               data-dialog-close="true">
                {t('common.cancel')}
              </button>
              <button
                onClick={refundAction === 'approve' ? handleApproveRefund : handleRejectRefund}
                className={`flex-1 py-3 rounded-xl text-white ${
                  refundAction === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {refundAction === 'approve' ? t('common.confirm') : t('common.confirm')}
              </button>
            </div>
          </AdminDialog>
      )}
    </div>
  )
}
