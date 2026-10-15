import {db} from '../db/offline'
import {readBackendAuth} from './backendIdentity'
import {localIdentity} from './offlineSale'
import {offlineOperations,createOfflineWorkOperation} from './offlineOperations'
const workKey=()=>{const a=readBackendAuth();return `offline.work:${encodeURIComponent(localIdentity(a.user!.storeId!))}:${a.user!.storeId}:${a.user!.id}`}
export async function prepareOfflineWork(request:()=>Promise<any>){
 const a=readBackendAuth(),key=workKey(),ops=await offlineOperations(a.user!.storeId!)
 if(ops.some(o=>o.actorId===a.user!.id&&['task','attendance'].includes(o.kind)&&o.status!=='synced'))return
 const old=await db.config.get(key);if(old&&Date.now()-new Date(old.updatedAt).getTime()<5*60000)return
 const response=await request(),value=response.data?.data
 if(value?.actorId!==a.user!.id||!Array.isArray(value.tasks)||!Array.isArray(value.attendance))throw Error('OFFLINE_WORK_UNAVAILABLE')
 if(workKey()!==key)throw Error('CHECKOUT_AUTH_CHANGED')
 await db.config.put({key,value,updatedAt:new Date()})
}
export async function offlineWorkState(){
 const a=readBackendAuth(),key=workKey(),row=await db.config.get(key),value=structuredClone(row?.value)
 if(!value||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=Date.now()||Date.parse(value.issuedAt)>Date.now())throw Error('OFFLINE_WORK_UNAVAILABLE')
 const included=new Set(value.includedOfflineOperationIds||[]),ops=(await offlineOperations(a.user!.storeId!)).filter(o=>o.actorId===a.user!.id&&!included.has(o.id))
 for(const op of ops){
  if(op.kind==='task'){
   const task=value.tasks.find((t:any)=>t.id===op.data.taskId);if(!task)throw Error('OFFLINE_WORK_UNAVAILABLE')
   if(op.data.action==='start')Object.assign(task,{status:'in_progress',startedAt:op.occurredAt})
   else Object.assign(task,{status:op.data.action==='skip'?'skipped':task.requiresApproval?'pending_approval':'completed',completedAt:op.occurredAt,photoUrl:op.data.photoUrl,note:op.data.note})
  }else if(op.kind==='attendance'){
   if(op.data.type==='check_in')value.attendance.unshift({id:'POSATT-'+op.id,staffId:a.user!.staff?.id,checkInTime:op.occurredAt,status:'pending_review',offline:true})
   else{const attendance=value.attendance.find((r:any)=>r.id===op.data.attendanceId);if(!attendance)throw Error('OFFLINE_ATTENDANCE_STATE_CHANGED');attendance.checkOutTime=op.occurredAt}
  }
 }
 return value
}
export async function workOperationPayload(kind:'task'|'attendance',data:any){
 const state=await offlineWorkState(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 if(kind==='attendance'){
  const open=state.attendance.find((r:any)=>!r.checkOutTime)
  if(data.type==='check_out'){if(!open)throw Error('OFFLINE_ATTENDANCE_STATE_CHANGED');return {type:'check_out',attendanceId:open.id}}
  if(data.type!=='check_in'||open||state.attendance.some((r:any)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(r.checkInTime))===day))throw Error('OFFLINE_ATTENDANCE_ALREADY_RECORDED')
  return {type:'check_in'}
 }
 const task=state.tasks.find((t:any)=>t.id===data.taskId)
 if(!task||task.date>day||!task.proof)throw Error('OFFLINE_TASK_PROOF_INVALID')
 if(data.action==='start'&&!['pending','overdue'].includes(task.status)||data.action==='complete'&&task.status!=='in_progress'||data.action==='skip'&&!['pending','overdue','in_progress'].includes(task.status))throw Error('OFFLINE_TASK_STATE_CHANGED')
 if(data.action==='skip'&&!data.note?.trim())throw Error('OFFLINE_TASK_NOTE_REQUIRED')
 if(data.action==='complete'){
  if(task.template?.checklists?.some((c:any)=>c.isRequired&&!data.checklistResults?.some((r:any)=>r.checklistId===c.id&&r.completed)))throw Error('OFFLINE_TASK_CHECKLIST_REQUIRED')
  if(task.photoRequired&&!data.photoUrl)throw Error('OFFLINE_TASK_PHOTO_REQUIRED')
 }
 return {...data,proof:task.proof}
}
export async function offlineTasks(date?:string,overdue=false){
 const state=await offlineWorkState(),now=Date.now()
 return {data:{code:200,data:{list:state.tasks.filter((t:any)=>overdue?new Date(t.dueTime).getTime()<now&&!['completed','approved','skipped','rejected','pending_approval'].includes(t.status):!date||t.date===date)},offline:true}}
}
export const mutateOfflineTask=(id:string,action:string,data:any={})=>createOfflineWorkOperation('task',{taskId:id,action,...data})
export const recordOfflineAttendance=(type:'check_in'|'check_out')=>createOfflineWorkOperation('attendance',{type})
export async function localTaskPhoto(file:File){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20000000)throw Error('OFFLINE_TASK_PHOTO_INVALID')
 const image=await createImageBitmap(file)
 let url:string
 try{const scale=Math.min(1,1600/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const context=canvas.getContext('2d');if(!context)throw Error('OFFLINE_TASK_PHOTO_INVALID');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);url=canvas.toDataURL('image/jpeg',0.82)}finally{image.close()}
 if(url.length>3300000)throw Error('OFFLINE_TASK_PHOTO_INVALID')
 return {data:{code:201,data:{url,urls:[url]},offline:true}}
}
