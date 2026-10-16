import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { inventoryFlowApi, materialName } from '../services/inventoryFlow'
import { useAuthStore } from '../stores/auth'
import { formatQuantity } from '../utils/helpers'

type Entry = { id: string; quantity: number; reason: string; createdAt: string; operator: { name: string } | null; note: string }
type Group = { inventoryId: string; name: string; unit: string; quantity: number; entries: Entry[] }
type TodayData = { date: string; timezone: string; generatedAt: string; recordCount: number; groups: Group[] }
export function TodayStockOuts({ selectedId = '', refreshKey = 0 }: { selectedId?: string; refreshKey?: number }) {
  const { t, i18n } = useTranslation(), storeId = useAuthStore(state => state.user?.storeId)
  const [data, setData] = useState<TodayData | null>(null), [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [search, setSearch] = useState('')
  const sequence = useRef(0)
  const load = useCallback(async () => {
    const request = ++sequence.current
    setLoading(true); setFailed(false)
    try {
      const result = await inventoryFlowApi.todayStockOuts()
      if (!Array.isArray(result.data?.groups) || !result.data?.timezone || !result.data?.date) throw Error('TODAY_STOCK_OUT_INVALID')
      if (request === sequence.current) setData(result.data)
    } catch { if (request === sequence.current) setFailed(true) }
    finally { if (request === sequence.current) setLoading(false) }
  }, [storeId])
  useEffect(() => { setData(null); setSearch('') }, [storeId])
  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { void load() }, 60000)
    const onFocus = () => { void load() }
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onVisible)
    return () => { ++sequence.current; window.clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisible) }
  }, [load, refreshKey])
  const groups = data?.groups || [], selected = groups.find(group => group.inventoryId === selectedId)
  const visible = groups.filter(group => [group.name, materialName(group.name, i18n.language)].join(' ').toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()))
  const amount = (group: Group) => `${formatQuantity(group.quantity, i18n.language)} ${group.unit}`
  const time = (value: string) => new Intl.DateTimeFormat(i18n.language, { timeZone: data?.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
  const dateLabel = data ? new Intl.DateTimeFormat(i18n.language, { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(data.date+'T12:00:00Z')) : ''
  const zoneLabel = data ? new Intl.DateTimeFormat(i18n.language, { timeZone: data.timezone, timeZoneName: 'short' }).formatToParts(new Date(data.generatedAt)).find(part => part.type === 'timeZoneName')?.value : ''
  return <section data-testid="today-stock-outs" className="space-y-3 border-t pt-5">
    <header className="flex flex-wrap justify-between gap-3 items-center"><div><h2 className="font-bold text-lg">{t('todayStockOut.title')}</h2>{data && <p className="text-xs text-gray-500">{dateLabel} · {zoneLabel}</p>}</div><button type="button" onClick={load} disabled={loading} className="text-primary-hover px-2 py-2">{t('inventoryFlow.refresh')}</button></header>
    <p className="text-sm text-gray-600">{t('todayStockOut.hint')}</p>
    {selected && <p role="status" className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900">{materialName(selected.name, i18n.language)}：{t('todayStockOut.selected', { quantity: amount(selected) })}</p>}
    {loading && <p role="status">{t('inventoryFlow.loading')}</p>}
    {failed && <p role="alert" className="bg-red-50 text-red-700 rounded-lg p-3">{t(data ? 'todayStockOut.stale' : 'todayStockOut.failed')}</p>}
    {data && <><p className="text-xs text-gray-500">{t('todayStockOut.scope')} · {t('todayStockOut.updated')} {time(data.generatedAt)}</p>{groups.length > 0 && <input aria-label={t('todayStockOut.search')} placeholder={t('todayStockOut.search')} value={search} onChange={event => setSearch(event.target.value)} className="border rounded-lg p-3 w-full min-w-0"/>}{!groups.length ? <p className="bg-white border rounded-xl p-4 text-gray-500">{t('todayStockOut.empty')}</p> : !visible.length ? <p>{t('todayStockOut.noMatch')}</p> : visible.map(group => <StockOutGroup key={group.inventoryId} group={group} time={time} highlighted={group.inventoryId === selectedId}/>)}</>}
  </section>
}
function StockOutGroup({ group, time, highlighted }: { group: Group; time: (value: string) => string; highlighted: boolean }) {
  const { t, i18n } = useTranslation(), [open, setOpen] = useState(false), latest = group.entries[0]
  const reason = (value: string) => t(value === 'process' ? 'inventoryProcessing.title' : value === 'transfer' ? 'todayStockOut.transfer' : 'inventoryFlow.' + value)
  return <article data-testid="today-stock-out-material" className={`bg-white border rounded-xl p-4 space-y-2 min-w-0 ${highlighted ? 'border-amber-400' : ''}`}>
    <div className="flex flex-wrap justify-between items-start gap-2"><h3 className="font-medium break-words min-w-0">{materialName(group.name, i18n.language)}</h3><strong className="text-primary-hover">{formatQuantity(group.quantity, i18n.language)} {group.unit}</strong></div>
    {latest && <p className="text-sm text-gray-500">{t('todayStockOut.latest')} {time(latest.createdAt)} · {latest.operator?.name || t('inventoryActors.unrecorded')}</p>}
    <details onToggle={event => setOpen(event.currentTarget.open)}><summary className="cursor-pointer text-sm text-gray-600 py-1">{t('todayStockOut.entries', { count: group.entries.length })}</summary>{open && <ul className="divide-y mt-2 text-sm">{group.entries.map(entry => <li key={entry.id} className="py-2 space-y-1"><div className="flex flex-wrap justify-between gap-2"><span>{time(entry.createdAt)} · {reason(entry.reason)}</span><strong>{formatQuantity(entry.quantity, i18n.language)} {group.unit}</strong></div><p className="text-xs text-gray-500">{entry.operator?.name || t('inventoryActors.unrecorded')}</p>{entry.note && <p className="break-words text-gray-600">{entry.note}</p>}</li>)}</ul>}</details>
  </article>
}
