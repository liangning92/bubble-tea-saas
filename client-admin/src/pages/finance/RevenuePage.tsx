import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { revenueApi, configApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { formatCurrency } from '../../utils/helpers'
import { finiteNumber, requireRead, validInstant } from '../../utils/dashboardNavigation'
import { DashboardReadFailure } from '../../components/DashboardReadState'
import {TrendingUp, TrendingDown, ShoppingBag, Bike, Store, Utensils, CreditCard, Calendar, DollarSign} from 'lucide-react'
import {BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell} from 'recharts'
import {PageHelp} from '../../components/PageHelp'

interface ChannelData { channel:string; revenue:number; orders:number; avgOrderValue:number }
interface RevenueTotals { revenue:number; orders:number; avgOrderValue:number }
interface Summary { current:RevenueTotals; previous:RevenueTotals; revenueChange:number; ordersChange:number; comparisonRange?:{startDate:string;endDate:string;adjusted:boolean} }
type Period = 'today' | 'week' | 'month' | 'custom'
const periods: Period[] = ['today','week','month','custom']
const CHANNEL_ICONS = {pos:ShoppingBag,gofood:Bike,grabfood:Bike,shopee:ShoppingBag,tokopedia:Store,dine_in:Utensils,takeaway:Store,cash:CreditCard}
const CHANNEL_LABELS: Record<string,string> = {pos:'POS',gofood:'GoFood',grabfood:'GrabFood',shopee:'ShopeeFood',tokopedia:'Tokopedia',dine_in:'Dine In',takeaway:'Takeaway',cash:'Cash'}
const validDate = (value:string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value
const validTotals = (value:RevenueTotals) => !!value && finiteNumber(value.revenue) && finiteNumber(value.orders) && finiteNumber(value.avgOrderValue)
function readChannels(value: unknown): ChannelData[] {
  const rows = value as ChannelData[]
  return requireRead(rows,Array.isArray(rows) && rows.every(row=>typeof row.channel==='string' && validTotals(row)))
}
function readSummary(value: unknown): Summary {
  const summary=value as Summary
  const range=summary?.comparisonRange
  const validRange=!range || (validInstant(range.startDate) && validInstant(range.endDate) && Date.parse(range.startDate)<=Date.parse(range.endDate) && typeof range.adjusted==='boolean')
  return requireRead(summary,validRange && !!summary && validTotals(summary.current) && validTotals(summary.previous) && finiteNumber(summary.revenueChange) && finiteNumber(summary.ordersChange))
}

export function RevenuePage() {
  const {t, i18n}=useTranslation()
  const user=useAuthStore(state=>state.user)
  const storeId=user?.storeId
  const canRead=user?.role==='admin'||user?.role==='manager'
  const [period,setPeriod]=useState<Period>('today')
  const [customDateRange,setCustomDateRange]=useState({start:'',end:''})
  const manualSelection=useRef(0)
  const [preferenceError,setPreferenceError]=useState(false)

  useEffect(()=>{
    if (!storeId || !canRead) return
    setPreferenceError(false)
    let active=true
    const version=manualSelection.current
    configApi.get(storeId).then(response=>{
      const data=response.data?.data
      const configs=Array.isArray(data)?data:Array.isArray(data?.data)?data.data:[]
      const preference=configs.find((row:{key:string;value:string})=>row.key==='revenue.defaultPeriod')?.value || data?.['revenue.defaultPeriod']
      if (active && version===manualSelection.current && ['today','week','month'].includes(preference)) setPeriod(preference)
    }).catch(()=>{})
    return ()=>{active=false}
  },[storeId,canRead])

  const handlePeriodChange = async (value:Period) => {
    manualSelection.current+=1
    const version=manualSelection.current
    setPeriod(value)
    setPreferenceError(false)
    if (!storeId || value==='custom') return
    try {await configApi.set(storeId,'revenue.defaultPeriod',value,'finance')}
    catch {if (version===manualSelection.current && useAuthStore.getState().user?.storeId===storeId) setPreferenceError(true)}
  }
  const validCustom=validDate(customDateRange.start) && validDate(customDateRange.end) && customDateRange.start<=customDateRange.end
  const validSelection=period!=='custom'||validCustom
  // This immutable parameter snapshot is shared by the table and its summary.
  const params=period==='custom'?{storeId,period,startDate:customDateRange.start,endDate:customDateRange.end}:{storeId,period}
  const selected=useQuery({
    queryKey:['revenue-selected',storeId,user?.role,params],
    enabled:!!storeId && canRead && validSelection,
    queryFn:async()=>{
      const [channels,summary]=await Promise.all([revenueApi.byChannel(params),revenueApi.summary(params)])
      return {channels:readChannels(channels.data?.data),summary:readSummary(summary.data?.data)}
    },
  })
  const label=period==='custom'?`${customDateRange.start} — ${customDateRange.end}`:t(`finance.${period==='today'?'today':period==='week'?'thisWeek':'thisMonth'}`)
  const summary=selected.data?.summary
  const channels=selected.data?.channels||[]
  const change=(value:number)=>value===0?<span>-</span>:<span className={`inline-flex items-center gap-1 ${value>0?'text-green-600':'text-red-600'}`}>{value>0?<TrendingUp size={12}/>:<TrendingDown size={12}/>} {value>0?'+':''}{value}%</span>

  if (!storeId) return <DashboardReadFailure scope />
  if (!canRead) return <p role="alert" data-testid="revenue-role-denied">{t('revenueRange.permissionDenied')}</p>
  const chartRows=channels.map(row=>({...row,name:CHANNEL_LABELS[row.channel]||row.channel}))
  const compact=(value:number)=>new Intl.NumberFormat(i18n.language,{notation:'compact',maximumFractionDigits:1}).format(value)
  const time=(value:string)=>new Date(value).toLocaleString(i18n.language,{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-bold text-gray-900">{t('revenueLayout.title')}</h1>
      <div className="inline-flex gap-1 rounded-xl bg-gray-100 p-1" aria-label={t('revenueRange.selectedRange')}>
        {periods.map(value=><button key={value} type="button" aria-pressed={period===value} onClick={()=>void handlePeriodChange(value)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${period===value?'bg-primary text-white shadow-sm':'text-gray-600 hover:bg-white'}`}>
          {value==='custom'&&<Calendar size={14} className="inline mr-1"/>}{t(value==='custom'?'common.custom':`finance.${value==='today'?'today':value==='week'?'thisWeek':'thisMonth'}`)}
        </button>)}
      </div>
    </header>
    {period==='custom'&&<div className="flex flex-wrap items-center gap-3 rounded-xl bg-white border border-gray-200 p-4">
      <label className="text-sm text-gray-600">{t('revenueRange.startDate')}<input aria-label={t('revenueRange.startDate')} type="date" value={customDateRange.start} onChange={e=>setCustomDateRange(prev=>({...prev,start:e.target.value}))} className="input ml-2"/></label>
      <span className="text-gray-400">—</span>
      <label className="text-sm text-gray-600">{t('revenueRange.endDate')}<input aria-label={t('revenueRange.endDate')} type="date" value={customDateRange.end} onChange={e=>setCustomDateRange(prev=>({...prev,end:e.target.value}))} className="input ml-2"/></label>
    </div>}
    {preferenceError&&<PageHelp><p role="status">{t('revenueRange.preferenceFailed')}</p></PageHelp>}
    <section className="space-y-6" data-testid="revenue-selected-range">
      {!validSelection?<p role="alert" data-testid="revenue-range-invalid" className="card text-amber-700">{t('revenueRange.invalidRange')}</p>:selected.isError?<DashboardReadFailure retry={()=>selected.refetch()} />:selected.isPending?<p role="status">{t('common.loading')}</p>:summary&&<>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4" data-testid="revenue-selected-summary">
          <div className="rounded-2xl bg-white border border-emerald-100 p-6 shadow-sm lg:col-span-2">
            <div className="flex items-center justify-between gap-4"><p className="text-sm font-medium text-gray-500">{label} · {t('revenueLayout.netRevenue')}</p><div className="rounded-xl bg-emerald-50 p-2.5"><DollarSign size={22} className="text-emerald-600"/></div></div>
            <p data-testid="revenue-primary-value" className={`mt-3 text-3xl sm:text-4xl xl:text-5xl font-bold tracking-tight tabular-nums break-words ${summary.current.revenue<0?'text-red-600':'text-gray-900'}`}>{formatCurrency(summary.current.revenue)}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold">{change(summary.revenueChange)}</span><span className="text-gray-500">{t('revenueLayout.vsPrevious')}</span><span className="ml-auto text-gray-400">WIB</span></div>
          </div>
          <div className="rounded-2xl bg-white border border-gray-200 p-6 shadow-sm"><p className="text-sm text-gray-500">{t('common.orders')}</p><p data-testid="revenue-order-value" className="mt-5 text-3xl font-bold tabular-nums text-gray-900">{summary.current.orders.toLocaleString(i18n.language)}</p><p className="mt-4 text-xs text-gray-400">{label}</p></div>
          <div className="rounded-2xl bg-white border border-gray-200 p-6 shadow-sm"><p className="text-sm text-gray-500">{t('finance.avgOrderValue')}</p><p data-testid="revenue-average-value" className="mt-5 text-xl xl:text-2xl font-bold tabular-nums break-words text-gray-900">{formatCurrency(summary.current.avgOrderValue)}</p><p className="mt-4 text-xs text-gray-400">{label}</p></div>
        </div>
        {summary.comparisonRange?.adjusted&&<PageHelp><p data-testid="revenue-comparison-adjusted">{t('revenueRange.comparisonAdjusted')} {t('revenueRange.comparisonRange')}: {time(summary.comparisonRange.startDate)} — {time(summary.comparisonRange.endDate)} (WIB)</p></PageHelp>}
        {channels.length===0?<p className="card text-gray-500">{t('common.noData')}</p>:<>
          <section className="rounded-2xl bg-white border border-gray-200 p-6 shadow-sm" data-testid="revenue-channel-chart">
            <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold text-gray-900">{t('revenueLayout.channelRevenue')}</h2><span className="text-xs text-gray-400">{label}</span></div>
            <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartRows} layout="vertical" margin={{top:4,right:24,bottom:4,left:0}}>
              <CartesianGrid horizontal={false} stroke="#f1f5f9"/><XAxis type="number" tickFormatter={compact} tick={{fontSize:12,fill:'#94a3b8'}} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="name" width={95} tick={{fontSize:12,fill:'#64748b'}} axisLine={false} tickLine={false}/><Tooltip formatter={(value:number)=>[formatCurrency(value),t('revenueLayout.netRevenue')]} cursor={{fill:'#f8fafc'}}/><ReferenceLine x={0} stroke="#cbd5e1"/><Bar dataKey="revenue" radius={[0,4,4,0]} maxBarSize={30}>{chartRows.map(row=><Cell key={row.channel} fill={row.revenue<0?'#dc2626':'#10b981'}/>)}</Bar>
            </BarChart></ResponsiveContainer></div>
          </section>
          <section className="rounded-2xl bg-white border border-gray-200 overflow-hidden shadow-sm"><div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between"><h2 className="text-lg font-semibold">{t('revenueLayout.channelDetails')}</h2><span className="text-xs text-gray-400">{label}</span></div><div className="overflow-x-auto"><table className="w-full text-sm" data-testid="revenue-selected-table">
            <thead className="bg-gray-50 text-gray-500"><tr><th className="px-6 py-3 text-left font-medium">{t('finance.channel')}</th><th className="px-6 py-3 text-right font-medium">{t('revenueLayout.netRevenue')}</th><th className="px-6 py-3 text-right font-medium">{t('common.orders')}</th><th className="px-6 py-3 text-right font-medium">{t('finance.avgOrderValue')}</th></tr></thead>
            <tbody>{channels.map(row=>{const Icon=CHANNEL_ICONS[row.channel as keyof typeof CHANNEL_ICONS]||Store;return <tr key={row.channel} className="border-t border-gray-100 hover:bg-gray-50"><td className="px-6 py-4 font-medium text-gray-700"><Icon size={17} className="inline mr-2 text-gray-400"/>{CHANNEL_LABELS[row.channel]||row.channel}</td><td className="px-6 py-4 text-right font-semibold tabular-nums">{formatCurrency(row.revenue)}</td><td className="px-6 py-4 text-right tabular-nums">{row.orders}</td><td className="px-6 py-4 text-right tabular-nums">{formatCurrency(row.avgOrderValue)}</td></tr>})}</tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200 font-semibold"><tr><td className="px-6 py-4">{t('common.total')}</td><td className="px-6 py-4 text-right tabular-nums">{formatCurrency(summary.current.revenue)}</td><td className="px-6 py-4 text-right tabular-nums">{summary.current.orders}</td><td className="px-6 py-4 text-right tabular-nums">{formatCurrency(summary.current.avgOrderValue)}</td></tr></tfoot>
          </table></div></section>
        </>}
      </>}
    </section>
  </div>
}
