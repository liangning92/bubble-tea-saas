import {lazy,Suspense,useEffect,useState} from 'react'
import {useTranslation} from 'react-i18next'
import {useAuthStore} from '../stores/auth'
import {API_BASE} from '../services/api'
import {loginBackend} from '../utils/offlineAuth'
import {attendanceState,queueAttendance,syncAttendance} from '../utils/offlineAttendance'
const QRCameraScannerModal=lazy(()=>import('./QRCameraScannerModal').then(module=>({default:module.QRCameraScannerModal})))

export function OfflineAttendancePanel(){
 const {user}=useAuthStore(),{t,i18n}=useTranslation()
 const [state,setState]=useState<Awaited<ReturnType<typeof attendanceState>>>(null),[scanner,setScanner]=useState(false),[busy,setBusy]=useState(false),[syncing,setSyncing]=useState(false),[message,setMessage]=useState('')
 const backend=loginBackend(API_BASE),actorId=user?.id||''
 useEffect(()=>{let mounted=true;const read=()=>{void attendanceState(backend,actorId).then(value=>{if(mounted)setState(value)}).catch(()=>{})};read();window.addEventListener('employee-offline-attendance-changed',read);return()=>{mounted=false;window.removeEventListener('employee-offline-attendance-changed',read)}},[backend,actorId])
 const open=state?.attendance.find((row:any)=>!row.checkOutTime)
 async function retry(){setSyncing(true);try{await syncAttendance(API_BASE,backend,actorId)}catch{setMessage(t('offlineAttendance.failed'))}finally{setSyncing(false)}}
 async function scan(code:string,mode:'check_in'|'check_out'){
  setBusy(true);setMessage('')
  try {await queueAttendance(backend,actorId,code,mode);setScanner(false);setMessage(t('offlineAttendance.saved'));void syncAttendance(API_BASE,backend,actorId).catch(()=>{})}
  catch(error){const key=error instanceof Error&&error.message.startsWith('offlineAttendance.')?error.message:'offlineAttendance.failed';setMessage(t(key));throw new Error(key)}
  finally{setBusy(false)}
 }
 return <section className="rounded-2xl border border-gray-200 bg-white p-5" data-testid="offline-employee-attendance">
  <h2 className="text-lg font-semibold">{t('offlineAttendance.title')}</h2>
  <p className="mt-2">{open?t('offlineAttendance.working'):t('offlineAttendance.notWorking')}</p>
  {open&&<p className="mt-1 text-sm text-gray-500">{new Date(open.checkInTime).toLocaleString(i18n.language)}</p>}
  {!state?.ready&&<p role="status" className="mt-3 text-amber-800">{t('offlineAttendance.notPrepared')}</p>}
  <p role="status" className="mt-3 text-sm text-gray-600">{t('offlineAttendance.pending',{count:state?.pending||0})}</p>
  {state?.error&&<p role="alert" className="mt-2 text-red-700">{t('offlineAttendance.review')}</p>}
  {message&&<p role="status" className="mt-2 font-medium">{message}</p>}
  <div className="mt-4 flex flex-wrap gap-3">
   <button disabled={!state?.ready||busy} onClick={()=>setScanner(true)} className="rounded-xl bg-primary px-5 py-3 text-white disabled:opacity-50">{t(open?'offlineAttendance.scanOut':'offlineAttendance.scanIn')}</button>
   {!!state?.pending&&<button disabled={syncing} onClick={()=>void retry()} className="rounded-xl border px-5 py-3 disabled:opacity-50">{t(syncing?'common.loading':'offlineAttendance.retry')}</button>}
  </div>
  {scanner&&<Suspense fallback={<p role="status">{t('common.loading')}</p>}><QRCameraScannerModal isOpen={scanner} onClose={()=>setScanner(false)} onScan={scan} defaultMode={open?'check_out':'check_in'} isLoading={busy}/></Suspense>}
 </section>
}
