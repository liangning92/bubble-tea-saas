import {useEffect,useState} from 'react'
import {useTranslation} from 'react-i18next'
import {posApi} from '../services/api'
export function RefundRequestForm({order,onDone,onCancel}:{order:any;onDone:()=>void;onCancel:()=>void}){
 const {t}=useTranslation();const [quote,setQuote]=useState<any>(null),[quantities,setQuantities]=useState<Record<string,number>>({}),[reason,setReason]=useState(''),[kind,setKind]=useState('customer_dissatisfied'),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{let active=true;posApi.getRefundQuote(order.id).then(r=>{if(active)setQuote(r.data.data)}).catch(()=>{if(active)setError(t('itemRefund.evidence'))});return()=>{active=false}},[order.id,t])
 const rows=quote?.items||[]
 const items=rows.filter((i:any)=>(quantities[i.itemId]||0)>0).map((i:any)=>({itemId:i.itemId,quantity:quantities[i.itemId]}))
 const amount=rows.reduce((sum:number,i:any)=>{const n=quantities[i.itemId]||0,base=Math.floor(i.allocatedAmount/i.quantity),extra=i.allocatedAmount%i.quantity,start=i.refundedQuantity;return sum+base*n+Math.max(0,Math.min(start+n,extra)-Math.min(start,extra))},0)
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
  const body=kind==='paid_unprepared'?{orderId:order.id,reason,reasonCode:kind,selectedItemIds:order.items.map((i:any)=>i.id)}:{orderId:order.id,reason,reasonCode:kind,items}
  const key='refund-request:'+JSON.stringify(body);let requestId=sessionStorage.getItem(key);if(!requestId){requestId=crypto.randomUUID();sessionStorage.setItem(key,requestId)}
  await posApi.requestRefund({...body,requestId});sessionStorage.removeItem(key);onDone()
 }catch(e:any){setError(`${t('itemRefund.failed')}: ${e?.response?.data?.message||''}`)}finally{setBusy(false)}}
 return <form onSubmit={submit} className="p-4 space-y-3" data-testid="item-refund-form"><h2 className="font-bold">{t('itemRefund.title')}</h2><p>{order.orderNumber}</p><label>{t('refundPolicy.reason')}<select className="border p-2 w-full" value={kind} onChange={e=>setKind(e.target.value)} disabled={busy}><option value="customer_dissatisfied">{t('refundPolicy.customer_dissatisfied')}</option><option value="paid_unprepared">{t('refundPolicy.paid_unprepared')}</option></select></label>
 {kind==='customer_dissatisfied'?<><p>{t('itemRefund.hint')}</p>{rows.map((i:any)=><label key={i.itemId} className="block">{i.name} · {t('itemRefund.remaining')}: {i.remaining}<input aria-label={i.name} type="number" min="0" max={i.remaining} step="1" value={quantities[i.itemId]||0} disabled={busy} className="border p-2 w-full" onChange={e=>setQuantities({...quantities,[i.itemId]:Math.max(0,Math.min(i.remaining,Number(e.target.value)))})}/></label>)}<p data-testid="refund-amount">{t('orders.refundAmount')}: Rp {amount}</p></>:<p>{t('itemRefund.unprepared')}</p>}
 <p>{t('itemRefund.manual')}</p><label>{t('orders.refundReason')}<textarea required maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)} className="border p-2 w-full" disabled={busy}/></label><p role="alert">{error}</p><div className="flex gap-3"><button type="button" onClick={onCancel} disabled={busy}>{t('orders.cancel')}</button><button className="bg-red-600 text-white p-2 rounded" disabled={busy||!reason.trim()||(kind==='customer_dissatisfied'&&(!quote||!items.length||items.some((i:any)=>!Number.isInteger(i.quantity))))}>{t('itemRefund.submit')}</button></div></form>
}
