import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
import { Clock, Users, TrendingUp } from 'lucide-react'
import { requireRead } from '../../utils/dashboardNavigation'

interface Hour { hour: number; customers: number; orders: number }
interface Day { date: string; customers: number; orders: number; hours: Hour[] }
export interface PurchaseHours { timezone: string; startDate: string; endDate: string; totalCustomers: number; totalOrders: number; days: Day[] }
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
export function readPurchaseHours(value: unknown): PurchaseHours {
  const data = value as PurchaseHours
  const valid = data?.timezone === 'Asia/Jakarta' && count(data.totalCustomers) && count(data.totalOrders) && Array.isArray(data.days) && data.days.length > 0 && data.days.length <= 366 &&
    data.days.every((day, index) => /^\d{4}-\d{2}-\d{2}$/.test(day.date) && (!index || day.date > data.days[index - 1].date) && count(day.customers) && count(day.orders) && Array.isArray(day.hours) && day.hours.length === 24 && day.hours.every((hour, position) => hour.hour === position && count(hour.customers) && count(hour.orders)) && day.customers === day.hours.reduce((sum, hour) => sum + hour.customers, 0) && day.orders === day.hours.reduce((sum, hour) => sum + hour.orders, 0)) &&
    data.startDate === data.days[0].date && data.endDate === data.days[data.days.length - 1].date && data.totalCustomers === data.days.reduce((sum, day) => sum + day.customers, 0) && data.totalOrders === data.days.reduce((sum, day) => sum + day.orders, 0)
  return requireRead(data, valid)
}
const slot = (hour: number) => `${String(hour).padStart(2, '0')}:00–${String(hour + 1).padStart(2, '0')}:00`
export function PurchaseHoursAnalysis({ data }: { data: PurchaseHours }) {
  const { t, i18n } = useTranslation()
  const peaks = data.days.flatMap(day => day.hours.map(hour => ({ date: day.date, ...hour })))
  const max = Math.max(...peaks.map(hour => hour.customers))
  const highest = max > 0 ? peaks.filter(hour => hour.customers === max) : []
  const [selectedDate, setSelectedDate] = useState(highest[0]?.date || data.days[0].date)
  const day = data.days.find(day => day.date === selectedDate) || data.days[0]
  const dayMax = Math.max(...day.hours.map(hour => hour.customers))
  const number = (value: number) => value.toLocaleString(i18n.language)
  const description = (date: string, hour: Hour) => t('purchaseHours.cell', { date, time: slot(hour.hour), customers: number(hour.customers), orders: number(hour.orders) })
  const colors = ['#fce7f3', '#fbcfe8', '#f9a8d4', '#f472b6', '#db2777']
  return <section data-testid="revenue-purchase-analysis" className="rounded-2xl bg-white border border-gray-200 p-4 sm:p-6 shadow-sm space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-gray-900">{t('purchaseHours.title')}</h2><p className="mt-1 text-xs text-gray-500">{data.startDate} — {data.endDate} · WIB</p></div>
      <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-medium text-pink-700">{t('purchaseHours.hourly')}</span>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-gray-50 p-4"><p className="flex items-center gap-2 text-sm text-gray-500"><Users size={16}/>{t('purchaseHours.customers')}</p><p className="mt-2 text-3xl font-bold tabular-nums">{number(data.totalCustomers)}<span className="ml-2 text-sm font-normal text-gray-500">{t('purchaseHours.people')}</span></p></div>
      <div className="rounded-xl bg-gray-50 p-4"><p className="flex items-center gap-2 text-sm text-gray-500"><Clock size={16}/>{t('purchaseHours.orders')}</p><p className="mt-2 text-3xl font-bold tabular-nums">{number(data.totalOrders)}</p></div>
      <div data-testid="purchase-peak" className="rounded-xl border border-pink-200 bg-pink-50 p-4"><p className="flex items-center gap-2 text-sm font-medium text-pink-700"><TrendingUp size={16}/>{t('purchaseHours.peak')}</p>{highest.length ? <><p className="mt-2 font-bold text-gray-900">{highest[0].date} · {slot(highest[0].hour)}</p><p className="mt-1 text-xl font-bold text-pink-700">{number(max)} {t('purchaseHours.people')}</p>{highest.length > 1 && <details className="mt-2 text-xs text-pink-700"><summary className="cursor-pointer">{t('purchaseHours.ties', { count: highest.length })}</summary><ul className="mt-2 max-h-32 overflow-auto space-y-1">{highest.map(peak => <li key={`${peak.date}-${peak.hour}`}>{peak.date} · {slot(peak.hour)}</li>)}</ul></details>}</> : <p className="mt-2 text-sm text-gray-500">{t('purchaseHours.noPurchases')}</p>}</div>
    </div>
    {data.days.length > 1 && <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-gray-800">{t('purchaseHours.heatmap')}</h3><div className="flex items-center gap-1 text-xs text-gray-500"><span>{t('purchaseHours.less')}</span>{colors.map(color => <span key={color} className="h-3 w-4 rounded-sm" style={{ backgroundColor: color }}/>) }<span>{t('purchaseHours.more')}</span></div></div>
      <div className="max-h-[460px] overflow-auto rounded-xl border border-gray-100">
        <table data-testid="purchase-heatmap" className="w-full min-w-[940px] border-separate border-spacing-1 text-xs">
          <thead className="sticky top-0 z-10 bg-white"><tr><th className="p-2 text-left text-gray-500">{t('purchaseHours.date')}</th>{day.hours.map(hour => <th key={hour.hour} className="font-normal text-gray-500">{String(hour.hour).padStart(2, '0')}</th>)}<th className="p-2 text-right text-gray-500">{t('purchaseHours.dailyTotal')}</th></tr></thead>
          <tbody>{data.days.map(row => <tr key={row.date}><th className="whitespace-nowrap px-2 text-left"><button type="button" onClick={() => setSelectedDate(row.date)} aria-pressed={day.date === row.date} className={`py-2 ${day.date === row.date ? 'font-bold text-pink-700' : 'font-normal text-gray-600'}`}>{row.date}</button></th>{row.hours.map(hour => <td key={hour.hour}><button type="button" title={description(row.date, hour)} aria-label={description(row.date, hour)} onClick={() => setSelectedDate(row.date)} data-peak={max > 0 && hour.customers === max ? 'true' : undefined} className={`h-8 w-full min-w-6 rounded hover:ring-2 hover:ring-pink-400 focus:ring-2 focus:ring-pink-500 ${max > 0 && hour.customers === max ? 'font-bold text-white' : 'text-pink-950'}`} style={{ backgroundColor: hour.customers ? colors[Math.min(4, Math.ceil(hour.customers / max * 5) - 1)] : '#f3f4f6' }}>{hour.customers ? number(hour.customers) : '·'}</button></td>)}<td className="p-2 text-right font-semibold tabular-nums">{number(row.customers)}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500">{t('purchaseHours.selectHint')}</p>
    </div>}
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-gray-800">{t('purchaseHours.dayChart')} <span className="ml-2 text-pink-700" data-testid="purchase-chart-date">{day.date}</span></h3><label className="text-xs text-gray-500">{t('purchaseHours.date')} <select aria-label={t('purchaseHours.date')} value={day.date} onChange={event => setSelectedDate(event.target.value)} className="ml-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">{data.days.map(row => <option key={row.date} value={row.date}>{row.date}</option>)}</select></label></div>
      <div className="h-64" data-testid="purchase-hour-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={day.hours.map(hour => ({ ...hour, label: `${String(hour.hour).padStart(2, '0')}:00` }))} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#f1f5f9"/><XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} interval="preserveStartEnd" axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false}/><Tooltip labelFormatter={(_, payload) => payload?.[0] ? `${day.date} · ${slot(payload[0].payload.hour)}` : day.date} formatter={(value: number) => [`${number(value)} ${t('purchaseHours.people')}`, t('purchaseHours.customers')]} cursor={{ fill: '#fdf2f8' }}/><Bar dataKey="customers" radius={[4, 4, 0, 0]} maxBarSize={28}>{day.hours.map(hour => <Cell key={hour.hour} fill={hour.customers === dayMax && dayMax > 0 ? '#db2777' : '#f9a8d4'}/>)}</Bar>
      </BarChart></ResponsiveContainer></div>
      {!day.orders && <p className="text-center text-sm text-gray-500">{t('purchaseHours.noPurchases')}</p>}
    </div>
    <p className="text-xs leading-5 text-gray-500">{t('purchaseHours.basis')}</p>
  </section>
}
