import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { offlineOperations } from '../utils/offlineOperations'
import { useAuthStore } from '../stores/auth'
import { syncManager } from '../db/offline'

export function OfflineOperationsStatus(){
 const {t}=useTranslation(),storeId=useAuthStore(s=>s.user?.storeId)
 const [running,setRunning]=useState(false)
 const ops=useLiveQuery(async()=>storeId?(await offlineOperations(storeId)).filter(o=>o.status!=='synced'):[],[storeId])
 if(!ops?.length)return null
 return <details data-testid="offline-operations" role="status" className="shrink-0 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">
  <summary className="cursor-pointer font-medium">{t('offlineOperations.pending',{count:ops.length})}</summary>
  <p className="mt-2">{t('offlineOperations.notice')}</p>
  <ul className="max-h-36 overflow-auto space-y-2 mt-2">{ops.map(op=><li key={op.id} className="flex flex-wrap gap-x-3"><span>{t('offlineOperations.'+op.kind)} · {new Date(op.occurredAt).toLocaleString()}</span><span>{t(op.status==='review'?'offlineOperations.review':'offlineOperations.waiting')}</span>{op.error&&<span className="w-full break-all text-xs">{op.error}</span>}</li>)}</ul>
  <button disabled={running} className="border border-amber-700 rounded px-3 py-2 mt-2 disabled:opacity-50" onClick={async()=>{setRunning(true);try{await syncManager.syncPendingOrders(true)}finally{setRunning(false)}}}>{t('offlineOperations.retry')}</button>
 </details>
}
