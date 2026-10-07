import {useEffect,useState} from 'react'
import {useTranslation} from 'react-i18next'
import {staffApi} from '../services/api'
export function InventoryCountPage(){
 const {t}=useTranslation();const [counts,setCounts]=useState<any[]>([]),[error,setError]=useState('')
 async function load(){try{const result=await staffApi.getInventoryCounts();setCounts((result.data?.list||[]).filter((c:any)=>c.status==='in_progress'));setError('')}catch{setError(t('countFlow.refresh'))}}
 useEffect(()=>{load()},[])
 return <main className="p-4 space-y-4"><h1 className="text-xl font-bold">{t('countFlow.title')}</h1><p>{t('countFlow.hint')}</p><button className="text-blue-600" onClick={load}>{t('countFlow.refresh')}</button><p role="alert">{error}</p>{counts.length===0&&<p>{t('countFlow.empty')}</p>}{counts.map(count=><section key={count.id} className="space-y-3"><h2>{count.period} · {count.createdAt.slice(0,10)}</h2>{count.items.map((item:any)=><CountRow key={item.id+item.inventory.updatedAt} countId={count.id} item={item} reload={load}/>)}</section>)}</main>
}
function CountRow({countId,item,reload}:{countId:string;item:any;reload:()=>Promise<void>}){
 const {t}=useTranslation();const [quantity,setQuantity]=useState(''),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{await staffApi.recordInventoryCount(countId,item.id,{countedQty:Number(quantity),note:reason,expectedStock:item.inventory.currentStock,observedVersion:item.inventory.updatedAt});await reload()}catch(e:any){setError(`${t('countFlow.refresh')}: ${e?.response?.data?.message||''}`)}finally{setBusy(false)}}
 return <form onSubmit={submit} className="bg-white rounded border p-3 space-y-2"><h3>{item.inventory.name} ({item.inventory.unit})</h3><p>{t('countFlow.theory')}: {item.countedAt?item.systemQty:item.inventory.currentStock}</p><p>{t('countFlow.actual')}: {item.countedQty??'—'} · {t('countFlow.movement')}: {item.movementSinceObservation??'—'}</p><p>{item.note}</p><label className="block">{t('countFlow.actual')}<input type="number" min="0" step="any" className="border p-2 w-full" required value={quantity} onChange={e=>setQuantity(e.target.value)} disabled={busy}/></label><label className="block">{t('countFlow.reason')}<input className="border p-2 w-full" value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/></label><button className="bg-blue-600 text-white p-2 rounded" disabled={busy}>{t('countFlow.save')}</button><p role="alert">{error}</p></form>
}
