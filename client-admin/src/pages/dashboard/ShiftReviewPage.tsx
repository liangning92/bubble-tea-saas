import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { RefreshCw, CalendarDays, AlertTriangle, ArrowLeft } from 'lucide-react'
import api, { financeApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { formatCurrency } from '../../utils/helpers'

type Summary = { revenue: number; orders: number; completedOrders: number; refundedOrders: number; refundedAmount: number; expenses: number; expenseAmount: number; warnings: number; employees: number }
type Employee = { id: string; name: string; employeeNumber: string | null; position: string | null; orders: number; expenses: number; warnings: number; roles: string[] }
type Review = {
  id: string; windowStart: string; windowEnd: string; overlapping: boolean; summary: Summary
  session: null | { shift: string; status: string; openedAt: string; closedAt: string | null; openFloat: number; actualCash: number | null; expectedCash: number; cashDifference: number | null; closeNote: string | null; opener: { name: string }; nextStaff: { name: string } | null; definition: { name: string; nameZh: string | null; nameId: string | null } | null }
  orders: { id: string; orderNumber: string; pickupNumber: string | null; staffName: string; status: string; amount: number; paymentMethod: string; createdAt: string }[]
  expenses: { id: string; category: string; amount: number; quantity: number | null; description: string; createdAt: string; staffName: string | null }[]
  warnings: { id: string; staffName: string; severity: string; description: string; action: string; createdAt: string }[]
  employees: Employee[]
}
type Result = { categories: { key: string; label?: string; labelZh?: string; labelEn?: string; labelId?: string; isDefault?: boolean }[]; sessions: Review[]; unassigned: Review; asOf: string }
type Tab = 'overview' | 'orders' | 'warnings' | 'expenses' | 'employees'
const day = (d = new Date()) => new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10)
const shiftDay = (value: string, days: number) => day(new Date(new Date(value + 'T00:00:00+07:00').getTime() + days * 86400000))
export function ShiftReviewPage() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore(s => s.user)
  const access = useQuery({ queryKey: ['shift-review-access', user?.id, user?.storeId], enabled: !!user && user.role !== 'admin', queryFn: async () => (await api.get('/staff-permissions/me')).data.data as { role: { permissions: string[] } | null } })
  const customRole = access.data?.role
  const allowed = !!user?.storeId && ['admin', 'manager'].includes(user.role) && (user.role === 'admin' || (!!access.data && !access.isError && (!customRole || customRole.permissions.includes('finance.read'))))
  const [range, setRange] = useState({ startDate: day(), endDate: day() })
  const [selection, setSelection] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [page, setPage] = useState(1)
  const days = (Date.parse(range.endDate) - Date.parse(range.startDate)) / 86400000
  const valid = !!range.startDate && !!range.endDate && days >= 0 && days < 31
  const query = useQuery({ queryKey: ['shift-review', user?.storeId, customRole, range], enabled: allowed && valid,
    queryFn: async () => {
      const response = await financeApi.shiftSessions(range)
      const result = response.data?.data as Result
      if (!Array.isArray(result?.sessions) || !result?.unassigned?.summary || !result.asOf) throw Error('INVALID_SHIFT_REVIEW')
      return result
    } })
  useEffect(() => { setSelection(null); setPage(1); setTab('overview') }, [range.startDate, range.endDate])
  useEffect(() => { setPage(1) }, [selection, tab])
  const data = query.data
  const unmatched = data?.unassigned
  const hasUnmatched = unmatched && (unmatched.summary.orders + unmatched.summary.expenses + unmatched.summary.warnings > 0)
  const selected = selection === 'unassigned' && hasUnmatched ? unmatched : data?.sessions.find(s => s.id === selection) || data?.sessions[data.sessions.length - 1] || (hasUnmatched ? unmatched : undefined)
  const instant = (value: string) => new Date(value).toLocaleString(i18n.language === 'zh' ? 'zh-CN' : i18n.language, { timeZone: 'Asia/Jakarta', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  const title = (row: Review) => row.session ? (i18n.language === 'zh' ? row.session.definition?.nameZh : i18n.language === 'id' ? row.session.definition?.nameId : row.session.definition?.name) || t(`shiftReview.${row.session.shift}`, { defaultValue: row.session.shift }) : t('shiftReview.unassigned')
  const categoryLabel = (key: string) => {
    const category = data?.categories?.find(c => c.key === key)
    const defaults: Record<string, string> = { rent: 'categoryRent', utilities: 'categoryUtilities', supplies: 'categorySupplies', salary: 'categorySalary', reimbursement: 'categoryReimbursement', other: 'categoryOther' }
    if (category && (!category.isDefault || !defaults[key])) return (i18n.language.startsWith('zh') ? category.labelZh : i18n.language.startsWith('en') ? category.labelEn : category.labelId) || category.label || key
    return defaults[key] ? t('expense.' + defaults[key]) : category?.label || key
  }
  const money = (value: number | null | undefined) => value == null ? '—' : formatCurrency(value)
  const shortcut = (kind: 'today' | 'yesterday' | 'week') => {
    const today = day(), weekday = new Date(today + 'T00:00:00Z').getUTCDay()
    const startDate = kind === 'yesterday' ? shiftDay(today, -1) : kind === 'week' ? shiftDay(today, -((weekday + 6) % 7)) : today
    setRange({ startDate, endDate: kind === 'yesterday' ? startDate : today })
  }
  const cards = (row: Review) => <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
    {(['revenue', 'orders', 'warnings', 'expenseAmount', 'employees'] as const).map(key => <div key={key} className="bg-white rounded-xl border p-4">
      <p className="text-sm text-gray-500">{t(`shiftReview.${key}`)}</p><p className={`mt-2 text-2xl font-bold ${key === 'revenue' ? 'text-primary' : key === 'warnings' && row.summary.warnings > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{key === 'revenue' || key === 'expenseAmount' ? money(row.summary[key]) : row.summary[key]}</p>
    </div>)}
  </div>
  if (user?.role !== 'admin' && access.isPending) return <p role="status">{t('common.loading')}</p>
  if (!allowed) return <p role="alert">{t('shiftReview.denied')}</p>
  const rows = selected && tab !== 'overview' ? selected[tab] : []
  const paged = rows.slice((page - 1) * 20, page * 20)
  return <div className="space-y-5" data-testid="shift-review-page">
    <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-primary hover:underline"><ArrowLeft size={16} />{t('dashboard.title')}</Link>
    <header className="flex flex-wrap justify-between items-center gap-3"><h1 className="text-2xl font-bold">{t('shiftReview.title')}</h1><button className="btn-secondary flex items-center gap-2" disabled={query.isFetching || !valid} onClick={() => void query.refetch()}><RefreshCw size={16} />{t('common.refresh')}</button></header>
    <section className="bg-white border rounded-xl p-4 flex flex-wrap items-end gap-3" aria-label={t('shiftReview.dateRange')}>
      <CalendarDays size={20} className="mb-3 text-primary" /><label className="text-sm text-gray-600">{t('shiftReview.start')}<input aria-label={t('shiftReview.start')} type="date" value={range.startDate} max={range.endDate || undefined} className="input block mt-1" onChange={e => setRange(r => ({ ...r, startDate: e.target.value }))} /></label>
      <label className="text-sm text-gray-600">{t('shiftReview.end')}<input aria-label={t('shiftReview.end')} type="date" value={range.endDate} min={range.startDate || undefined} className="input block mt-1" onChange={e => setRange(r => ({ ...r, endDate: e.target.value }))} /></label>
      {(['today', 'yesterday', 'week'] as const).map(key => <button key={key} className="btn-secondary" onClick={() => shortcut(key)}>{t(`shiftReview.${key}`)}</button>)}
    </section>
    {!valid ? <p role="alert" className="text-red-600">{t('shiftReview.invalidRange')}</p> : query.isPending ? <p role="status">{t('common.loading')}</p> : query.isError ? <p role="alert" className="text-red-600">{t('shiftReview.failed')}</p> : <>
      <div className="bg-white rounded-xl border overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-left"><tr>{['shift', 'time', 'opener', 'revenue', 'orders', 'warnings', 'expenseAmount', 'status'].map(key => <th key={key} className="p-3 whitespace-nowrap">{t(`shiftReview.${key}`)}</th>)}<th /></tr></thead><tbody>
        {[...(data?.sessions || []), ...(hasUnmatched ? [unmatched!] : [])].map(row => <tr key={row.id} className={`border-t ${selected?.id === row.id ? 'bg-pink-50' : ''}`}><td className="p-3 font-semibold">{title(row)}</td><td className="p-3 whitespace-nowrap">{instant(row.windowStart)} — {row.session?.status === 'open' ? t('shiftReview.ongoing') : instant(row.windowEnd)}</td><td className="p-3">{row.session?.opener.name || '—'}</td><td className="p-3 font-semibold">{money(row.summary.revenue)}</td><td className="p-3">{row.summary.orders}</td><td className={`p-3 ${row.summary.warnings > 0 ? 'text-amber-700 font-bold' : ''}`}>{row.summary.warnings}</td><td className="p-3">{money(row.summary.expenseAmount)}</td><td className="p-3">{row.session ? t(`shiftReview.${row.session.status}`) : t('shiftReview.reviewNeeded')}</td><td className="p-3"><button className="text-primary font-medium whitespace-nowrap" aria-pressed={selected?.id === row.id} onClick={() => { setSelection(row.id); setTab('overview') }}>{t('shiftReview.details')}</button></td></tr>)}
      </tbody></table>{!data?.sessions.length && !hasUnmatched && <p className="p-6 text-gray-500">{t('shiftReview.empty')}</p>}</div>
      {hasUnmatched && <div role="status" className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3"><AlertTriangle className="text-amber-600 shrink-0" size={20} /><div><p className="font-semibold text-amber-900">{t('shiftReview.unassignedHint')}</p><button className="text-amber-800 underline mt-1" onClick={() => { setSelection('unassigned'); setTab('warnings') }}>{t('shiftReview.viewUnassigned')}</button></div></div>}
      {selected && <section className="space-y-4" data-testid="shift-review-detail">
        <div className="flex flex-wrap justify-between items-end gap-2"><div><h2 className="text-xl font-bold">{title(selected)} · {t('shiftReview.details')}</h2><p className="text-sm text-gray-500 mt-1">{instant(selected.windowStart)} — {instant(selected.windowEnd)} · WIB</p></div><span className="text-sm text-gray-500">{t('shiftReview.updated')} {data && instant(data.asOf)}</span></div>
        {cards(selected)}
        <p className="text-sm text-gray-500">{t('shiftReview.attribution')}</p>
        {selected.overlapping && <p role="alert" className="text-amber-700">{t('shiftReview.overlap')}</p>}
        <nav className="flex flex-wrap gap-1 border-b" aria-label={t('shiftReview.details')}>{(['overview', 'orders', 'warnings', 'expenses', 'employees'] as Tab[]).map(key => <button key={key} aria-pressed={tab === key} className={`px-4 py-3 font-medium ${tab === key ? 'text-primary border-b-2 border-primary' : 'text-gray-500'}`} onClick={() => setTab(key)}>{t(`shiftReview.${key}`)}{key !== 'overview' && ` (${selected[key].length})`}</button>)}</nav>
        {tab === 'overview' ? <div className="bg-white rounded-xl border p-5 grid md:grid-cols-2 gap-4">
          {selected.session && <><div><span className="text-gray-500">{t('shiftReview.opener')}</span><p className="font-semibold">{selected.session.opener.name}</p></div><div><span className="text-gray-500">{t('shiftReview.handover')}</span><p className="font-semibold">{selected.session.nextStaff?.name || '—'}</p></div><div><span className="text-gray-500">{t('shiftReview.float')}</span><p className="font-semibold">{money(selected.session.openFloat)}</p></div><div><span className="text-gray-500">{t('shiftReview.counted')}</span><p className="font-semibold">{money(selected.session.actualCash)}</p></div><div><span className="text-gray-500">{t('shiftReview.difference')}</span><p className="font-semibold">{money(selected.session.cashDifference)}</p></div><div><span className="text-gray-500">{t('shiftReview.closeNote')}</span><p>{selected.session.closeNote || '—'}</p></div></>}
          <div><span className="text-gray-500">{t('shiftReview.completedOrders')}</span><p className="font-semibold">{selected.summary.completedOrders}</p></div><div><span className="text-gray-500">{t('shiftReview.refunded')}</span><p className="font-semibold">{selected.summary.refundedOrders} · {money(selected.summary.refundedAmount)}</p></div>
        </div> : <div className="bg-white rounded-xl border overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-left"><tr>{(tab === 'orders' ? ['time', 'orderNumber', 'employee', 'payment', 'status', 'amount'] : tab === 'expenses' ? ['time', 'category', 'quantity', 'employee', 'description', 'amount'] : tab === 'warnings' ? ['time', 'employee', 'severity', 'description'] : ['employee', 'number', 'role', 'orders', 'expenses', 'warnings']).map(key => <th key={key} className="p-3 whitespace-nowrap">{t(`shiftReview.${key}`)}</th>)}</tr></thead><tbody>
          {tab === 'orders' && (paged as Review['orders']).map(o => <tr key={o.id} className="border-t"><td className="p-3 whitespace-nowrap">{instant(o.createdAt)}</td><td className="p-3">{!customRole || customRole.permissions.includes('orders.read') ? <Link className="text-primary" to={`/finance/orders/${o.id}`}>{o.orderNumber}</Link> : o.orderNumber}{o.pickupNumber && <span className="ml-2 text-gray-500">#{o.pickupNumber}</span>}</td><td className="p-3">{o.staffName}</td><td className="p-3">{t(`payment.${o.paymentMethod}`, { defaultValue: o.paymentMethod })}</td><td className="p-3">{t(`order.status.${o.status}`, { defaultValue: o.status })}</td><td className="p-3 font-semibold">{money(o.amount)}</td></tr>)}
          {tab === 'expenses' && (paged as Review['expenses']).map(e => <tr key={e.id} className="border-t"><td className="p-3 whitespace-nowrap">{instant(e.createdAt)}</td><td className="p-3">{categoryLabel(e.category)}</td><td className="p-3">{e.quantity ?? '—'}</td><td className="p-3">{e.staffName || '—'}</td><td className="p-3">{e.description}</td><td className="p-3 font-semibold">{money(e.amount)}</td></tr>)}
          {tab === 'warnings' && (paged as Review['warnings']).map(w => <tr key={w.id} className="border-t"><td className="p-3 whitespace-nowrap">{instant(w.createdAt)}</td><td className="p-3">{w.staffName}</td><td className={`p-3 font-semibold ${w.severity === 'critical' ? 'text-red-600' : 'text-amber-700'}`}>{t(`shiftReview.${w.severity}`)}</td><td className="p-3">{w.description}</td></tr>)}
          {tab === 'employees' && (paged as Review['employees']).map(e => <tr key={e.id} className="border-t"><td className="p-3 font-semibold">{e.name}</td><td className="p-3">{e.employeeNumber || '—'}</td><td className="p-3">{e.roles.map(role => t(`shiftReview.${role}`)).join(' / ')}</td><td className="p-3">{e.orders}</td><td className="p-3">{e.expenses}</td><td className="p-3">{e.warnings}</td></tr>)}
        </tbody></table>{!rows.length && <p className="p-6 text-gray-500">{t('shiftReview.noRecords')}</p>}{rows.length > 20 && <div className="flex gap-4 justify-end items-center p-3"><button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('shiftReview.previous')}</button><span>{page} / {Math.ceil(rows.length / 20)}</span><button className="btn-secondary" disabled={page * 20 >= rows.length} onClick={() => setPage(p => p + 1)}>{t('shiftReview.next')}</button></div>}</div>}
      </section>}
    </>}
  </div>
}
