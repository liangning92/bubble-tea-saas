export interface AttendanceEvent {id:string;authorization:string;occurredAt:string;qrData:string;type:'check_in'|'check_out';attendanceId?:string}
export interface AttendancePreparation {version:number;actorId:string;staffId:string;storeId:string;posId:string;issuedAt:number;expiresAt:number;windowMs:number;hashes:Record<string,string>;authorization:string;attendance:any[]}
interface State {key:string;backend:string;actorId:string;preparation:AttendancePreparation;events:AttendanceEvent[];error?:boolean}
let database:Promise<IDBDatabase>|undefined
function openDatabase(){
 if(!database)database=new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('employee-offline-attendance-v1',1)
  request.onupgradeneeded=()=>request.result.createObjectStore('state',{keyPath:'key'})
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)
 }).catch(error=>{database=undefined;throw error})
 return database
}
const storageKey=(backend:string,actorId:string)=>backend+':'+actorId
async function transaction<T>(backend:string,actorId:string,write:boolean,fn:(state:State|undefined)=>{state?:State;result:T}):Promise<T>{
 const db=await openDatabase()
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('state',write?'readwrite':'readonly'),store=tx.objectStore('state'),request=store.get(storageKey(backend,actorId));let result:T
  request.onsuccess=()=>{try{const value=fn(request.result);result=value.result;if(write&&value.state)store.put(value.state)}catch(error){tx.abort();reject(error)}}
  tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('offlineAttendance.failed'))
 })
}
function announce(){window.dispatchEvent(new Event('employee-offline-attendance-changed'))}
export async function saveAttendancePreparation(backend:string,actorId:string,data:AttendancePreparation){
 if(data.version!==1||data.actorId!==actorId||!data.staffId||!data.storeId||data.posId!==data.storeId||data.windowMs!==300000||!Number.isFinite(data.issuedAt)||!Number.isFinite(data.expiresAt)||data.expiresAt-data.issuedAt!==30*86400000||data.issuedAt>Date.now()+1000||data.expiresAt<=Date.now()||!data.hashes||!data.authorization||!Array.isArray(data.attendance))throw Error('offlineAttendance.notPrepared')
 await transaction(backend,actorId,true,state=>({state:state?.events.length?state:{key:storageKey(backend,actorId),backend,actorId,preparation:data,events:[]},result:undefined}));announce()
}
function projected(state:State){
 const attendance=structuredClone(state.preparation.attendance)
 for(const event of state.events){
  if(event.type==='check_in')attendance.unshift({id:'POSATT-'+event.id,staffId:state.preparation.staffId,checkInTime:event.occurredAt,checkOutTime:null,offline:true})
  else {const row=attendance.find((r:any)=>r.id===event.attendanceId);if(row)row.checkOutTime=event.occurredAt}
 }
 return attendance
}
export async function attendanceState(backend:string,actorId:string){
 return transaction(backend,actorId,false,state=>({result:state?{ready:Date.now()>=state.preparation.issuedAt&&Date.now()<state.preparation.expiresAt,expiresAt:state.preparation.expiresAt,attendance:projected(state),pending:state.events.length,error:!!state.error,issuedAt:state.preparation.issuedAt}:null}))
}
export async function queueAttendance(backend:string,actorId:string,qrData:string,type:'check_in'|'check_out'){
 const occurredAt=new Date().toISOString(),at=Date.parse(occurredAt)
 let payload:any;try{payload=JSON.parse(atob(qrData))}catch{throw Error('offlineAttendance.invalidQR')}
 const digest=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(qrData)))))
 const result=await transaction(backend,actorId,true,state=>{
  if(!state||at<state.preparation.issuedAt||at>=state.preparation.expiresAt)throw Error('offlineAttendance.notPrepared')
  const prep=state.preparation
  if(payload.v!==2||payload.s!==prep.storeId||payload.p!==prep.posId||!Number.isSafeInteger(payload.t)||at<payload.t||at>=payload.t+prep.windowMs||prep.hashes[String(payload.t)]!==digest)throw Error('offlineAttendance.invalidQR')
  const rows=projected(state),open=rows.find((row:any)=>!row.checkOutTime),day=(time:string)=>new Date(Date.parse(time)+7*3600000).toISOString().slice(0,10)
  if(type==='check_in'&&(open||rows.some((row:any)=>day(row.checkInTime)===day(occurredAt))))throw Error('offlineAttendance.alreadyRecorded')
  if(type==='check_out'&&!open)throw Error('offlineAttendance.noOpen')
  const event:AttendanceEvent={id:crypto.randomUUID(),authorization:prep.authorization,occurredAt,qrData,type,...(type==='check_out'?{attendanceId:open.id}:{})}
  state.events.push(event);state.error=false
  return {state,result:event}
 });announce();return result
}
const active=new Map<string,Promise<void>>()
export async function syncAttendance(base:string,backend:string,actorId:string){
 const key=storageKey(backend,actorId);if(active.has(key))return active.get(key)
 const promise=(async()=>{
  const events=await transaction(backend,actorId,false,state=>({result:state?.events||[]}))
  for(const event of events){
   let response:Response
   try {response=await fetch(base+'/auth/employee-offline-attendance/sync',{method:'POST',headers:{'Content-Type':'application/json','X-Client-App':'employee'},body:JSON.stringify(event),signal:AbortSignal.timeout(5000)})}catch{return}
   if(!response.ok){if([400,401,403,409,422].includes(response.status))await transaction(backend,actorId,true,state=>{if(state)state.error=true;return{state,result:undefined}});announce();return}
   let result:any;try{result=(await response.json()).data}catch{return}
   if(result?.operationId!==event.id||!result.attendance?.id)return
   await transaction(backend,actorId,true,state=>{
    if(!state||!state.events.some(row=>row.id===event.id))return {state,result:undefined}
    const old=state.preparation.attendance.find(row=>row.id===result.attendance.id)
    const row={...result.attendance,...(old?.checkOutTime&&!result.attendance.checkOutTime?{checkOutTime:old.checkOutTime}:{})}
    state.preparation.attendance=[row,...state.preparation.attendance.filter(record=>record.id!==row.id)]
    state.events=state.events.filter(row=>row.id!==event.id);state.error=false
    return {state,result:undefined}
   });announce()
  }
 })().finally(()=>active.delete(key));active.set(key,promise);return promise
}

export async function rememberOnlineAttendance(backend:string,actorId:string,row:any){
 if(!row?.id)return
 await transaction(backend,actorId,true,state=>{
  if(!state||state.events.length||row.staffId!==state.preparation.staffId)return {state,result:undefined}
  state.preparation.attendance=[row,...state.preparation.attendance.filter(record=>record.id!==row.id)]
  return {state,result:undefined}
 });announce()
}
export async function localTodayAttendance(backend:string,actorId:string){
 const state=await attendanceState(backend,actorId)
 if(!state?.ready)throw Error('offlineAttendance.notPrepared')
 const day=(value:string)=>new Date(Date.parse(value)+7*3600000).toISOString().slice(0,10),today=day(new Date().toISOString())
 return {code:200,data:state.attendance.find((row:any)=>!row.checkOutTime)||state.attendance.find((row:any)=>day(row.checkInTime)===today)||null,offline:true}
}
