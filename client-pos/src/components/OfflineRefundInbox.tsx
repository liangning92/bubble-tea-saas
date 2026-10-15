import {useLiveQuery} from 'dexie-react-hooks'
import {Link} from 'react-router-dom'
import {useState} from 'react'
import {useTranslation} from 'react-i18next'
import {useAuthStore} from '../stores/auth'
import {offlineOperations} from '../utils/offlineOperations'
import {settleOfflineRefund,refundDecisionPayload} from '../utils/offlineRefunds'
import {db} from '../db/offline'
import {localIdentity} from '../utils/offlineSale'
export function OfflineRefundInbox(){
 const {t}=useTranslation(),user=useAuthStore(s=>s.user),[busy,setBusy]=useState(''),[error,setError]=useState(''),[confirmed,setConfirmed]=useState<Record<string,boolean>>({}),[methods,setMethods]=useState<Record<string,string>>({})
 const state=useLiveQuery(async()=>{
  if(!user?.storeId)return {rows:[],grant:null,completed:[]}
  const ops=await offlineOperations(user.storeId),grant=(await db.config.get(`offline.authorization:${encodeURIComponent(localIdentity(user.storeId))}:${encodeURIComponent(user.storeId)}:${user.id}`))?.value
  const authorized=grant?.permissions?.includes('orders.refund')&&grant?.permissions?.includes('approvals.approve')
  const rows=ops.filter(o=>(authorized||o.actorId===user.id)&&o.kind==='refund'&&!ops.some(d=>d.kind==='refund-settle'&&d.data.requestId===o.id))
  const amounts=await Promise.all(rows.map(async row=>{try{return {...row,quote:await refundDecisionPayload({requestId:row.id,decision:'approve',confirmed:true,payoutMethod:'cash'})}}catch{return {...row,quote:null}}}))
  return {rows:amounts,grant,completed:ops.filter(o=>o.kind==='refund-settle'&&(authorized||ops.some(p=>p.id===o.data.requestId&&p.actorId===user.id))).reverse().slice(0,10)}
 },[user?.id,user?.storeId])
 async function decide(id:string,decision:string){setBusy(id);setError('');try{await settleOfflineRefund({requestId:id,decision,confirmed:confirmed[id],payoutMethod:methods[id]||'cash'})}catch(e:any){setError(t(e.message==='STAFF_ACCESS_SELF_APPROVAL'?'offlineRefund.independent':e.message==='ADMIN_APPROVAL_REQUIRED'?'offlineRefund.admin':'offlineRefund.failed'))}finally{setBusy('')}}
 if(!state)return null
 const canApprove=state.grant?.permissions?.includes('orders.refund')&&state.grant?.permissions?.includes('approvals.approve')
 return <section className="m-4 p-4 bg-white border rounded-xl space-y-3" data-testid="offline-refund-inbox"><Link to="/pos" className="inline-block border rounded px-3 py-2">← {t('common.back')}</Link><h2 className="font-bold">{t('offlineRefund.title')}</h2><p className="text-sm text-gray-600">{t('offlineRefund.notice')}</p>{error&&<p role="alert" className="text-red-700">{error}</p>}{state.rows.map(row=><article key={row.id} className="border-t pt-3 space-y-2"><p className="break-all font-medium">{row.data.orderNumber}</p><p>{row.data.reason}</p>{row.quote&&<p>Rp {row.quote.amount.toLocaleString('id-ID')}</p>}{canApprove&&!(state.grant?.independentRefundApproval&&row.actorId===user?.id)?<><label className="block">{t('offlineRefund.method')}<select className="border rounded p-2 w-full" value={methods[row.id]||'cash'} onChange={e=>setMethods({...methods,[row.id]:e.target.value})}><option value="cash">{t('offlineRefund.cash')}</option><option value="external">{t('offlineRefund.external')}</option></select></label><label className="flex gap-2 items-start"><input type="checkbox" checked={!!confirmed[row.id]} onChange={e=>setConfirmed({...confirmed,[row.id]:e.target.checked})}/><span>{t('offlineRefund.confirm')}</span></label><div className="flex flex-wrap gap-3"><button className="bg-red-600 text-white px-3 py-2 rounded disabled:opacity-50" disabled={!!busy||!confirmed[row.id]||!row.quote} onClick={()=>void decide(row.id,'approve')}>{t('offlineRefund.approve')}</button><button className="border px-3 py-2 rounded" disabled={!!busy} onClick={()=>void decide(row.id,'reject')}>{t('offlineRefund.reject')}</button></div>{!row.quote&&<p className="text-sm text-amber-800">{t(row.data.reasonCode==='paid_unprepared'&&user?.role!=='admin'?'offlineRefund.admin':'offlineRefund.evidence')}</p>}</>:<p>{t(state.grant?.independentRefundApproval&&row.actorId===user?.id?'offlineRefund.independent':'offlineRefund.manager')}</p>}</article>)}{!state.rows.length&&<p>{t('offlineRefund.empty')}</p>}{state.completed?.map(op=><article className="border-t pt-2 text-sm" key={op.id}><p className="break-all">{op.data.localEvidence.orderNumber} · Rp {op.data.amount.toLocaleString('id-ID')}</p><p>{t(op.data.decision==='reject'?'offlineRefund.rejected':'offlineRefund.recorded')} · {t(op.status==='synced'?'offlineRefund.synced':op.status==='review'?'offlineOperations.review':'offlineOperations.waiting')}</p></article>)}</section>
}
