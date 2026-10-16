import { formatNumber } from '../../utils/numberDisplay'
import { LocalizedDateTimeInput } from '../../components/LocalizedDateTimeInput'
import {QUERY_PERIODS,QueryPeriod,queryCalendarRange} from '../../utils/queryPeriods'
import {useStoreDateSettings} from '../../hooks/useStoreDateSettings'
import {formatStoreDate,storeCalendarDate} from '../../utils/storeDateTime'
import { ShiftCorrection } from '../../components/ShiftCorrection'
import { OrderItemRows } from '../../components/OrderItemsTable'
import { ShiftHandoverFinancials } from '../../components/ShiftHandoverFinancials'
import { ShiftCashReconciliation, ShiftCashWarning, formatShiftCash } from '../../../../shared/utils/shiftCashReconciliation'
import { ManualReceiptAmounts } from '../../components/ManualReceipts'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { RefreshCw, CalendarDays, AlertTriangle, ArrowLeft } from 'lucide-react'
import api, { financeApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'

type Summary = { revenue: number; orders: number; completedOrders: number; refundedOrders: number; refundedAmount: number; expenses: number; expenseAmount: number; warnings: number; employees: number }
type Employee = { id: string; name: string; employeeNumber: string | null; position: string | null; orders: number; expenses: number; warnings: number; roles: string[] }
type Review = {
  manualReceiptsCashBasis?:string; handoverFinancials?: {reported?:boolean;drawerTotal:number|null;openFloat:number;expenses:number;qris:number|null;shopeefood:number;gofood:number;orderRevenue:number;actualCashReceived:number|null;totalRevenue:number}; cashReconciliation:ShiftCashReconciliation|null; cashWarning:ShiftCashWarning|null; manualReceipts: ManualReceiptAmounts | null; id: string; windowStart: string; windowEnd: string; overlapping: boolean; summary: Summary
  session: null | { updatedAt:string; shift: string; status: string; openedAt: string; closedAt: string | null; openFloat: number; actualCash: number | null; expectedCash: number; cashDifference: number | null; closeNote: string | null; opener: { name: string }; nextStaff: { name: string } | null; definition: { name: string; nameZh: string | null; nameId: string | null } | null }
  orders: { items:{productName:string;quantity:number}[]; id: string; orderNumber: string; pickupNumber: string | null; staffName: string; status: string; amount: number; paymentMethod: string; createdAt: string }[]
  expenses: { id: string; category: string; amount: number; quantity: number | null; description: string; createdAt: string; staffName: string | null }[]
  warnings: { id: string; staffName: string; severity: string; description: string; action: string; createdAt: string }[]
  employees: Employee[]
}
type Result = { categories: { key: string; label?: string; labelZh?: string; labelEn?: string; labelId?: string; isDefault?: boolean }[]; sessions: Review[]; unassigned: Review; asOf: string }
type Tab = 'overview' | 'orders' | 'warnings' | 'expenses' | 'employees'
export function ShiftReviewPage() {
  const { t, i18n } = useTranslation()
  const dateSettings=useStoreDateSettings()
  const {sessionId}=useParams<{sessionId:string}>()
  const [searchParams]=useSearchParams()
  const user = useAuthStore(s => s.user)
  const access = useQuery({ queryKey: ['shift-review-access', user?.id, user?.storeId], enabled: !!user && user.role !== 'admin', queryFn: async () => (await api.get('/staff-permissions/me')).data.data as { role: { permissions: string[] } | null } })
  const customRole = access.data?.role
  const allowed = !!user?.storeId && ['admin', 'manager'].includes(user.role) && (user.role === 'admin' || (!!access.data && !access.isError && (!customRole || customRole.permissions.includes('finance.read'))))
  const [range, setRange] = useState({ startDate: searchParams.get('startDate') || storeCalendarDate(new Date(),dateSettings.timezone), endDate: searchParams.get('endDate') || storeCalendarDate(new Date(),dateSettings.timezone) })
  const [selection, setSelection] = useState<string | null>(sessionId || null)
  const [tab, setTab] = useState<Tab>('overview')
  const [page, setPage] = useState(1)
  const [orderStatus, setOrderStatus] = useState('active')
  const [reviewNote,setReviewNote]=useState('')
  const [reviewSaving,setReviewSaving]=useState(false)
  const [reviewError,setReviewError]=useState('')
  const days = (Date.parse(range.endDate) - Date.parse(range.startDate)) / 86400000
  const valid = !!range.startDate && !!range.endDate && days >= 0 && days < 31
  const query = useQuery({ queryKey: ['shift-review', user?.storeId, customRole, range,dateSettings], enabled: allowed && valid,refetchInterval:30000,
    queryFn: async () => {
      const response = await financeApi.shiftSessions(range)
      const result = response.data?.data as Result
      if (!Array.isArray(result?.sessions) || !result?.unassigned?.summary || !result.asOf) throw Error('INVALID_SHIFT_REVIEW')
      return result
    } })
  useEffect(() => { setSelection(sessionId || null); setPage(1); setTab('overview') }, [range.startDate, range.endDate, sessionId])
  useEffect(() => { setPage(1);setReviewNote('');setReviewError('') }, [selection, tab, orderStatus])
  const data = query.data
  const unmatched = data?.unassigned
  const hasUnmatched = unmatched && (unmatched.orders.length + unmatched.summary.expenses + unmatched.summary.warnings > 0)
  const selected = selection === 'unassigned' && hasUnmatched ? unmatched : sessionId ? data?.sessions.find(s=>s.id===sessionId) : data?.sessions.find(s => s.id === selection) || data?.sessions[data.sessions.length - 1] || (hasUnmatched ? unmatched : undefined)
  const instant=(value:string)=>formatStoreDate(value,dateSettings,true)
  const title = (row: Review) => row.session ? (i18n.language === 'zh' ? row.session.definition?.nameZh : i18n.language === 'id' ? row.session.definition?.nameId : row.session.definition?.name) || t(`shiftReview.${row.session.shift}`, { defaultValue: row.session.shift }) : t('shiftReview.unassigned')
  const categoryLabel = (key: string) => {
    const category = data?.categories?.find(c => c.key === key)
    const defaults: Record<string, string> = { rent: 'categoryRent', utilities: 'categoryUtilities', supplies: 'categorySupplies', salary: 'categorySalary', reimbursement: 'categoryReimbursement', other: 'categoryOther' }
    if (category && (!category.isDefault || !defaults[key])) return (i18n.language.startsWith('zh') ? category.labelZh : i18n.language.startsWith('en') ? category.labelEn : category.labelId) || category.label || key
    return defaults[key] ? t('expense.' + defaults[key]) : category?.label || key
  }
  const money = (value: number | null | undefined) => value == null ? '—' : formatShiftCash(value)
  const shortcut=(kind:QueryPeriod)=>setRange(queryCalendarRange(kind,dateSettings.timezone))

  const cards = (row: Review) => <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
    {(['revenue', 'orders', 'warnings', 'expenseAmount', 'employees'] as const).filter(key => !row.handoverFinancials || !['revenue', 'expenseAmount'].includes(key)).map(key => <div key={key} className="bg-white rounded-xl border p-4">
      <p className="text-sm text-gray-500">{t(`shiftReview.${key}`)}</p><p className={`mt-2 text-2xl font-bold ${key === 'revenue' ? 'text-primary' : key === 'warnings' && (row.summary.warnings > 0 || row.cashWarning?.status === 'pending') ? 'text-amber-700' : 'text-gray-900'}`}>{key === 'revenue' || key === 'expenseAmount' ? money(row.summary[key]) : row.summary[key] + (key === 'warnings' && row.cashWarning?.status === 'pending' ? 1 : 0)}</p>
    </div>)}
  </div>
  if (user?.role !== 'admin' && access.isPending) return <p role="status">{t('common.loading')}</p>
  if (!allowed) return <p role="alert">{t('shiftReview.denied')}</p>
  const warningRows = selected ? [...selected.warnings, ...(selected.cashWarning?.status === 'pending' ? [{id:'cash-warning:'+selected.id,staffName:selected.session?.opener.name || '—',severity:'warning',description:t('cashReconciliation.warning',{difference:money(selected.cashWarning.difference)}),action:'cash_reconciliation',createdAt:selected.session?.closedAt || selected.windowEnd}] : [])] : []
  const orderRows = selected?.orders.filter(o => orderStatus === 'all' || (orderStatus === 'active' ? ['completed','paid'].includes(o.status) : o.status === 'refunded')) || []
  const rows = selected && tab !== 'overview' ? tab === 'warnings' ? warningRows : tab === 'orders' ? orderRows : selected[tab] : []
  const paged = rows.slice((page - 1) * 20, page * 20)
  return <div className="space-y-5" data-testid="shift-review-page">
    <Link to={`/finance/revenue?${searchParams.get('returnQuery') || new URLSearchParams({period:'custom',startDate:searchParams.get('returnStartDate') || range.startDate,endDate:searchParams.get('returnEndDate') || range.endDate}).toString()}`} className="inline-flex items-center gap-2 text-sm text-primary hover:underline"><ArrowLeft size={16} />{t('revenueLayout.title')}</Link>
    {!sessionId && <header className="flex flex-wrap justify-between items-center gap-3"><h1 className="text-2xl font-bold">{t('shiftReview.title')}</h1><button className="btn-secondary flex items-center gap-2" disabled={query.isFetching || !valid} onClick={() => void query.refetch()}><RefreshCw size={16} />{t('common.refresh')}</button></header>}
    {!sessionId && <section className="bg-white border rounded-xl p-4 flex flex-wrap items-end gap-3" aria-label={t('shiftReview.dateRange')}>
      <CalendarDays size={20} className="mb-3 text-primary" /><label className="text-sm text-gray-600">{t('shiftReview.start')}<LocalizedDateTimeInput aria-label={t('shiftReview.start')} type="date" value={range.startDate} max={range.endDate || undefined} className="input block mt-1" onChange={e => setRange(r => ({ ...r, startDate: e.target.value }))} /></label>
      <label className="text-sm text-gray-600">{t('shiftReview.end')}<LocalizedDateTimeInput aria-label={t('shiftReview.end')} type="date" value={range.endDate} min={range.startDate || undefined} className="input block mt-1" onChange={e => setRange(r => ({ ...r, endDate: e.target.value }))} /></label>
      {QUERY_PERIODS.map(key => <button key={key} className="btn-secondary" onClick={() => shortcut(key)}>{t('queryPeriods.'+key)}</button>)}
    </section>}
    {!valid ? <p role="alert" className="text-red-600">{t('shiftReview.invalidRange')}</p> : query.isPending ? <p role="status">{t('common.loading')}</p> : query.isError ? <p role="alert" className="text-red-600">{t('shiftReview.failed')}</p> : <>
      {!sessionId && <div className="bg-white rounded-xl border overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-left"><tr>{['shift', 'time', 'opener', 'revenue', 'orders', 'warnings', 'expenseAmount', 'status'].map(key => <th key={key} className="p-3 whitespace-nowrap">{key === 'products' ? t('shiftHandover.products') : t(`shiftReview.${key}`)}</th>)}<th /></tr></thead><tbody>
        {[...(data?.sessions || []), ...(hasUnmatched ? [unmatched!] : [])].map(row => <tr key={row.id} className={`border-t ${selected?.id === row.id ? 'bg-pink-50' : ''}`}><td className="p-3 font-semibold">{title(row)}</td><td className="p-3 whitespace-nowrap">{instant(row.windowStart)} — {row.session?.status === 'open' ? t('shiftReview.ongoing') : instant(row.windowEnd)}</td><td className="p-3">{row.session?.opener.name || '—'}</td><td className="p-3 font-semibold">{money(row.summary.revenue)}</td><td className="p-3">{row.summary.orders}</td><td className={`p-3 ${(row.summary.warnings > 0 || row.cashWarning?.status === 'pending') ? 'text-amber-700 font-bold' : ''}`}>{row.summary.warnings + (row.cashWarning?.status === 'pending' ? 1 : 0)}{row.cashWarning?.status === 'pending' && <p className="text-xs text-red-600">{t('cashReconciliation.pending')}</p>}</td><td className="p-3">{money(row.summary.expenseAmount)}</td><td className="p-3">{row.session ? t(`shiftReview.${row.session.status}`) : t('shiftReview.reviewNeeded')}</td><td className="p-3"><button className="text-primary font-medium whitespace-nowrap" aria-pressed={selected?.id === row.id} onClick={() => { setSelection(row.id); setTab('overview') }}>{t('shiftReview.details')}</button></td></tr>)}
      </tbody></table>{!data?.sessions.length && !hasUnmatched && <p className="p-6 text-gray-500">{t('shiftReview.empty')}</p>}</div>}
      {hasUnmatched && <div role="status" className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3"><AlertTriangle className="text-amber-600 shrink-0" size={20} /><div><p className="font-semibold text-amber-900">{t('shiftReview.unassignedHint')}</p><button className="text-amber-800 underline mt-1" onClick={() => { setSelection('unassigned'); setOrderStatus('all'); setTab(unmatched!.orders.length ? 'orders' : unmatched!.expenses.length ? 'expenses' : 'warnings') }}>{t('shiftReview.viewUnassigned')}</button></div></div>}
      {sessionId && selected === unmatched && <button className="btn-secondary" onClick={() => { setSelection(sessionId); setTab('overview') }}>{t('shiftReview.backToShift')}</button>}
      {sessionId && !selected && <p role="alert">{t('shiftReview.noRecords')}</p>}
      {selected && <section className="space-y-4" data-testid="shift-review-detail">
        <div className="flex flex-wrap justify-between items-end gap-2"><div><h2 className="text-xl font-bold">{title(selected)} · {t('shiftReview.details')}</h2><p className="text-sm text-gray-500 mt-1">{instant(selected.windowStart)} — {instant(selected.windowEnd)} · {dateSettings.timezone}</p></div><span className="text-sm text-gray-500">{t('shiftReview.updated')} {data && instant(data.asOf)}</span></div>
        {cards(selected)}
        {selected.handoverFinancials && <ShiftHandoverFinancials amounts={selected.handoverFinancials} />}
        {user?.role === 'admin' && selected.session && ['open','closed'].includes(selected.session.status) && <ShiftCorrection key={selected.id+selected.session.updatedAt} id={selected.id} session={selected.session} receipts={selected.manualReceipts} refresh={()=>query.refetch()} />}
        {selected.cashWarning?.status === 'pending' && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4" data-testid="shift-cash-warning">
          <h3 className="font-bold text-amber-900">{t('cashReconciliation.pending')}</h3>
          <p role="alert" className="mt-2 text-sm text-amber-900">{t('cashReconciliation.warning',{difference:money(selected.cashWarning.difference)})}</p>
          {user?.role === 'admin' && <div className="mt-3 flex flex-wrap items-end gap-3"><label className="flex-1 text-sm">{t('cashReconciliation.note')}<textarea aria-label={t('cashReconciliation.note')} value={reviewNote} maxLength={2000} onChange={e=>setReviewNote(e.target.value)} className="input mt-1 block w-full" /></label><button type="button" disabled={reviewSaving} className="btn-primary" onClick={async()=>{if(!reviewNote.trim()){setReviewError(t('cashReconciliation.required'));return}setReviewSaving(true);setReviewError('');try{await api.post('/finance/shift-sessions/'+selected.id+'/cash-warning/review',{note:reviewNote.trim()});await query.refetch();setReviewNote('')}catch{setReviewError(t('cashReconciliation.reviewFailed'))}finally{setReviewSaving(false)}}}>{t('cashReconciliation.review')}</button></div>}
          {reviewError && <p role="alert" className="mt-2 text-sm text-red-600">{reviewError}</p>}
        </section>}
        {selected.cashWarning?.status === 'reviewed' && <section className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm" data-testid="shift-cash-reviewed"><h3 className="font-semibold">{t('cashReconciliation.reviewed')}</h3><p>{selected.cashWarning.reviewedByName || selected.cashWarning.reviewedBy} · {selected.cashWarning.reviewedAt && instant(selected.cashWarning.reviewedAt)}</p><p className="mt-1 whitespace-pre-wrap">{selected.cashWarning.reviewNote}</p><p className="mt-2 text-gray-500">{t('cashReconciliation.reported')}</p></section>}

        <p className="text-sm text-gray-500">{t('shiftReview.attribution')}</p>
        {selected.overlapping && <p role="alert" className="text-amber-700">{t('shiftReview.overlap')}</p>}
        <nav className="flex flex-wrap gap-1 border-b" aria-label={t('shiftReview.details')}>{(['overview', 'orders', 'warnings', 'expenses', 'employees'] as Tab[]).map(key => <button key={key} aria-pressed={tab === key} className={`px-4 py-3 font-medium ${tab === key ? 'text-primary border-b-2 border-primary' : 'text-gray-500'}`} onClick={() => setTab(key)}>{t(`shiftReview.${key}`)}{key !== 'overview' && ` (${key === 'warnings' ? warningRows.length : key === 'orders' ? orderRows.length : selected[key].length})`}</button>)}</nav>
        {tab === 'orders' && <div className="flex flex-wrap items-center gap-3 p-3 bg-white border rounded-xl"><label htmlFor="shift-order-status" className="text-sm font-medium">{t('orders.status')}</label><select id="shift-order-status" className="input w-auto" value={orderStatus} onChange={e => setOrderStatus(e.target.value)}><option value="active">{t('orderVoid.activeOrders')}</option><option value="all">{t('common.all')}</option><option value="refunded">{t('orders.refunded')}</option></select></div>}
        {tab === 'overview' ? <div className="bg-white rounded-xl border p-5 grid md:grid-cols-2 gap-4">
          {selected.session && <><div><span className="text-gray-500">{t('shiftReview.opener')}</span><p className="font-semibold">{selected.session.opener.name}</p></div><div><span className="text-gray-500">{t('shiftReview.handover')}</span><p className="font-semibold">{selected.session.nextStaff?.name || '—'}</p></div><div><span className="text-gray-500">{t('shiftReview.closeNote')}</span><p>{selected.session.closeNote || '—'}</p></div></>}
          <div><span className="text-gray-500">{t('shiftReview.completedOrders')}</span><p className="font-semibold">{selected.summary.completedOrders}</p></div><div><span className="text-gray-500">{t('shiftReview.refunded')}</span><p className="font-semibold">{selected.summary.refundedOrders} · {money(selected.summary.refundedAmount)}</p></div>
        </div> : <div className="bg-white rounded-xl border overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-left"><tr>{(tab === 'orders' ? ['time', 'products', 'quantity', 'employee', 'payment', 'status', 'amount'] : tab === 'expenses' ? ['time', 'category', 'quantity', 'employee', 'description', 'amount'] : tab === 'warnings' ? ['time', 'employee', 'severity', 'description'] : ['employee', 'number', 'role', 'orders', 'expenses', 'warnings']).map(key => <th key={key} className="p-3 whitespace-nowrap">{key === 'products' ? t('shiftHandover.products') : t(`shiftReview.${key}`)}</th>)}</tr></thead><tbody>
          {tab === 'orders' && (paged as Review['orders']).map(o => <OrderItemRows key={o.id} items={o.items}
            leading={rowSpan => <td rowSpan={rowSpan} className="p-3 whitespace-nowrap">{instant(o.createdAt)}</td>}
            renderProduct={item => !customRole || customRole.permissions.includes('orders.read') ? <Link className="text-primary" to={`/finance/orders/${encodeURIComponent(o.id)}`}>{item.productName || '—'}</Link> : <span>{item.productName || '—'}</span>}
            trailing={rowSpan => <><td rowSpan={rowSpan} className="p-3">{o.staffName}</td><td rowSpan={rowSpan} className="p-3">{o.paymentMethod?.toLowerCase()==='cash'?t('uiDesign.cash'):t(`payment.${o.paymentMethod}`, {defaultValue:o.paymentMethod?.toUpperCase()})}</td><td rowSpan={rowSpan} className="p-3">{t(`order.status.${o.status}`, {defaultValue:o.status})}</td><td rowSpan={rowSpan} className="p-3 font-semibold">{money(o.amount)}</td></>} />)}
          {tab === 'expenses' && (paged as Review['expenses']).map(e => <tr key={e.id} className="border-t"><td className="p-3 whitespace-nowrap">{instant(e.createdAt)}</td><td className="p-3">{categoryLabel(e.category)}</td><td className="text-right tabular-nums p-3">{formatNumber(e.quantity ?? '—')}</td><td className="p-3">{e.staffName || '—'}</td><td className="p-3">{e.description}</td><td className="p-3 font-semibold">{money(e.amount)}</td></tr>)}
          {tab === 'warnings' && (paged as Review['warnings']).map(w => <tr key={w.id} className="border-t"><td className="p-3 whitespace-nowrap">{instant(w.createdAt)}</td><td className="p-3">{w.staffName}</td><td className={`p-3 font-semibold ${w.severity === 'critical' ? 'text-red-600' : 'text-amber-700'}`}>{t(`shiftReview.${w.severity}`)}</td><td className="p-3">{w.description}</td></tr>)}
          {tab === 'employees' && (paged as Review['employees']).map(e => <tr key={e.id} className="border-t"><td className="p-3 font-semibold">{e.name}</td><td className="p-3">{e.employeeNumber || '—'}</td><td className="p-3">{e.roles.map(role => t(`shiftReview.${role}`)).join(' / ')}</td><td className="p-3">{e.orders}</td><td className="p-3">{e.expenses}</td><td className="p-3">{e.warnings}</td></tr>)}
        </tbody></table>{!rows.length && <p className="p-6 text-gray-500">{t('shiftReview.noRecords')}</p>}{rows.length > 20 && <div className="flex gap-4 justify-end items-center p-3"><button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('shiftReview.previous')}</button><span>{page} / {Math.ceil(rows.length / 20)}</span><button className="btn-secondary" disabled={page * 20 >= rows.length} onClick={() => setPage(p => p + 1)}>{t('shiftReview.next')}</button></div>}</div>}
      </section>}
    </>}
  </div>
}
