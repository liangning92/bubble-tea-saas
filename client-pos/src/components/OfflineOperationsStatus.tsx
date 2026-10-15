import {db} from '../db/offline'
import {localIdentity} from '../utils/offlineSale'
import {POS_OFFLINE_TTL_MS} from '../../../shared/utils/offlinePolicy'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { offlineOperations } from '../utils/offlineOperations'
import { useAuthStore } from '../stores/auth'
import { syncManager } from '../db/offline'

export function OfflineOperationsStatus(){
 const {t}=useTranslation(),storeId=useAuthStore(s=>s.user?.storeId),actorId=useAuthStore(s=>s.user?.id)
 const [running,setRunning]=useState(false)
 const ops=useLiveQuery(async()=>storeId?(await offlineOperations(storeId)).filter(o=>o.status!=='synced'):[],[storeId])
 const readiness=useLiveQuery(async()=>{
  if(!storeId||!actorId)return null
  const backend=localIdentity(storeId),base=encodeURIComponent(backend)+':'+encodeURIComponent(storeId)+':',grant=(await db.config.get('offline.authorization:'+base+actorId))?.value
  if(!grant)return null
  const rows=await db.config.where('key').startsWith('offline.snapshot:'+base).toArray()
  const required=['/products','/config','/channels','/shifts','/pos-cash/shifts/current','/marketing/activity-prices','/marketing/activities/offline-snapshot','/expenses/categories']
  let expires=Date.parse(grant.expiresAt),ready=required.every(path=>{const row=rows.find(r=>r.key==='offline.snapshot:'+base+path);if(!row?.value.complete)return false;expires=Math.min(expires,new Date(row.updatedAt).getTime()+POS_OFFLINE_TTL_MS);if(path==='/marketing/activities/offline-snapshot')expires=Math.min(expires,Date.parse(row.value.data?.data?.expiresAt));return true})
  if(grant.permissions?.includes('members.read')){const complete=await db.config.get('offline.members:'+base+actorId+':$complete');ready=ready&&!!complete?.value?.registration;expires=Math.min(expires,Date.parse(complete?.value?.registration?.expiresAt))}
  if(grant.permissions?.some((p:string)=>['personal.tasks','personal.attendance'].includes(p))){const work=await db.config.get(`offline.work:${encodeURIComponent(backend)}:${storeId}:${actorId}`);ready=ready&&!!work;expires=Math.min(expires,Date.parse(work?.value?.expiresAt))}
  return {ready:ready&&Number.isFinite(expires)&&expires>Date.now(),expires}
 },[storeId,actorId])
 const preparation=readiness&&<details data-testid="offline-preparation" className={'shrink-0 border-b px-4 py-1 text-xs '+(readiness.ready?'bg-green-50 text-green-900':'bg-amber-50 text-amber-950')}><summary>{t(readiness.ready?'offlineOperations.prepared':'offlineOperations.preparing',{date:readiness.ready?new Date(readiness.expires).toLocaleString():''})}</summary><p className="py-1">{t('offlineOperations.retain')}</p></details>
 if(!ops?.length)return preparation

 return <>{preparation}<details data-testid="offline-operations" role="status" className="shrink-0 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">
  <summary className="cursor-pointer font-medium">{t('offlineOperations.pending',{count:ops.length})}</summary>
  <p className="mt-2">{t('offlineOperations.notice')}</p>
  <ul className="max-h-36 overflow-auto space-y-2 mt-2">{ops.map(op=><li key={op.id} className="flex flex-wrap gap-x-3"><span>{t('offlineOperations.'+op.kind)} · {new Date(op.occurredAt).toLocaleString()}</span><span>{t(op.status==='review'?'offlineOperations.review':'offlineOperations.waiting')}</span>{op.error&&<span className="w-full break-all text-xs">{op.error}</span>}</li>)}</ul>
  <button disabled={running} className="border border-amber-700 rounded px-3 py-2 mt-2 disabled:opacity-50" onClick={async()=>{setRunning(true);try{await syncManager.syncPendingOrders(true)}finally{setRunning(false)}}}>{t('offlineOperations.retry')}</button>
 </details></>
}
