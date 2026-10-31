import {inventoryReconciliationCopy} from '../../utils/inventoryReconciliationCopy'
import {Fragment,useEffect,useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {Link,useLocation} from 'react-router-dom'
import {useTranslation} from 'react-i18next'
import {inventoryApi} from '../../services/api'
import {LocalizedDateTimeInput} from '../../components/LocalizedDateTimeInput'
import {useStoreDateSettings} from '../../hooks/useStoreDateSettings'
import {useAuthStore} from '../../stores/auth'
import {useEmployeeNavigation} from '../../contexts/EmployeeAccess'
import {permissionForPage} from '../../../../shared/StaffAccess'
import {usageCoverage,type UsageRow,type UsageResult} from '../../../../shared/inventoryUsageReport'
import {formatStoreDate,storeCalendarDate} from '../../utils/storeDateTime'
import {formatItemName} from '../../utils/helpers'
import {formatExactCurrency} from '../../utils/moneyDisplay'
import {consumptionQuantity} from '../../utils/consumptionQuantity'
import {inventoryComparisonCopy} from '../../utils/inventoryComparisonCopy'
import {inventoryReportCopy} from '../../utils/inventoryReportCopy'
import {hasComparison,hasDifference,missingData,readReportState,reportSummary,selectReportRows,validReportDates,type ReportMode,type ReportState} from '../../utils/inventoryReport'

const save=(key:string,value:unknown)=>{try{sessionStorage.setItem(key,JSON.stringify(value))}catch{/* A blocked store must not prevent reporting. */}}
export function InventoryUsageReport({countsOnly=false}:{countsOnly?:boolean}) {
 const {pathname}=useLocation(),user=useAuthStore(s=>s.user)
 const identity=JSON.stringify([user?.id,user?.storeId,pathname])
 return <ReportSession key={identity} storageKey={'inventory-report:v2:'+identity} countsOnly={countsOnly}/>
}
function ReportSession({storageKey,countsOnly}:{storageKey:string;countsOnly:boolean}) {
 const {i18n}=useTranslation()
 const mode:ReportMode=countsOnly?'counts':'registered',rc=inventoryReconciliationCopy(i18n.language)
 const allowed=useEmployeeNavigation()
 return <section className="inventory-usage-report space-y-4">
  <header className="flex flex-wrap justify-between items-center gap-3"><h1 className="text-2xl font-bold">{countsOnly?rc.countTitle:rc.dailyTitle}</h1>{allowed(permissionForPage('/inventory/alerts'))&&<Link className="text-primary" to="/inventory/alerts">{i18n.t('operations.alerts')} →</Link>}</header>
  <p className="text-sm text-gray-600">{countsOnly?rc.countHint:rc.dailyHint}</p>
  <Link className="text-primary text-sm underline" to={countsOnly?'/inventory/consumption':'/inventory/physical-analysis'}>{countsOnly?rc.dailyTitle:rc.countTitle} →</Link>
  <ReportBody key={mode} mode={mode} storageKey={storageKey+':'+mode}/>
 </section>
}
function ReportBody({mode,storageKey}:{mode:ReportMode;storageKey:string}) {
 const {t,i18n}=useTranslation(),l=inventoryComparisonCopy(i18n.language),rc=inventoryReconciliationCopy(i18n.language),baseCopy=inventoryReportCopy(i18n.language),c=mode==='counts'?{...baseCopy,limits:rc.limits,formula:rc.formula,comparable:rc.comparable,missing:rc.missing,normal:rc.normal,noInterval:rc.noBaseline,latest:rc.latest}:baseCopy
 const dates=useStoreDateSettings(),today=storeCalendarDate(new Date(),dates.timezone),user=useAuthStore(s=>s.user)
 const [state,setState]=useState(()=>readReportState(storageKey,mode,today))
 const [draft,setDraft]=useState({startDate:state.startDate,endDate:state.endDate})
 const [dateError,setDateError]=useState(false)
 const change=(next:Partial<ReportState>)=>setState(old=>{const result={...old,...next};save(storageKey,result);return result})
 useEffect(()=>{setDraft({startDate:state.startDate,endDate:state.endDate})},[state.startDate,state.endDate])
 const params={startDate:state.period==='latest'?'2000-01-01':state.period==='today'?today:state.startDate,endDate:state.period==='custom'?state.endDate:today,...(mode==='counts'?{latest:state.period==='latest'}:{})}
 const query=useQuery({queryKey:['inventory-usage-report',user?.id,user?.storeId,mode,params,dates.timezone],queryFn:async():Promise<UsageResult>=>{
   const response=await (mode==='counts'?inventoryApi.countReconciliation(params):inventoryApi.employeeConsumption(params));return response.data.data
 },enabled:!!user&&validReportDates(params.startDate,params.endDate),refetchInterval:60000})
 const all=query.data?.list||[],summary=reportSummary(all),name=(r:UsageRow)=>formatItemName(r.inventoryName,i18n.language)
 const rows=selectReportRows(all,state,name),coverage=mode==='counts'?query.data?.coverage||usageCoverage(all):null
 const qty=(v:unknown)=>consumptionQuantity(v,i18n.language,mode==='counts'?6:3)
 const instant=(v?:string|null)=>v?formatStoreDate(v,dates,true):'—'
 const period=(r:UsageRow)=>mode==='counts'&&r.observationCount===0?c.noInterval:`${instant(r.windowStart)} — ${instant(r.windowEnd)}`
 const actionFor=(reason:string)=>['TWO_PHYSICAL_OBSERVATIONS_REQUIRED','COMPLETED_BASELINE_REQUIRED','NEXT_PHYSICAL_OBSERVATION_REQUIRED','UNCERTIFIED_OBSERVATION_BOUNDARY'].includes(reason)?{path:'/inventory/count',label:c.countAction}:reason==='INCOMPLETE_RECIPE'?{path:'/products/recipes',label:c.recipeAction}:reason==='ZERO_THEORETICAL_BASELINE'?{path:'/inventory/recipe-usage',label:c.recipeAction}:{path:'/inventory/logs',label:c.logAction}
 const allowed=useEmployeeNavigation()
 const reasonText=(reason?:string|null)=>reason==='COMPLETED_BASELINE_REQUIRED'?rc.baselineHint:reason==='NEXT_PHYSICAL_OBSERVATION_REQUIRED'?rc.nextHint:reason==='TWO_PHYSICAL_OBSERVATIONS_REQUIRED'?c.countReason:reason==='UNCERTIFIED_OBSERVATION_BOUNDARY'?c.boundaryReason:reason==='INCOMPLETE_RECIPE'?c.recipeReason:reason==='UNCLASSIFIED_MOVEMENTS'||reason==='NEGATIVE_INFERRED_DEPLETION'||reason==='AMBIGUOUS_OBSERVATION_BOUNDARY'?c.movementReason:reason==='ZERO_THEORETICAL_BASELINE'?c.zeroReason:reason&&['BULK_ISSUE','SELF_PRODUCED','BATCH_WITHDRAWAL'].includes(reason)?t('inventoryFlow.'+reason):c.unknownReason
 const repair=(reason:string)=>{const action=actionFor(reason);return allowed(permissionForPage(action.path))?<Link className="text-primary underline" to={action.path}>{action.label}</Link>:<span>{c.noAccess}</span>}
 const reasons=new Map<string,number>()
 for(const row of all)if(missingData(row))reasons.set(row.unavailableReason||'UNKNOWN',(reasons.get(row.unavailableReason||'UNKNOWN')||0)+1)
 const clear=()=>change({search:'',filter:'all',sort:'name'})
 return <>
  <form className="inventory-report-range" onSubmit={e=>{e.preventDefault();if(!validReportDates(draft.startDate,draft.endDate)){setDateError(true);return}setDateError(false);change({...draft,period:'custom'})}}>
   <label>{c.time}<select aria-label={c.time} className="input" value={state.period} onChange={e=>{setDateError(false);change({period:e.target.value as ReportState['period']})}}><option value={mode==='counts'?'latest':'today'}>{mode==='counts'?c.latest:c.today}</option><option value="custom">{c.custom}</option></select></label>
   {state.period==='custom'&&<><label>{c.start}<LocalizedDateTimeInput className="input" aria-label={c.start} type="date" value={draft.startDate} onChange={e=>setDraft({...draft,startDate:e.target.value})}/></label><label>{c.end}<LocalizedDateTimeInput className="input" aria-label={c.end} type="date" value={draft.endDate} onChange={e=>setDraft({...draft,endDate:e.target.value})}/></label><button type="submit" className="btn-primary">{c.apply}</button></>}
   <button type="button" className="btn-secondary" disabled={query.isFetching} onClick={()=>void query.refetch()}>{query.isFetching?c.refreshing:c.refresh}</button>
  </form>
  {dateError&&<p role="alert" className="text-red-700">{c.invalid}</p>}
  <div className="inventory-report-context text-sm text-gray-600"><p>{c.query}：{state.period==='latest'?c.latest:`${formatStoreDate(params.startDate,dates)} — ${formatStoreDate(params.endDate,dates)}`} · {dates.timezone}</p>
   {mode==='counts'?<p>{c.coverage}：{coverage?.start?`${instant(coverage.start)} — ${instant(coverage.end)}`:all.some(r=>(r.observationCount||0)>0)?rc.nextHint:c.noInterval}</p>:query.data?.segments?.filter(s=>s.basis!=='legacy').map(s=><p key={s.start}>{c.coverage}：{instant(s.start)} — {instant(s.end)}</p>)}
   {coverage?.mixed&&<p className="text-amber-800">{c.mixed}</p>}
   <p>{c.updated}：{query.dataUpdatedAt?instant(new Date(query.dataUpdatedAt).toISOString()):'—'} · {c.auto}{query.isFetching?' · '+c.refreshing:''}</p>
  </div>
  <aside className="inventory-report-basis"><p>{c.limits}</p><details><summary>{c.basis}</summary><p>{c.formula}</p><p>{c.valuation}</p>{allowed(permissionForPage('/inventory/alert-config'))&&<Link className="text-primary underline" to="/inventory/alert-config">{t('varianceFlow.settings')}</Link>}</details></aside>
  {query.isError&&<p role="alert" className="inventory-report-error">{query.data?c.failed:c.initialFailed} <button type="button" className="text-primary underline" disabled={query.isFetching} onClick={()=>void query.refetch()}>{c.refresh}</button></p>}
  {query.isPending&&<p role="status">{t('common.loading')}</p>}
  {query.data&&<>
   <div className="inventory-report-summary">{(['comparable','missing','difference'] as const).map(key=><div key={key}><span>{c[key]}</span><strong>{summary[key]}</strong></div>)}</div>
   {(query.data.legacyOnly||query.data.segments?.some(s=>s.basis==='legacy'))&&<p className="text-amber-800">{c.partial}</p>}
   {mode==='registered'&&query.data.hasBusinessActivity===false&&!query.data.legacyOnly&&<p role="status" className="text-sm text-gray-600">{c.noActivity}</p>}
   {all.some(r=>r.provisional)&&<p className="text-sm text-gray-600">{c.provisional}</p>}
   {reasons.size>0&&<aside className="inventory-report-guidance"><h2 className="font-semibold">{c.guidance}</h2><ul>{Array.from(reasons,([reason,count])=><li key={reason}><span>{reasonText(reason)} ({count})</span>{repair(reason)}</li>)}</ul></aside>}
  </>}
  <div className="inventory-report-tools"><label className="inventory-report-search">{l.search}<input type="search" className="input" value={state.search} placeholder={l.search} onChange={e=>change({search:e.target.value})}/></label><label>{c.filter}<select aria-label={c.filter} className="input" value={state.filter} onChange={e=>change({filter:e.target.value as ReportState['filter']})}>{(['all','comparable','missing','difference'] as const).map(key=><option key={key} value={key}>{c[key]}</option>)}</select></label><label>{c.sort}<select aria-label={c.sort} className="input" value={state.sort} onChange={e=>change({sort:e.target.value as ReportState['sort']})}><option value="name">{c.name}</option><option value="quantity">{c.quantity}</option><option value="amount">{c.amount}</option></select></label>{(state.search||state.filter!=='all'||state.sort!=='name')&&<button type="button" className="btn-secondary" onClick={clear}>{c.clear}</button>}</div>
  {state.sort==='quantity'&&<p className="text-sm text-amber-800">{c.unitWarning}</p>}
  <p className="inventory-report-scroll-hint text-xs text-gray-500">{c.scroll}</p>
  <div className="admin-table-scroll inventory-report-scroll border rounded-xl bg-white" role="region" aria-label={l.title} tabIndex={0}>
   <table className={`inventory-report-table w-full text-sm ${mode==='counts'?'inventory-reconciliation-table':''}`}><thead><tr><th>{l.material}</th><th>{l.unit}</th>{mode==='counts'?<><th>{rc.opening}</th><th>{rc.incoming}</th><th>{rc.outgoing}</th><th>{rc.expected}</th><th>{rc.closing}</th><th>{rc.difference}</th></>:<><th>{l.actualOut}</th><th>{l.theory}</th><th>{l.difference}</th></>}<th>{l.percent}</th><th>{c.value}</th><th className="inventory-report-state">{l.state}</th></tr></thead>
   <tbody>{rows.map(r=><Fragment key={r.inventoryId}><tr><td><button type="button" className="inventory-report-material" aria-expanded={state.expanded===r.inventoryId} onClick={()=>change({expanded:state.expanded===r.inventoryId?null:r.inventoryId})}><strong>{name(r)}</strong><span className="text-primary text-xs">{state.expanded===r.inventoryId?c.hide:c.details} {state.expanded===r.inventoryId?'▾':'▸'}</span></button><p className="inventory-report-row-period">{period(r)}</p></td><td title={r.unit}>{c.unit(r.unit)}</td>{mode==='counts'?<><td>{qty(r.openingPhysical)}</td><td>{qty(r.receipts)}</td><td>{qty(r.actualOut)}</td><td className="font-semibold">{qty(r.expectedClosing)}</td><td>{qty(r.closingPhysical)}</td><td>{qty(r.variance)}</td></>:<><td>{qty(r.actualWithdrawal??r.actualConsumption)}</td><td>{qty(r.theoreticalConsumption)}</td><td>{qty(r.variance)}</td></>}<td>{r.variancePercent==null||r.theoreticalConsumption===0?'—':qty(r.variancePercent)+'%'}</td><td>{r.varianceAmountEstimate==null?'—':formatExactCurrency(r.varianceAmountEstimate)}</td><td className="inventory-report-state"><span className={missingData(r)?'text-amber-800':hasDifference(r)?'text-primary':'text-gray-600'}>{r.varianceStatus==='awaiting_count'?rc.awaiting:missingData(r)?c.missing:['critical','warning'].includes(r.varianceStatus)?t('varianceFlow.'+r.varianceStatus):hasDifference(r)?c.reference:hasComparison(r)?c.normal:l.reference}</span>{(r.unavailableReason||missingData(r))&&<p>{reasonText(r.unavailableReason)}</p>}{missingData(r)&&repair(r.unavailableReason||'UNKNOWN')}</td></tr>
    {state.expanded===r.inventoryId&&<tr className="inventory-detail-row"><td colSpan={mode==='counts'?11:8}><div className="inventory-expanded-data"><p>{c.interval}：{period(r)}</p>{r.closingStatus==='pending_review'&&<p className="text-amber-800">{rc.pending}</p>}{mode==='counts'?<>
     <p>{rc.before}：{r.completedObservationCount??r.observationCount??'—'} · {c.usable}：{r.usableObservationCount??'—'} · {c.lastCount}：{instant(r.latestObservationAt)}</p>
     <dl className="inventory-movement-grid">{([['openingPhysical',rc.opening],['receipts',rc.incoming],['actualOut',rc.outgoing],['expectedClosing',rc.expected],['closingPhysical',rc.closing]] as const).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{qty(r[key])} {c.unit(r.unit)}</dd></div>)}</dl>
    </>:<><section><h3>{l.recorded}</h3><dl className="inventory-movement-grid">{['withdrawal','process','loss','expired','other','transfer'].map(key=><div key={key}><dt>{t('inventoryFlow.'+key)}</dt><dd>{qty(r.breakdown?.[key])} {c.unit(r.unit)}</dd></div>)}</dl></section>
    {!!r.production?.length&&<section><h3>{l.production}</h3><div className="admin-table-scroll"><table className="inventory-production-table"><thead><tr>{[l.output,l.unit,l.capacity,l.registered,l.difference].map((v,j)=><th key={j}>{v}</th>)}</tr></thead><tbody>{r.production.map(p=><tr key={p.recipeId}><td>{formatItemName(p.name,i18n.language)}</td><td>{c.unit(p.unit)}</td><td>{qty(p.theoreticalOutput)}</td><td>{qty(p.registeredOutput)}</td><td>{qty(p.difference)}</td></tr>)}</tbody></table></div>{r.production.map(p=>!!p.products?.length&&<div key={p.recipeId}><h4>{l.productCapacity}</h4><dl className="inventory-movement-grid">{p.products.map(product=><div key={product.productId}><dt>{formatItemName(product.name,i18n.language)}</dt><dd>{qty(product.theoreticalQuantity)}</dd></div>)}</dl></div>)}</section>}</>}
    {r.unavailableReason&&<p className="text-amber-800">{reasonText(r.unavailableReason)}</p>}</div></td></tr>}
   </Fragment>)}</tbody></table>
   {query.data&&!rows.length&&<div className="p-4 text-gray-600"><p>{all.length?c.noMatch:query.data.legacyOnly?c.partial:c.empty}</p>{all.length>0&&<button type="button" className="text-primary underline" onClick={clear}>{c.clear}</button>}</div>}
  </div>
 </>
}
