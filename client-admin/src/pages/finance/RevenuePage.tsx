import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { revenueApi, configApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { formatCurrency } from '../../utils/helpers'
import { finiteNumber, requireRead, validInstant } from '../../utils/dashboardNavigation'
import { DashboardReadFailure } from '../../components/DashboardReadState'
import { TrendingUp, TrendingDown, ShoppingBag, Bike, Store, Utensils, CreditCard, Calendar } from 'lucide-react'

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
  const {t}=useTranslation()
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
      const pref=configs.find((row:{key:string;value:string})=>row.key==='revenue.defaultPeriod')
      if (active && version===manualSelection.current && pref && periods.includes(pref.value)) setPeriod(pref.value)
    }).catch(()=>{})
    return ()=>{active=false}
  },[storeId,canRead])

  const handlePeriodChange = async (value:Period) => {
    manualSelection.current+=1
    const version=manualSelection.current
    setPeriod(value)
    setPreferenceError(false)
    if (!storeId) return
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
  const overview=useQuery({
    queryKey:['revenue-fixed-overview',storeId,user?.role],
    enabled:!!storeId && canRead,
    queryFn:async()=>Promise.all((['today','week','month'] as const).map(async fixed=>{
      const response=await revenueApi.byChannel({storeId,period:fixed})
      return {period:fixed,revenue:readChannels(response.data?.data).reduce((sum,row)=>sum+row.revenue,0)}
    })),
  })
  const label=period==='custom'?`${customDateRange.start} — ${customDateRange.end}`:t(`finance.${period==='today'?'today':period==='week'?'thisWeek':'thisMonth'}`)
  const summary=selected.data?.summary
  const channels=selected.data?.channels||[]
  const change=(value:number)=>value===0?<span>-</span>:<span className={`inline-flex items-center gap-1 ${value>0?'text-green-600':'text-red-600'}`}>{value>0?<TrendingUp size={12}/>:<TrendingDown size={12}/>} {value>0?'+':''}{value}%</span>

  if (!storeId) return <DashboardReadFailure scope />
  if (!canRead) return <p role="alert" data-testid="revenue-role-denied">{t('revenueRange.permissionDenied')}</p>
  return <div className="min-h-screen bg-gray-50">
    <div className="bg-white border-b border-gray-200 px-4 py-3 flex flex-wrap gap-2 items-center">
      {periods.map(value=><button key={value} onClick={()=>handlePeriodChange(value)} className={`px-4 py-2 rounded-lg text-sm ${period===value?'bg-primary text-white':'bg-gray-100 text-gray-700'}`}>
        {value==='custom'&&<Calendar size={14} className="inline mr-1"/>}{t(value==='custom'?'common.custom':`finance.${value==='today'?'today':value==='week'?'thisWeek':'thisMonth'}`)}
      </button>)}
      {period==='custom'&&<div className="flex items-center gap-2">
        <input aria-label={t('revenueRange.startDate')} type="date" value={customDateRange.start} onChange={e=>setCustomDateRange(prev=>({...prev,start:e.target.value}))} className="input"/>
        <span>—</span>
        <input aria-label={t('revenueRange.endDate')} type="date" value={customDateRange.end} onChange={e=>setCustomDateRange(prev=>({...prev,end:e.target.value}))} className="input"/>
      </div>}
      {preferenceError&&<p role="status" className="text-red-600">{t('revenueRange.preferenceFailed')}</p>}
    </div>
    <section className="p-4" data-testid="revenue-fixed-overview">
      <h2 className="font-semibold mb-2">{t('revenueRange.fixedOverview')}</h2>
      {overview.isError?<DashboardReadFailure retry={()=>overview.refetch()} />:overview.isPending?<p>{t('common.loading')}</p>:<div className="grid grid-cols-3 gap-4">
        {overview.data?.map(row=><div key={row.period} className="card"><p>{t(`finance.${row.period==='today'?'todayRevenue':row.period==='week'?'weekRevenue':'monthRevenue'}`)}</p><p className="font-bold">{formatCurrency(row.revenue)}</p></div>)}
      </div>}
    </section>
    <section className="p-4" data-testid="revenue-selected-range">
      <h2 className="font-semibold mb-2">{t('revenueRange.selectedRange')} · {label} · {t('revenueRange.businessTime')}</h2>
      {!validSelection?<p role="alert" data-testid="revenue-range-invalid">{t('revenueRange.invalidRange')}</p>:selected.isError?<DashboardReadFailure retry={()=>selected.refetch()} />:selected.isPending?<p>{t('common.loading')}</p>:summary&&<>
        {summary.comparisonRange?.adjusted&&<p role="status" data-testid="revenue-comparison-adjusted" className="text-sm mb-3">
          {t('revenueRange.comparisonAdjusted')} {t('revenueRange.comparisonRange')}: {new Date(Date.parse(summary.comparisonRange.startDate)+7*3600000).toISOString().replace('T',' ').replace('Z','')} — {new Date(Date.parse(summary.comparisonRange.endDate)+7*3600000).toISOString().replace('T',' ').replace('Z','')} · {t('revenueRange.businessTime')}
        </p>}
        <div className="grid grid-cols-3 gap-4 mb-4" data-testid="revenue-selected-summary">
          <div className="card"><p>{t('revenueRange.selectedRevenue')}</p><p className="font-bold">{formatCurrency(summary.current.revenue)}</p><p>{t('finance.change')}: {change(summary.revenueChange)}</p></div>
          <div className="card"><p>{t('common.orders')}</p><p>{summary.current.orders}</p></div>
          <div className="card"><p>{t('finance.avgOrderValue')}</p><p>{formatCurrency(summary.current.avgOrderValue)}</p></div>
        </div>
        {channels.length===0?<p>{t('common.noData')}</p>:<div className="bg-white rounded-xl overflow-x-auto"><table className="w-full" data-testid="revenue-selected-table">
          <thead className="bg-gray-50"><tr><th className="p-3 text-left">{t('finance.channel')}</th><th>{t('revenueRange.selectedRevenue')}</th><th>{t('common.orders')}</th><th>{t('finance.avgOrderValue')}</th></tr></thead>
          <tbody>{channels.map(row=>{const Icon=CHANNEL_ICONS[row.channel as keyof typeof CHANNEL_ICONS]||Store;return <tr key={row.channel} className="border-t"><td className="p-3"><Icon size={18} className="inline mr-2"/>{CHANNEL_LABELS[row.channel]||row.channel}</td><td className="text-center">{formatCurrency(row.revenue)}</td><td className="text-center">{row.orders}</td><td className="text-center">{formatCurrency(row.avgOrderValue)}</td></tr>})}</tbody>
          <tfoot className="bg-gray-50"><tr><td className="p-3 font-bold">{t('common.total')}</td><td className="text-center">{formatCurrency(summary.current.revenue)}</td><td className="text-center">{summary.current.orders}</td><td className="text-center">{formatCurrency(summary.current.avgOrderValue)}</td></tr></tfoot>
        </table></div>}
      </>}
    </section>
  </div>
}
