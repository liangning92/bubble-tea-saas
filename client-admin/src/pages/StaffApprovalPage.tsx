import {useSearchParams} from 'react-router-dom'
import { confirmAdmin } from '../components/AdminFeedback'
import {useEmployeePermission} from '../contexts/EmployeeAccess'
import {useCallback,useEffect,useRef,useState} from 'react'
import {useTranslation} from 'react-i18next'
import api from '../services/api'
import {useAuthStore} from '../stores/auth'
import {staffAccessLabels} from '../../../shared/staffAccessLabels'
const approvalIdentity=(state:ReturnType<typeof useAuthStore.getState>)=>JSON.stringify([state.isAuthenticated,state.token,state.user?.id,state.user?.role,state.user?.storeId,state.user?.staff?.id]);
export function StaffApprovalPage(){
 const [noticeParams]=useSearchParams(),noticeObject=noticeParams.get('noticeObject')||'';
 const canApprove=useEmployeePermission('approvals.approve'),{i18n}=useTranslation(),l=staffAccessLabels(i18n.language);
 const session=useAuthStore(),user=session.user,identity=approvalIdentity(session);
 const [selection,setSelection]=useState({identity,storeId:user?.storeId||''}),[directory,setDirectory]=useState<{identity:string;rows:any[]}>({identity:'',rows:[]});
 const storeId=selection.identity===identity?selection.storeId:user?.storeId||'',stores=directory.identity===identity?directory.rows:[];
 const scope=JSON.stringify([identity,storeId,noticeObject]),currentScope=useRef(scope),requestVersion=useRef(0);currentScope.current=scope;
 const [content,setContent]=useState<{scope:string;rows:any[];error:string}>({scope:'',rows:[],error:''}),[pin,setPin]=useState(''),[password,setPassword]=useState(''),[busyState,setBusyState]=useState({scope:'',busy:false}),[filter,setFilter]=useState('pending');
 // Never render a previous query or authenticated session while its replacement loads.
 const rows=content.scope===scope?content.rows:[],error=content.scope===scope?content.error:'',busy=busyState.scope===scope&&busyState.busy;
 const current=useCallback(()=>currentScope.current===scope&&approvalIdentity(useAuthStore.getState())===identity,[scope,identity]);
 const setBusy=(busy:boolean)=>{if(current())setBusyState({scope,busy})};
 const setError=(error:string)=>{if(current())setContent(previous=>({scope,rows:previous.scope===scope?previous.rows:[],error}))};
 const load=useCallback(async(signal?:AbortSignal)=>{
  if(!storeId||!current()||signal?.aborted)return;
  const version=++requestVersion.current,valid=()=>current()&&version===requestVersion.current&&!signal?.aborted;
  try{
   const items=(await api.get('/staff-permissions/approvals',{params:{storeId},signal})).data.data;
   if(!valid())return;
   let linked:any=null;
   if(noticeObject&&!items.some((row:any)=>row.id===noticeObject))linked=(await api.get(`/staff-permissions/approvals/${encodeURIComponent(noticeObject)}`,{params:{storeId},signal})).data.data;
   if(valid())setContent({scope,rows:[...new Map((linked?[linked,...items]:items).map((row:any)=>[row.id,row])).values()],error:''});
  }catch(e:any){if(valid())setContent({scope,rows:[],error:e.response?.data?.message||l.error})}
 },[current,storeId,noticeObject,scope,l.error]);
 useEffect(()=>{
  const controller=new AbortController();setDirectory({identity,rows:[]});setPin('');setPassword('');
  if(user?.role==='admin')void api.get('/staff-permissions/stores',{signal:controller.signal}).then(response=>{
   if(controller.signal.aborted||approvalIdentity(useAuthStore.getState())!==identity)return;
   const items=response.data.data;setDirectory({identity,rows:items});setSelection(previous=>previous.identity===identity&&previous.storeId?previous:{identity,storeId:user?.storeId||items[0]?.id||''});
  }).catch(()=>{if(!controller.signal.aborted&&approvalIdentity(useAuthStore.getState())===identity)setContent({scope:currentScope.current,rows:[],error:l.error})});
  return()=>controller.abort();
 },[identity,user?.role,l.error]);
 useEffect(()=>{
  const controller=new AbortController();setContent({scope,rows:[],error:''});void load(controller.signal);
  const timer=window.setInterval(()=>void load(controller.signal),10000);
  return()=>{controller.abort();++requestVersion.current;window.clearInterval(timer)};
 },[load,scope]);
 useEffect(()=>{if(noticeObject)setFilter('all')},[noticeObject]);
 const action=async(id:string,type:string)=>{if(!current()||!rows.some(row=>row.id===id))return;setBusy(true);setError('');try{const row=rows.find(r=>r.id===id),payload=JSON.parse(row.payload);if(row.action==='orders.refund'&&type==='approve'&&!await confirmAdmin(l.review+' · '+(payload.verifiedUnprepared?'未制作 / unprepared':'已制作 / prepared')))return;if(!current())return;await api.post(`/staff-permissions/approvals/${id}/${type}`,row.action==='orders.refund'?{verifiedPrepared:payload.verifiedPrepared===true,verifiedUnprepared:payload.verifiedUnprepared===true}:{}, {params:{storeId}});await load()}catch(e:any){setError(e.response?.data?.message||l.error)}finally{if(current())setBusy(false)}};
 return <section className="card space-y-5"><h1 className="text-xl font-bold">{l.approvals}</h1>{user?.role==='admin'&&<select aria-label={l.store} className="input max-w-xs" value={storeId} onChange={e=>{currentScope.current='';setSelection({identity,storeId:e.target.value})}}>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>}{error&&<p role="alert">{error}</p>}{canApprove&&<details><summary>{l.pinSave}</summary><div className="flex flex-wrap gap-3 pt-3"><input aria-label={l.pin} className="input max-w-xs" type="password" maxLength={6} value={pin} onChange={e=>setPin(e.target.value)} placeholder={l.pin}/><input aria-label={l.password} className="input max-w-xs" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={l.password}/><button className="btn-primary" disabled={busy} onClick={async()=>{setBusy(true);try{await api.post('/staff-permissions/approval-pin',{pin,password});setPin('');setPassword('');setError(l.saved)}catch(e:any){setError(e.response?.data?.message||l.error)}finally{setBusy(false)}}}>{l.pinSave}</button></div></details>}<select className="input max-w-xs" aria-label={l.mode} value={filter} onChange={e=>setFilter(e.target.value)}>{['pending','authorized','executed','rejected','all'].map(k=><option key={k} value={k}>{l[k as keyof typeof l]||k}</option>)}</select>{rows.filter(r=>filter==='all'||r.status===filter).map(r=>{const payload=JSON.parse(r.payload);return <article className="border rounded-xl p-4 space-y-2" key={r.id} data-notice-object={r.id} data-notice-status={r.status}><p className="font-semibold">{r.action==='members.balance'?l.balance:r.action==='orders.discount'?l.manualDiscount:l.refundRequest} · {r.beforeValue?(JSON.parse(r.beforeValue).name||JSON.parse(r.beforeValue).order?.orderNumber||r.targetId):r.targetId}</p><p>{l.amount}: {payload.amount==null?'-':`Rp ${payload.amount.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`} · {l.reason}: {payload.note}</p><p>{r.applicantName||r.applicantId} → {r.approverName||'-'} · {l[r.status as keyof typeof l]||r.status}</p><p>{new Date(r.createdAt).toLocaleString(i18n.language,{timeZone:'Asia/Jakarta'})}</p>{r.status==='pending'&&(r.applicantId!==user?.id||(user?.role==='admin'&&r.action==='orders.refund'))&&<div><button className="btn-primary" disabled={busy} onClick={()=>void action(r.id,'approve')}>{l.approve}</button><button className="btn-secondary ml-2" disabled={busy} onClick={()=>void action(r.id,'reject')}>{l.reject}</button></div>}</article>})}{!rows.length&&<p>{l.none}</p>}</section>
}
