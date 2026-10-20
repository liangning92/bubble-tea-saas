import {useSearchParams} from 'react-router-dom'
import {useStaffAccess} from './StaffAccess'
import {useCallback,useEffect,useState,useRef} from 'react'
import {useTranslation} from 'react-i18next'
import {staffAccessLabels} from './staffAccessLabels'
export function StaffApprovalInbox({api,userId}:{api:any;userId:string}){
 const [params]=useSearchParams(),requestId=params.get('requestId')||'',scope=JSON.stringify([userId,requestId]);
 const located=useRef(''),currentScope=useRef(scope),requestVersion=useRef(0);currentScope.current=scope;
 const access=useStaffAccess();const {i18n}=useTranslation(),l=staffAccessLabels(i18n.language);
 const [storedRows,setRows]=useState<any[]>([]),[loadedScope,setLoadedScope]=useState(''),[storedError,setError]=useState(''),[busy,setBusy]=useState(false),[pin,setPin]=useState(''),[password,setPassword]=useState('');
 const rows=loadedScope===scope?storedRows:[],error=loadedScope===scope?storedError:'';
 const load=useCallback(async(signal?:AbortSignal)=>{
  if(currentScope.current!==scope||signal?.aborted)return;
  const version=++requestVersion.current,current=()=>currentScope.current===scope&&requestVersion.current===version&&!signal?.aborted;
  try{
   const items=(await api.get('/staff-permissions/approvals',{signal})).data.data;
   if(!current())return;
   let linked:any=null;
   if(requestId&&!items.some((row:any)=>row.id===requestId))linked=(await api.get(`/staff-permissions/approvals/${encodeURIComponent(requestId)}`,{signal})).data.data;
   if(!current())return;
   setRows([...new Map((linked?[linked,...items]:items).map((row:any)=>[row.id,row])).values()]);setError('');setLoadedScope(scope);
  }catch{
   if(current()){setRows([]);setError(l.error);setLoadedScope(scope)}
  }
 },[api,scope,requestId,l.error]);
 useEffect(()=>{const controller=new AbortController();located.current='';setRows([]);setError('');void load(controller.signal);const timer=setInterval(()=>void load(controller.signal),10000);return()=>{controller.abort();++requestVersion.current;clearInterval(timer)}},[load]);
 useEffect(()=>{if(requestId&&located.current!==requestId&&rows.some(row=>row.id===requestId)){located.current=requestId;const el=document.getElementById('staff-approval-'+requestId);el?.scrollIntoView?.({block:'center'});el?.focus({preventScroll:true})}},[rows,requestId]);
 const act=async(r:any,type:string)=>{setBusy(true);try{const payload=JSON.parse(r.payload);if(r.action==='orders.refund'&&type==='approve'&&!window.confirm(l.review+' · '+(payload.verifiedUnprepared?'未制作 / unprepared':'已制作 / prepared')))return;await api.post(`/staff-permissions/approvals/${r.id}/${type}`,r.action==='orders.refund'?{verifiedPrepared:payload.verifiedPrepared===true,verifiedUnprepared:payload.verifiedUnprepared===true}:{});await load()}catch(e:any){setError(e.response?.data?.message||l.error)}finally{setBusy(false)}};return <main className="p-4 space-y-4"><h1 className="text-xl font-bold">{l.approvals}</h1>{error&&<p role="alert">{error}</p>}{access.can('approvals.approve')&&<details><summary>{l.pinSave}</summary><input className="input" type="password" aria-label={l.pin} placeholder={l.pin} maxLength={6} value={pin} onChange={e=>setPin(e.target.value)}/><input className="input" type="password" aria-label={l.password} placeholder={l.password} value={password} onChange={e=>setPassword(e.target.value)}/><button disabled={busy} className="btn-primary" onClick={async()=>{setBusy(true);try{await api.post('/staff-permissions/approval-pin',{pin,password});setPin('');setPassword('');setError(l.saved)}catch(e:any){setError(e.response?.data?.message||l.error)}finally{setBusy(false)}}}>{l.pinSave}</button></details>}{rows.map(r=><article id={'staff-approval-'+r.id} tabIndex={-1} data-notice-object={r.id} className={`bg-white border rounded-xl p-4 space-y-2 ${r.id===requestId?'awareness-target':''}`} key={r.id}><p>{r.action==='members.balance'?l.balance:r.action==='orders.discount'?l.manualDiscount:l.refundRequest} · {r.beforeValue?(JSON.parse(r.beforeValue).name||JSON.parse(r.beforeValue).order?.orderNumber||r.targetId):r.targetId}</p><p>{l.amount}: {JSON.parse(r.payload).amount??'-'} · {l.reason}: {JSON.parse(r.payload).note}</p><p>{l[r.status as keyof typeof l]||r.status}</p>{r.status==='pending'&&r.applicantId!==userId&&<><button className="btn-primary" disabled={busy} onClick={()=>void act(r,'approve')}>{l.approve}</button><button className="btn-secondary ml-2" disabled={busy} onClick={()=>void act(r,'reject')}>{l.reject}</button></>}</article>)}{!rows.length&&<p>{l.none}</p>}</main>}
