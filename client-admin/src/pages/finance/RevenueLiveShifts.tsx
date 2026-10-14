import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { financeApi } from '../../services/api'
import { useStoreDateSettings } from '../../hooks/useStoreDateSettings'
import { formatStoreDate, storeCalendarDate } from '../../utils/storeDateTime'
import { formatCurrency } from '../../utils/helpers'

type Range = { startDate: string; endDate: string }
type Shift = { id: string; windowStart: string; windowEnd: string; session: { status: string; shift: string; opener: { name: string }; definition: { name: string; nameZh: string | null; nameId: string | null } | null }; summary: { revenue: number; orders: number; expenseAmount: number }; overlapping: boolean }
const move = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10)

export function RevenueLiveShifts({ storeId, role, enabled, range }: { storeId: string; role?: string; enabled: boolean; range: Range }) {
  const { t, i18n } = useTranslation()
  const settings = useStoreDateSettings()
  const query = useQuery({
    queryKey: ['revenue-live-shifts', storeId, role, range, settings], enabled, refetchInterval: 30000,
    queryFn: async () => {
      // The review API supports at most 31 calendar days per request. A shift
      // crossing a chunk boundary appears twice; retain its latest snapshot.
      const rows = new Map<string, Shift>()
      let asOf = ''
      for (let startDate = range.startDate; startDate <= range.endDate;) {
        const endDate = [move(startDate, 29), range.endDate].sort()[0]
        const data = (await financeApi.shiftSessions({ startDate, endDate })).data?.data as { sessions: Shift[]; asOf: string }
        if (!Array.isArray(data?.sessions) || !Number.isFinite(Date.parse(data.asOf)) || data.sessions.some(row => !row.id || !row.session || !row.summary || !Number.isFinite(row.summary.revenue) || !Number.isFinite(row.summary.orders) || !Number.isFinite(row.summary.expenseAmount))) throw Error('INVALID_LIVE_SHIFTS')
        for (const row of data.sessions) rows.set(row.id, row)
        asOf = data.asOf
        startDate = move(endDate, 1)
      }
      return { sessions: [...rows.values()].sort((a, b) => b.windowStart.localeCompare(a.windowStart)), asOf }
    }
  })
  if (!enabled) return null
  const time = (value: string) => formatStoreDate(value, settings, true)
  return <section className="space-y-3" data-testid="revenue-live-shifts">
    <div className="flex flex-wrap justify-between gap-2 items-center"><h2 className="text-lg font-semibold">{t('shiftReview.title')}</h2><button className="btn-secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>{t('common.refresh')}</button></div>
    {query.isError ? <p role="alert">{t('shiftReview.failed')}</p> : query.isPending ? <p role="status">{t('common.loading')}</p> : <>
      <p className="text-xs text-gray-500">{t('shiftReview.updated')} {time(query.data.asOf)} · {settings.timezone}</p>
      {query.data.sessions.length === 0 ? <p className="text-sm text-gray-500">{t('shiftReview.empty')}</p> : <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm">
        <thead className="bg-gray-50 text-left"><tr>{['shift', 'time', 'opener', 'revenue', 'orders', 'expenseAmount', 'status'].map(key => <th key={key} className="p-3 whitespace-nowrap">{t('shiftReview.' + key)}</th>)}<th /></tr></thead>
        <tbody>{query.data.sessions.map(row => <tr key={row.id} data-testid={'live-shift-' + row.id} className="border-t">
          <td className="p-3 font-semibold">{(i18n.language.startsWith('zh') ? row.session.definition?.nameZh : i18n.language.startsWith('id') ? row.session.definition?.nameId : row.session.definition?.name) || t('shiftReview.' + row.session.shift, { defaultValue: row.session.shift })}</td>
          <td className="p-3 whitespace-nowrap">{time(row.windowStart)} — {row.session.status === 'open' ? t('shiftReview.ongoing') : time(row.windowEnd)}</td>
          <td className="p-3">{row.session.opener.name}</td><td className="p-3 font-semibold">{formatCurrency(row.summary.revenue)}</td><td className="p-3">{row.summary.orders}</td><td className="p-3">{formatCurrency(row.summary.expenseAmount)}</td><td className="p-3">{t('shiftReview.' + row.session.status)}{row.overlapping && <p className="text-amber-700">{t('shiftReview.reviewNeeded')}</p>}</td>
          <td className="p-3"><Link className="text-primary font-semibold whitespace-nowrap" to={`/finance/revenue/shifts/${encodeURIComponent(row.id)}?${new URLSearchParams({ startDate: storeCalendarDate(row.windowStart, settings.timezone), endDate: storeCalendarDate(row.windowEnd, settings.timezone), returnStartDate: range.startDate, returnEndDate: range.endDate })}`}>{t('shiftReview.details')}</Link></td>
        </tr>)}</tbody>
      </table></div>}
    </>}
  </section>
}
