import {PageHelp} from '../../components/PageHelp'
import {useEffect,useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {useTranslation} from 'react-i18next'
import {useSearchParams} from 'react-router-dom'
import {inventoryApi} from '../../services/api'
import {useAuthStore} from '../../stores/auth'
import {useStoreDateSettings} from '../../hooks/useStoreDateSettings'
import {storeCalendarDate} from '../../utils/storeDateTime'
import {LocalizedDateTimeInput} from '../../components/LocalizedDateTimeInput'
import {formatItemName} from '../../utils/helpers'
import {consumptionQuantity} from '../../utils/consumptionQuantity'
import {materialRecipeUsageCopy} from '../../utils/materialRecipeUsageCopy'
type Filters={inventoryId:string;startDate:string;endDate:string}
export function MaterialRecipeUsagePage(){
 const {i18n}=useTranslation(),l=materialRecipeUsageCopy(i18n.language),settings=useStoreDateSettings(),storeId=useAuthStore(s=>s.user?.storeId),[params,setParams]=useSearchParams()
 const today=storeCalendarDate(new Date(),settings.timezone),fromUrl=():Filters=>({inventoryId:params.get('inventoryId')||'',startDate:params.get('startDate')||today.slice(0,7)+'-01',endDate:params.get('endDate')||today})
 const [filters,setFilters]=useState<Filters>(fromUrl)
 useEffect(()=>setFilters(fromUrl()),[params,settings.timezone])
 const applied:Filters|null=params.get('inventoryId')&&params.get('startDate')&&params.get('endDate')?{inventoryId:params.get('inventoryId')!,startDate:params.get('startDate')!,endDate:params.get('endDate')!}:null
 const unchanged=!!applied&&Object.keys(filters).every(key=>filters[key as keyof Filters]===applied[key as keyof Filters])
 const list=useQuery({queryKey:['inventory-all-items',storeId],queryFn:()=>inventoryApi.list(),enabled:!!storeId})
 const materials=(list.data?.data?.data?.list||[]).filter((m:any)=>m.type!=='semi_finished'||!m.processRecipeId)
 const result=useQuery({queryKey:['material-recipe-usage',storeId,applied],queryFn:()=>inventoryApi.recipeUsage(applied!),enabled:!!storeId&&!!applied,retry:false})
 const data=unchanged&&!result.isError?result.data?.data?.data:undefined,qty=(n:unknown)=>consumptionQuantity(n,i18n.language,6)
 function preset(key:'today'|'month'|'lastMonth'){
  if(key==='today')setFilters({...filters,startDate:today,endDate:today})
  else if(key==='month')setFilters({...filters,startDate:today.slice(0,7)+'-01',endDate:today})
  else {const d=new Date(today.slice(0,7)+'-01T00:00:00Z'),end=new Date(d.getTime()-86400000).toISOString().slice(0,10);setFilters({...filters,startDate:end.slice(0,7)+'-01',endDate:end})}
 }
 return <section className="min-w-0 space-y-5" data-testid="material-recipe-usage"><header><h1 className="text-2xl font-bold">{l.title}</h1><PageHelp>{l.hint}</PageHelp></header>
  <form onSubmit={e=>{e.preventDefault();if(!filters.inventoryId)return;if(unchanged)void result.refetch();else setParams(filters)}} className="card space-y-4">
   <div className="flex flex-wrap gap-2" role="group" aria-label={l.period}>{(['today','month','lastMonth'] as const).map(key=><button type="button" key={key} className="btn btn-outline" onClick={()=>preset(key)}>{l[key]}</button>)}</div>
   <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(15rem,2fr)_1fr_1fr_auto] gap-3 items-end">
    <label className="block min-w-0 space-y-2"><span className="text-sm">{l.material}</span><select className="input w-full min-w-0" required value={filters.inventoryId} disabled={list.isPending||list.isError} onChange={e=>setFilters({...filters,inventoryId:e.target.value})}><option value="">{l.choose}</option>{materials.map((m:any)=><option key={m.id} value={m.id}>{formatItemName(m.name,i18n.language)} ({m.unit})</option>)}</select></label>
    <label className="block min-w-0 space-y-2"><span className="text-sm">{l.start}</span><LocalizedDateTimeInput aria-label={l.start} required className="input w-full min-w-0" type="date" max={filters.endDate||today} value={filters.startDate} onChange={e=>setFilters({...filters,startDate:e.target.value})}/></label>
    <label className="block min-w-0 space-y-2"><span className="text-sm">{l.end}</span><LocalizedDateTimeInput aria-label={l.end} required className="input w-full min-w-0" type="date" min={filters.startDate} max={today} value={filters.endDate} onChange={e=>setFilters({...filters,endDate:e.target.value})}/></label>
    <button className="btn btn-primary" disabled={!filters.inventoryId||!filters.startDate||!filters.endDate||result.isFetching||list.isError}>{result.isFetching?l.loading:l.query}</button>
   </div><p className="text-xs text-gray-500">{l.rangeHelp} · {settings.timezone}</p>
  </form>
  {list.isError&&<p role="alert" className="text-red-700">{l.failed} <button className="underline" onClick={()=>void list.refetch()}>{l.retry}</button></p>}
  {!applied&&<p className="text-gray-500">{l.selectHint}</p>}{applied&&!unchanged&&<p role="status" className="text-amber-800">{l.dirty}</p>}
  {unchanged&&result.isFetching&&<p role="status">{l.loading}</p>}{unchanged&&result.isError&&<p role="alert" className="text-red-700">{l.failed} <button className="underline" onClick={()=>void result.refetch()}>{l.retry}</button></p>}
  {data&&<div className="space-y-5" data-testid="recipe-usage-result"><div><h2 className="text-lg font-semibold">{formatItemName(data.material.name,i18n.language)}</h2><p className="text-sm text-gray-500">{data.startDate} — {data.endDate} · {data.timezone} · {l.asOf} {new Date(data.asOf).toLocaleString(i18n.language,{timeZone:data.timezone})}</p></div>
   <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div className="card border-primary bg-primary-light"><p className="text-sm text-gray-600">{data.estimate.complete?l.estimate:l.subtotal}</p><p className="mt-2 text-3xl font-bold break-words" data-testid="recipe-usage-total">{qty(data.estimate.quantity)} <span className="text-lg">{data.material.unit}</span></p><p className="mt-2 text-xs text-gray-600">{l.currentBasis}</p></div><div className="card"><p className="text-sm text-gray-500">{l.orders}</p><p className="text-2xl font-semibold mt-2">{data.orderCount}</p></div><div className="card"><p className="text-sm text-gray-500">{l.products}</p><p className="text-2xl font-semibold mt-2">{data.estimate.contributingProducts}</p></div></div>
   {!data.estimate.complete&&<p role="status" className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 p-4">{l.incomplete}{data.invalidRefundOrderCount>0&&` ${l.refundUnknown}: ${data.invalidRefundOrderCount}`}{data.invalidOrderCount>0&&` ${l.invalidOrders}: ${data.invalidOrderCount}`}</p>}
   <section className="card min-w-0"><h3 className="font-semibold mb-3">{l.breakdown}</h3><div className="overflow-x-auto"><table className="w-full text-sm block md:table"><thead className="hidden md:table-header-group"><tr className="text-left border-b"><th className="p-2 min-w-40">{l.product}</th><th className="p-2 text-right whitespace-nowrap">{l.sold}</th><th className="p-2 text-right whitespace-nowrap">{l.perUnit} ({data.material.unit})</th><th className="p-2 text-right whitespace-nowrap">{l.quantity} ({data.material.unit})</th></tr></thead><tbody className="block md:table-row-group">{data.estimate.breakdown.map((row:any)=><tr key={row.productId} className="border-b block py-2 md:py-0 md:table-row"><td className="p-2 block md:table-cell font-medium">{formatItemName(row.productName,i18n.language)}</td>{[[l.sold,row.soldQuantity],[l.perUnit+' ('+data.material.unit+')',qty(row.perUnit)],[l.quantity+' ('+data.material.unit+')',qty(row.quantity)]].map(([label,value],index)=><td key={index} className={'p-2 flex justify-between gap-3 md:table-cell md:text-right tabular-nums '+(index===2?'font-semibold':'')}><span className="md:hidden text-gray-500">{label}</span><span>{value}</span></td>)}</tr>)}</tbody></table></div>{!data.estimate.breakdown.length&&<p className="py-4 text-gray-500">{l.none}</p>}</section>
   {data.estimate.unresolved.length>0&&<details className="card border-amber-200"><summary className="font-medium cursor-pointer">{l.missing} · {data.estimate.unresolved.length}</summary><ul className="mt-3 space-y-2 text-sm">{data.estimate.unresolved.map((row:any)=><li key={row.productId} className="flex flex-wrap justify-between gap-2"><span>{formatItemName(row.productName,i18n.language)} · {row.soldQuantity}</span><span className="text-amber-800">{row.reason==='BOM_MISSING'?l.missingBom:l.invalidBom}</span></li>)}</ul></details>}
   <section className="card"><h3 className="font-semibold">{l.historical}</h3><p className="text-2xl font-bold mt-2">{qty(data.historical.quantity)} {data.material.unit}</p><PageHelp>{l.snapshotHint}</PageHelp>{!data.historical.complete&&<p className="text-amber-800 mt-2">{l.incompleteHistory}</p>}<dl className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 text-sm">{[['activeOrderCount','snapshotOrders'],['missingOrderCount','missingSnapshots'],['issueOrderCount','issueSnapshots'],['unexpandedOrderCount','unexpanded'],['partialRefundOrderCount','partial'],['unitMismatchOrderCount','unitMismatch'],['reversedOrderCount','reversed']].map(([key,label])=><div className="flex justify-between gap-3" key={key}><dt>{l[label as keyof typeof l]}</dt><dd>{data.historical[key]}</dd></div>)}</dl></section>
   <details className="text-sm text-gray-600"><summary className="cursor-pointer">{l.policy}</summary><p className="mt-2">{l.policyText}</p><p className="mt-2">{l.excluded}: {data.excludedOrderCount}</p></details>
  </div>}
 </section>
}
