import { useEffect, useRef, useState } from 'react'
import { inventoryCountLabels } from '../inventoryCountLabels'
import { countProgress, isCounted, matchesCountFilter, CountItemFilter } from '../inventoryCountProgress'
import { InventoryCountProgress } from './InventoryCountProgress'

type Material = { id: string; name: string; unit: string; currentStock: number; updatedAt: string; packaging?: {unit:string;quantity:number;baseUnit:string}|null }
export type CountEditorItem = {id:string; countedQty?:number|null; countedAt?:string|null; systemQty:number; note?:string|null; countedByActor?:{name:string;employeeNumber?:string}|null; inventory?:Material}
export type CountDraftObservation = {itemId:string;countedQty:number;note:string;expectedStock:number;observedVersion:string}
type Draft = {quantity:string;unit:string;note:string;expectedStock:number;observedVersion:string}
type Props = {
 hideProgress?:boolean; formatQuantity?:(value:number)=>string; items:CountEditorItem[]; language:string; name:(name:string,language:string)=>string;
 units:(material:Material)=>string[]; factor:(material:Material,unit:string)=>number; ledger:(qty:number,material:Material,unit:string)=>number;
 onSubmit?:(items:CountDraftObservation[])=>Promise<unknown>; onSave:(items:CountDraftObservation[])=>Promise<unknown>; onReload:()=>Promise<CountEditorItem[]>; onDirtyChange:(dirty:boolean)=>void
}
export function InventoryCountEditor({hideProgress=false,formatQuantity,items,language,name,units,factor,ledger,onSubmit,onSave,onReload,onDirtyChange}:Props){
 const l=inventoryCountLabels(language), [drafts,setDrafts]=useState<Record<string,Draft>>({}),[dirty,setDirty]=useState<Record<string,boolean>>({}),[search,setSearch]=useState(''),[filter,setFilter]=useState<CountItemFilter>(()=>items.some(i=>!isCounted(i))?'pending':'all'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),lock=useRef(false),root=useRef<HTMLElement>(null),lastFocused=useRef(''),[focusItem,setFocusItem]=useState(''),[reviewSubmit,setReviewSubmit]=useState(false)
 const fresh=(item:CountEditorItem):Draft=>{const m=item.inventory!;const unit=units(m)[0];return {quantity:item.countedQty==null?'':String(item.countedQty/factor(m,unit)),unit,note:item.note||'',expectedStock:m.currentStock,observedVersion:m.updatedAt}}
 useEffect(()=>{setDrafts(previous=>Object.fromEntries(items.filter(i=>i.inventory).map(i=>[i.id,dirty[i.id]&&previous[i.id]?previous[i.id]:fresh(i)])))},[items,dirty])
 const dirtyCount=Object.values(dirty).filter(Boolean).length
 useEffect(()=>{onDirtyChange(dirtyCount>0)},[dirtyCount,onDirtyChange])
 useEffect(()=>{if(!dirtyCount)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirtyCount])
 const edit=(id:string,patch:Partial<Draft>)=>{setDrafts(previous=>({...previous,[id]:{...previous[id],...patch}}));setDirty(previous=>({...previous,[id]:true}));setSaved(false)}
 async function save(confirmed=false){
  if(lock.current)return
  const changes:CountDraftObservation[]=[]
  for(const item of items){if(!dirty[item.id]||!item.inventory)continue;const d=drafts[item.id];if(!d)continue
   // Untouched/blank rows never become a zero observation.
   if(d.quantity.trim()===''){if(isCounted(item)){setError(l.invalid);return}continue}
   const quantity=Number(d.quantity),qty=ledger(quantity,item.inventory,d.unit)
   if(!Number.isFinite(quantity)||!Number.isFinite(qty)||qty<0){setError(l.invalid);return}
   changes.push({itemId:item.id,countedQty:qty,note:d.note,expectedStock:d.expectedStock,observedVersion:d.observedVersion})
  }
  if(!changes.length&&!onSubmit){setError(l.invalid);return}
  if(onSubmit&&!changes.length&&!items.some(isCounted)){setError(l.noEntries);return}
  if(onSubmit&&!confirmed){setReviewSubmit(true);setError('');return}
  lock.current=true;setBusy(true);setError('');setSaved(false);setReviewSubmit(false)
  try{if(onSubmit)await onSubmit(changes);else await onSave(changes);setDirty({});setSaved(true)}catch(e:any){setError(e?.response?.data?.message==='COUNT_REFRESH_REQUIRED'?l.conflict:onSubmit?l.submitFailed:l.failed)}finally{lock.current=false;setBusy(false)}
 }
 async function refresh(){if(lock.current)return;lock.current=true;setBusy(true);try{const rows=await onReload();setDrafts(previous=>Object.fromEntries(rows.filter(i=>i.inventory).map(i=>[i.id,dirty[i.id]&&previous[i.id]?{...previous[i.id],expectedStock:i.inventory!.currentStock,observedVersion:i.inventory!.updatedAt}:fresh(i)])));setError('')}catch{setError(l.retryFailed)}finally{lock.current=false;setBusy(false)}}
 const visible=items.filter(item=>item.inventory&&drafts[item.id]&&name(item.inventory.name,language).toLocaleLowerCase().includes(search.toLocaleLowerCase().trim())&&matchesCountFilter(item,filter))
 const progress=l.progress.replace('{saved}',String(items.filter(isCounted).length)).replace('{total}',String(items.length)).replace('{dirty}',String(dirtyCount))
 const totals=countProgress(items)
 const submitPending=items.filter(i=>{const d=drafts[i.id];return !d||d.quantity.trim()===''})
 function nextPending(){const pending=items.filter(i=>!isCounted(i)&&i.inventory);if(!pending.length)return;const index=pending.findIndex(i=>i.id===lastFocused.current);const next=pending[(index+1)%pending.length];setSearch('');setFilter('pending');setFocusItem(next.id)}
 useEffect(()=>{if(!focusItem)return;const field=root.current?.querySelector<HTMLInputElement>(`[data-count-item="${CSS.escape(focusItem)}"] input[type="number"]`);if(field){field.focus();field.scrollIntoView({block:'center',behavior:'smooth'});setFocusItem('')}},[focusItem,filter,search])
 return <section ref={root} id="count-batch-editor" className="space-y-3" data-testid="count-batch-editor" onFocusCapture={e=>{const item=(e.target as HTMLElement).closest<HTMLElement>('[data-count-item]');if(item)lastFocused.current=item.dataset.countItem||''}}>
  {!hideProgress&&<InventoryCountProgress items={items} language={language}/>}
  <p className="text-sm text-gray-600">{onSubmit?l.staffHint:l.hint}</p>
  <div className="flex flex-wrap gap-2"><input aria-label={l.search} placeholder={l.search} className="border rounded-lg p-3 min-w-0 flex-1 bg-white" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="flex flex-wrap gap-2" role="group" aria-label={l.batchProgress}>{(['all','pending','counted','difference'] as const).map(key=><button type="button" key={key} disabled={busy} aria-pressed={filter===key} onClick={()=>setFilter(key)} className={`rounded-lg border px-3 py-2 text-sm ${filter===key?'bg-primary-light border-primary text-primary-hover':'bg-white border-gray-200 text-gray-600'}`}>{l[key]} <span className="tabular-nums">{key==='all'?totals.total:totals[key]}</span></button>)}</div>
  <p className="text-sm text-gray-600" role="status">{onSubmit?l.submitSummary.replace('{count}',String(items.filter(i=>drafts[i.id]?.quantity.trim()!==''&&drafts[i.id]?.quantity!=null).length)).replace('{pending}',String(items.filter(i=>!drafts[i.id]||drafts[i.id].quantity.trim()==='').length)):progress}</p>
  <fieldset disabled={busy} className="space-y-2 min-w-0">
  {!visible.length&&<p>{l.empty}</p>}
  {visible.map(item=>{const m=item.inventory!,d=drafts[item.id],theory=dirty[item.id]?d.expectedStock:item.countedAt?item.systemQty:m.currentStock,qty=d.quantity.trim()===''?null:ledger(Number(d.quantity),m,d.unit),delta=qty===null?null:Math.round((qty-theory)*1e9)/1e9;return <div key={item.id} className="border rounded-xl bg-white p-3 space-y-2" data-count-item={item.id}>
   <div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium break-words min-w-0">{name(m.name,language)}</h3><span className={`text-xs rounded-full px-2 py-1 ${isCounted(item)?'bg-green-50 text-green-700':'bg-amber-50 text-amber-800'}`}>{isCounted(item)?`✓ ${l.counted}`:l.pending}{dirty[item.id]?` · ${l.unsaved}`:''}</span></div>
   {isCounted(item)&&<p className="text-xs text-gray-500">{l.counter}: {item.countedByActor?.name||l.unknownCounter}{item.countedByActor?.employeeNumber?` (${item.countedByActor.employeeNumber})`:''}{item.countedAt?` · ${new Date(item.countedAt).toLocaleString(language)}`:''}</p>}
   <div className="grid grid-cols-2 gap-2 text-sm text-gray-600"><span>{l.theory}: {(formatQuantity ? formatQuantity(theory) : theory.toLocaleString(language,{maximumFractionDigits:9}))} {m.unit}</span><span className={delta?'text-orange-700 font-medium':''}>{l.delta}: {delta===null||!Number.isFinite(delta)?'—':`${delta>0?'+':''}${(formatQuantity ? formatQuantity(delta) : delta.toLocaleString(language,{maximumFractionDigits:9}))} ${m.unit}`}</span></div>
   <div className="grid grid-cols-[minmax(0,1fr)_minmax(80px,0.5fr)] gap-2"><label className="text-sm min-w-0">{l.actual}<input aria-label={`${l.actual} · ${name(m.name,language)}`} type="number" inputMode="decimal" min="0" step="any" className="border rounded-lg p-3 w-full mt-1 bg-white" value={d.quantity} placeholder="—" onChange={e=>edit(item.id,{quantity:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();const fields=Array.from(e.currentTarget.closest('fieldset')!.querySelectorAll<HTMLInputElement>('input[type="number"]'));fields[fields.indexOf(e.currentTarget)+1]?.focus()}}}/></label><label className="text-sm min-w-0">{l.unit}<select aria-label={`${l.unit} · ${name(m.name,language)}`} className="border rounded-lg p-3 w-full mt-1 bg-white" value={d.unit} onChange={e=>edit(item.id,{unit:e.target.value,...(d.quantity.trim()!==''&&Number.isFinite(Number(d.quantity))?{quantity:String(ledger(Number(d.quantity),m,d.unit)/factor(m,e.target.value))}:{})})}>{units(m).map(unit=><option key={unit}>{unit}</option>)}</select></label></div>
   <details open={d.note?true:undefined}><summary className="text-sm text-gray-500 cursor-pointer">{l.note}</summary><input aria-label={`${l.note} · ${name(m.name,language)}`} className="border rounded-lg p-3 w-full mt-2" value={d.note} onChange={e=>edit(item.id,{note:e.target.value})}/></details>
  </div>})}
  </fieldset>
  <div className="sticky bottom-20 z-10 border rounded-xl bg-white p-3 shadow-sm space-y-2">
   {onSubmit?<p className="text-sm text-gray-600">{l.submitSummary.replace('{count}',String(items.filter(i=>drafts[i.id]?.quantity.trim()!==''&&drafts[i.id]?.quantity!=null).length)).replace('{pending}',String(items.filter(i=>!drafts[i.id]||drafts[i.id].quantity.trim()==='').length))}</p>:dirtyCount>0&&<p className="text-sm text-amber-800">{l.dirty}</p>}{saved&&<p role="status" className="text-sm text-green-700">{l.saved}</p>}
   {error&&<div role="alert" className="text-sm text-red-700"><p>{error}</p><button type="button" disabled={busy} className="underline py-2" onClick={refresh}>{l.reload}</button></div>}
   <p className="text-sm text-gray-600">{l.counted} {totals.counted}/{totals.total} · {l.pending} {totals.pending} · {l.unsaved} {dirtyCount}</p>
   {reviewSubmit&&<section className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2" aria-label={l.reviewSubmit}><h3 className="font-semibold">{l.reviewSubmit}</h3><p className="text-sm">{l.partialHint}</p><p className="text-sm">{l.pending}: {submitPending.length}</p><ul className="max-h-40 overflow-auto text-sm list-disc pl-5">{submitPending.map(i=><li key={i.id}>{name(i.inventory?.name||'',language)}</li>)}</ul><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>{setReviewSubmit(false);nextPending()}} className="border rounded-lg px-3 py-2">{l.continueCount}</button><button type="button" disabled={busy} onClick={()=>void save(true)} className="bg-primary text-white rounded-lg px-3 py-2">{l.confirmPartial}</button></div></section>}
   <div className="flex flex-wrap gap-2"><button type="button" disabled={busy||!totals.pending} onClick={nextPending} className="border rounded-lg px-3 py-3 flex-1 min-w-0 text-sm disabled:opacity-50">{l.nextPending}</button>
   <button type="button" disabled={busy||(!onSubmit&&!dirtyCount)} onClick={()=>void save()} className="bg-primary text-white rounded-lg px-4 py-3 flex-1 min-w-0 disabled:opacity-50">{busy?l.saving:onSubmit?l.submit:l.save}</button></div>
  </div>
 </section>
}
