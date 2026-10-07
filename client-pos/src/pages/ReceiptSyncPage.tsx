import {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useTranslation} from 'react-i18next'
import {useAuthStore} from '../stores/auth'
import {syncConnect,sendReceiptBatch} from '../services/syncApi'
export function ReceiptSyncPage(){
 const {t}=useTranslation();const navigate=useNavigate();const {token}=useAuthStore()
 const [phone,setPhone]=useState('');const [password,setPassword]=useState('');const [busy,setBusy]=useState(false)
 const [result,setResult]=useState('');const [error,setError]=useState('')
 async function send(event:React.FormEvent){
  event.preventDefault();if(!token)return;setBusy(true);setError('');setResult('')
  try{
   const session=await syncConnect(phone,password);setPassword('')
   let cursor:string|undefined;let synced=0;let failed=0
   do{
    const batch=await sendReceiptBatch(token,session.receiptSyncTicket,cursor)
    synced+=batch.results.filter(r=>['synced','unchanged'].includes(r.status)).length
    failed+=batch.results.filter(r=>r.status==='failed').length
    setResult(t('receiptSync.result',{synced,failed}));cursor=batch.nextCursor||undefined
   }while(cursor)
  }catch{setError(t('receiptSync.error'))}finally{setPassword('');setBusy(false)}
 }
 return <main className="max-w-xl mx-auto p-6 space-y-4">
  <button onClick={()=>navigate('/history')} disabled={busy}>{t('receiptSync.back')}</button>
  <h1 className="text-xl font-bold">{t('receiptSync.title')}</h1><p>{t('receiptSync.hint')}</p>
  <form onSubmit={send} className="space-y-3">
   <label className="block">{t('auth.phone')}<input className="input w-full" value={phone} onChange={e=>setPhone(e.target.value)} required autoComplete="off" disabled={busy}/></label>
   <label className="block">{t('auth.password')}<input className="input w-full" type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="off" disabled={busy}/></label>
   <button className="btn-primary" disabled={busy}>{busy?t('receiptSync.running'):t('receiptSync.send')}</button>
  </form>
  <p role="status">{result}</p><p role="alert" className="text-red-600">{error}</p>
 </main>
}
