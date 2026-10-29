import { InventoryCountReviewHistory } from '../../../shared/components/InventoryCountReviewHistory'
import { InventoryCountProgress } from '../../../shared/components/InventoryCountProgress'
import { InventoryCountResults } from '../../../shared/components/InventoryCountResults'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LocalizedDateTimeInput } from '../../../shared/components/LocalizedDateTimeInput'
import { inventoryFlowApi, jakartaDate, materialName, Material } from '../services/inventoryFlow'
import { useAuthStore } from '../stores/auth'
import { formatQuantity } from '../utils/helpers'

type Kind = 'in' | 'out' | 'purchase' | 'count'
type Filter = { startDate:string; endDate:string; inventoryId:string; page:number }
type Line = { id:string; inventoryId:string; name:string; unit:string; quantity:number|null; reason:string|null; operator:{name:string}|null; note:string; systemQty:number|null; receivedQty:number|null }
type Record = { countDetails?:{reviewHistory:any[];items:any[]}; id:string; businessDate:string; createdAt:string; status:string|null; orderNumber:string|null; supplierName:string|null; operator:{name:string}|null; note:string; items:Line[] }
type Result = { list:Record[]; summary:{ inventoryId:string; name:string; unit:string; quantity:number|null; recordCount:number; recordedCount:number }[]; total:number; page:number; pageSize:number }
const today = ():Filter => ({startDate:jakartaDate(),endDate:jakartaDate(),inventoryId:'',page:1})
export function InventoryRecords({kind,items,refreshKey=0,onSupplement,selectedId=''}:{kind:Kind;items:Material[];refreshKey?:number;selectedId?:string;onSupplement?:(id:string,date:string)=>void}) {
  const {t,i18n}=useTranslation(),storeId=useAuthStore(s=>s.user?.storeId)
  const [draft,setDraft]=useState(today),[filter,setFilter]=useState(today),[data,setData]=useState<Result|null>(null),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[invalid,setInvalid]=useState(false),[retry,setRetry]=useState(0),[updatedAt,setUpdatedAt]=useState('')
  const sequence=useRef(0)
  useEffect(()=>{
    if(kind!=='in'&&kind!=='out')return
    const update=()=>{if(document.visibilityState==='visible')setRetry(v=>v+1)}
    const timer=window.setInterval(update,60000)
    window.addEventListener('focus',update)
    return ()=>{window.clearInterval(timer);window.removeEventListener('focus',update)}
  },[kind])
  useEffect(()=>{const id=++sequence.current;setLoading(true);setFailed(false);setData(null)
    inventoryFlowApi.records(kind,filter).then(r=>{if(id===sequence.current){setData(r.data);setUpdatedAt(new Date().toISOString())}}).catch(()=>{if(id===sequence.current)setFailed(true)}).finally(()=>{if(id===sequence.current)setLoading(false)})
    return ()=>{++sequence.current}
  },[kind,filter,refreshKey,retry,storeId])
  const quantity=(n:number|null,unit:string)=>n===null?t('inventoryRecords.pending'):`${formatQuantity(n,i18n.language)} ${unit}`
  const dateTime=(value:string)=>new Intl.DateTimeFormat(i18n.language,{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))
  const pages=Math.max(1,Math.ceil((data?.total||0)/20))
  const setPage=(page:number)=>setFilter(v=>({...v,page}))
  const supplement=(id:string,date:string)=>onSupplement?.(id,date)
  return <section data-testid={`inventory-records-${kind}`} className="border-t pt-5 space-y-4 min-w-0">
    <header className="flex flex-wrap justify-between items-center gap-2"><h2 className="font-bold text-lg">{t('inventoryRecords.'+kind)}</h2><button type="button" disabled={loading} onClick={()=>setRetry(v=>v+1)} className="text-primary-hover py-2">{t('inventoryFlow.refresh')}</button></header>
    <p className="text-sm text-gray-500">{t('inventoryRecords.scope')} · Asia/Jakarta</p>
    {kind==='count'&&<p className="text-sm text-gray-500">{t('inventoryRecords.countHint')}</p>}
    <form className="bg-white border rounded-xl p-3 space-y-3" onSubmit={e=>{e.preventDefault();if(!draft.startDate||!draft.endDate||draft.startDate>draft.endDate){setInvalid(true);return}setInvalid(false);setFilter({...draft,page:1})}}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{(['startDate','endDate'] as const).map((field,index)=><label key={field} className="text-sm min-w-0">{t(index?'inventoryRecords.end':'inventoryRecords.start')}<LocalizedDateTimeInput type="date" required className="border rounded-lg p-2 w-full mt-1 min-w-0" value={draft[field]} onChange={e=>setDraft(v=>({...v,[field]:e.target.value}))}/></label>)}</div>
      <label className="block text-sm">{t('inventoryFlow.material')}<select className="border rounded-lg p-2 w-full mt-1 min-w-0" value={draft.inventoryId} onChange={e=>setDraft(v=>({...v,inventoryId:e.target.value}))}><option value="">{t('inventoryRecords.material')}</option>{items.map(i=><option key={i.id} value={i.id}>{materialName(i.name,i18n.language)}</option>)}</select></label>
      <div className="flex flex-wrap gap-3"><button type="submit" className="bg-primary text-white rounded-lg px-4 py-2">{t('inventoryRecords.query')}</button><button type="button" onClick={()=>{const value=today();setDraft(value);setFilter(value);setInvalid(false)}} className="border rounded-lg px-4 py-2">{t('inventoryRecords.reset')}</button></div>
      {invalid&&<p role="alert" className="text-red-700 text-sm">{t('inventoryRecords.invalid')}</p>}
    </form>
    {loading&&<p role="status">{t('inventoryFlow.loading')}</p>}
    {failed&&<p role="alert" className="text-red-700">{t('inventoryFlow.failed')} <button type="button" className="underline py-2" onClick={()=>setRetry(v=>v+1)}>{t('inventoryFlow.retry')}</button></p>}
    {data&&<><p className="text-sm text-gray-600">{filter.startDate} — {filter.endDate} · {t('inventoryRecords.total',{count:data.total})}{updatedAt&&` · ${t('todayStockOut.updated')} ${dateTime(updatedAt)}`}</p>
      {!data.total?<p className="bg-white rounded-xl border p-4 text-gray-500">{t('inventoryActors.none')}</p>:<>
      {selectedId&&data.summary.some(group=>group.inventoryId===selectedId)&&<p role="status" className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3 text-sm">{t('inventoryRecords.selectedSummary',{material:materialName(data.summary.find(group=>group.inventoryId===selectedId)!.name,i18n.language),quantity:quantity(data.summary.find(group=>group.inventoryId===selectedId)!.quantity,data.summary.find(group=>group.inventoryId===selectedId)!.unit)})}</p>}
      <div className="space-y-2"><h3 className="font-semibold">{t('inventoryRecords.summary')}</h3>{data.summary.map(group=><article key={group.inventoryId} className={`bg-white border rounded-xl p-3 space-y-2 ${selectedId===group.inventoryId?'border-amber-400':''}`}><div className="flex flex-wrap justify-between gap-2"><span className="font-medium break-words">{materialName(group.name,i18n.language)}</span><strong>{quantity(group.quantity,group.unit)}</strong></div>{kind!=='count'&&<p className="text-xs text-gray-500">{t('inventoryRecords.entryCount',{count:group.recordCount})}</p>}{kind==='count'&&<p className="text-xs text-gray-500">{t('inventoryRecords.countProgress',{done:group.recordedCount,total:group.recordCount})}</p>}<details><summary className="cursor-pointer text-sm py-2">{t('inventoryRecords.pageDetails')}</summary><ul className="divide-y text-sm">{data.list.flatMap(row=>row.items.filter(line=>line.inventoryId===group.inventoryId).map(line=><li key={row.id+line.id} className="py-2 space-y-1 break-words"><p>{row.businessDate} · {quantity(line.quantity,line.unit)} · {line.operator?.name||t('inventoryRecords.missingActor')}</p><p className="text-xs text-gray-500">{t('inventoryRecords.entered')}: {dateTime(row.createdAt)}</p>{line.note&&<p>{line.note}</p>}</li>))}</ul><button type="button" className="text-primary-hover text-sm py-2" onClick={()=>{const next={...filter,inventoryId:group.inventoryId,page:1};setDraft(next);setFilter(next)}}>{t('inventoryRecords.materialDetails')}</button></details>{onSupplement&&<button type="button" disabled={!items.some(i=>i.id===group.inventoryId)} className="text-primary-hover text-sm py-2 disabled:opacity-40" onClick={()=>supplement(group.inventoryId,filter.startDate)}>{t('inventoryRecords.backfill')}</button>}</article>)}</div>
      <div className="space-y-3"><h3 className="font-semibold">{t('inventoryRecords.details')}</h3>{data.list.map(row=><article key={row.id} className="bg-white border rounded-xl p-3 space-y-2 break-words"><div className="flex flex-wrap justify-between gap-2"><strong>{row.orderNumber||row.businessDate}</strong>{row.status&&<span className="text-sm">{t('inventoryRecords.statuses.'+row.status,{defaultValue:row.status})}</span>}</div><p className="text-xs text-gray-500">{t('inventoryRecords.actual')}: {row.businessDate} · {t('inventoryRecords.entered')}: {dateTime(row.createdAt)}</p>{row.supplierName&&<p className="text-sm">{t('inventoryFlow.supplier')}: {row.supplierName}</p>}
      {row.countDetails&&<><InventoryCountReviewHistory history={row.countDetails.reviewHistory} status={row.status||''} language={i18n.language}/><InventoryCountProgress items={row.countDetails.items} language={i18n.language}/><details><summary className="cursor-pointer py-2 text-sm">{t('audit.countDetails')}</summary><InventoryCountResults items={row.countDetails.items} language={i18n.language} name={materialName} quantity={value=>formatQuantity(value,i18n.language)}/></details></>}
      <details open={kind==='in'||kind==='out'}><summary className="cursor-pointer py-2 text-sm">{t('inventoryRecords.details')} · {row.items.length}</summary><ul className="divide-y">{row.items.map(line=><li key={line.id} className="py-2 space-y-1 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{materialName(line.name,i18n.language)}</strong><span>{quantity(line.quantity,line.unit)}</span></div><p className="text-gray-500">{line.operator?.name||t('inventoryRecords.missingActor')}{line.reason&&` · ${t(line.reason==='receipt'?'inventoryRecords.receipt':line.reason==='process'?'inventoryProcessing.title':line.reason==='transfer'?'todayStockOut.transfer':'inventoryFlow.'+line.reason,{defaultValue:line.reason})}`}</p>{kind==='count'&&<p>{t('inventoryRecords.system')}: {quantity(line.systemQty,line.unit)}</p>}{kind==='purchase'&&<p>{t('inventoryRecords.received')}: {quantity(line.receivedQty,line.unit)}</p>}{line.note&&<p>{line.note}</p>}{onSupplement&&<button type="button" disabled={!items.some(i=>i.id===line.inventoryId)} className="text-primary-hover py-2 disabled:opacity-40" onClick={()=>supplement(line.inventoryId,row.businessDate)}>{t('inventoryRecords.backfill')}</button>}</li>)}</ul></details>
      </article>)}</div>
      <nav aria-label={t('inventoryRecords.details')} className="flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={data.page<=1} onClick={()=>setPage(data.page-1)} className="border rounded-lg px-3 py-2 disabled:opacity-40">{t('inventoryRecords.previous')}</button><span className="text-sm">{t('inventoryRecords.page',{page:data.page,pages})}</span><button type="button" disabled={data.page>=pages} onClick={()=>setPage(data.page+1)} className="border rounded-lg px-3 py-2 disabled:opacity-40">{t('inventoryRecords.next')}</button></nav>
      </>}
    </>}
  </section>
}
