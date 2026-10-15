import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/offline'
import { submitSavedReceipt, receiptNeedsPaperCheck } from '../utils/receiptRecovery'
import { formatCurrency } from '../utils/helpers'

export function ReceiptRecovery({storeId,audit,target}:{storeId?:string|null;target:()=>Record<string,unknown>|null|undefined;audit:(order:string,status:string,error?:string)=>void}){
 const {t}=useTranslation(),[expanded,setExpanded]=useState(false),[busy,setBusy]=useState(''),[confirmed,setConfirmed]=useState<Record<string,boolean>>({}),[error,setError]=useState(false),[now,setNow]=useState(Date.now())
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),5000);return()=>clearInterval(timer)},[])
 const jobs=useLiveQuery(async()=>storeId?db.config.where('key').startsWith(`receipt-print:${storeId}:`).toArray():[],[storeId])
 const pending=(jobs||[]).filter(job=>['failed','unknown','pending'].includes(job.value?.status)&& (job.value.status!=='pending'||now-new Date(job.value.attemptedAt).getTime()>45000)).sort((a,b)=>new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime())
 if(!pending.length)return null
 const send=(window as any).electronAPI?.sendPrintReceipt
 return <section role="status" className="shrink-0 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">
  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{t('receiptRecovery.title',{count:pending.length})}</span><button type="button" className="min-h-9 underline" onClick={()=>setExpanded(!expanded)}>{t(expanded?'receiptRecovery.hide':'receiptRecovery.review')}</button></div>
  {expanded&&<div className="max-h-64 overflow-y-auto space-y-3 pb-2">
   <p>{t('receiptRecovery.help')}</p>{error&&<p role="alert">{t('receiptRecovery.saveFailed')}</p>}
   {pending.map(job=>{const value=job.value,payload=value.payload,uncertain=receiptNeedsPaperCheck(value);return <div key={job.key} className="rounded border border-amber-200 bg-white p-3 space-y-2">
    <p className="break-all font-semibold">#{payload?.pickupNumber||payload?.orderNum||job.key.split(':').pop()} · {payload?formatCurrency(payload.total):''}</p>
    <p>{t(uncertain?'receiptRecovery.uncertain':'receiptRecovery.failed')}</p>
    {uncertain&&<label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={!!confirmed[job.key]} onChange={e=>setConfirmed({...confirmed,[job.key]:e.target.checked})}/>{t('receiptRecovery.noPaper')}</label>}
    <div className="flex flex-wrap gap-2">
     <button type="button" disabled={!!busy||!send||!payload||(uncertain&&!confirmed[job.key])} className="min-h-10 rounded bg-primary px-3 text-white disabled:opacity-50" onClick={async()=>{
      setBusy(job.key);setError(false)
      try {
       const printer=target()
       if(!printer)throw Error('PRINTER_TARGET_UNAVAILABLE')
       await submitSavedReceipt(job.key,payload=>send({...payload,...printer}),(status,error)=>audit(payload.orderNum,status,error),true)
       setConfirmed(c=>({...c,[job.key]:false}))
      } catch {setError(true)} finally {setBusy('')}
     }}>{t(busy===job.key?'receiptRecovery.processing':'receiptRecovery.retry')}</button>
     <button type="button" disabled={!!busy} className="min-h-10 rounded border px-3 disabled:opacity-50" onClick={async()=>{setError(false);try{await db.config.put({...job,value:{...value,status:'paper-confirmed'},updatedAt:new Date()});audit(payload?.orderNum||job.key.split(':').pop()!,'paper-confirmed')}catch{setError(true)}}}>{t('receiptRecovery.paperReceived')}</button>
    </div>
    {!send&&<p>{t('receiptRecovery.originalRegister')}</p>}
    <details className="text-xs text-gray-600"><summary>{t('receiptRecovery.support')}</summary><p className="break-all">{payload?.orderNum} · {new Date(job.updatedAt).toLocaleString()} · {value.error||value.status}</p></details>
   </div>})}
  </div>}
 </section>
}
