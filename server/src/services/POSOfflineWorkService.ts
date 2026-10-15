import {createHash} from 'crypto'
import jwt from 'jsonwebtoken'
import {z} from 'zod'
import prisma from '../config/database'
import {config} from '../config/env'
import {POS_OFFLINE_DAYS,POS_OFFLINE_TTL_MS} from '../utils/offlinePolicy'
import {shouldGenerateOnDate,getExecutionTimes,offlineTaskId} from './HygieneService'
import {snapshotAttendance,wibDate} from './EmployeeAttendanceService'
import {writeWork} from './EmployeeWorkspaceStore'
import {uploadRoot} from '../utils/mediaFiles'
import fs from 'fs'
import path from 'path'
export const offlineTaskSchema=z.object({taskId:z.string().max(100),proof:z.string().max(100000),action:z.enum(['start','complete','skip']),note:z.string().max(2000).optional(),photoUrl:z.string().max(4000000).optional(),selfRating:z.number().int().min(1).max(5).optional(),checklistResults:z.array(z.object({checklistId:z.string(),completed:z.boolean(),note:z.string().max(1000).optional()})).max(200).optional()}).strict()
export const offlineAttendanceSchema=z.object({type:z.enum(['check_in','check_out']),attendanceId:z.string().max(100).optional()}).strict()
export async function offlineWorkSnapshot(actor:{id:string;role?:string;accessRole?:any;staffId?:string;storeId:string},db:any=prisma){
 const now=Date.now(),day=wibDate(new Date(now)),last=wibDate(new Date(now+POS_OFFLINE_TTL_MS)),staffId=actor.staffId
 if(!staffId)throw Error('OFFLINE_WORK_STAFF_REQUIRED')
 const allowed=(key:string)=>actor.role==='admin'||!actor.accessRole||(actor.accessRole.version===2?actor.accessRole.modes?.[key]==='allow':actor.accessRole.permissions?.includes(key))
 const [existing,templates,schedules,attendance]=await Promise.all([
  db.hygieneTask.findMany({where:{storeId:actor.storeId,staffId,date:{gte:wibDate(new Date(now-30*86400000)),lte:last}},include:{template:{include:{checklists:true}}}}),
  db.hygieneTemplate.findMany({where:{storeId:actor.storeId,status:'active',autoGenerate:true},include:{checklists:true}}),
  db.schedule.findMany({where:{staffId,date:{gte:new Date(day+'T00:00:00+07:00'),lte:new Date(last+'T23:59:59+07:00')},status:{in:['scheduled','confirmed','completed']}}}),
  db.attendance.findMany({where:{staffId,OR:[{checkInTime:{gte:new Date(now-POS_OFFLINE_TTL_MS)}},{checkOutTime:null}]},orderBy:{checkInTime:'desc'},take:200})
 ])
 const tasks:any[]=[...existing]
 for(let offset=0;offset<=POS_OFFLINE_DAYS;offset++){
  const date=wibDate(new Date(now+offset*86400000))
  for(const template of templates){
   if(!shouldGenerateOnDate(template,date))continue
   let ids:string[]=[];try{ids=JSON.parse(template.staffIds||'[]')}catch{}
   const assigned=ids.length?ids.includes(staffId):template.assignedType==='staff'?template.staffId===staffId:template.assignedType==='area'?template.areaManagerId===staffId:template.assignedType==='shift'&&schedules.some((s:any)=>wibDate(s.date)===date&&s.shift===template.shift)
   if(!assigned)continue
   for(const [executionIndex,time]of getExecutionTimes(template).entries()){
    if(tasks.some(t=>t.templateId===template.id&&t.date===date&&t.executionIndex===executionIndex))continue
    tasks.push({id:offlineTaskId(template.id,staffId,date,executionIndex),storeId:actor.storeId,staffId,templateId:template.id,areaCode:template.areaCode,name:template.name,date,time,priority:template.priority,status:'pending',executionIndex,dueTime:new Date(new Date(date+'T'+time+':00+07:00').getTime()+(template.estimatedMinutes||10)*60000),template})
   }
  }
 }
 const receipts=await db.config.findMany({where:{storeId:actor.storeId,category:'pos_offline_operation'},select:{key:true,value:true}})
 const includedOfflineOperationIds=receipts.filter((row:any)=>{const o=JSON.parse(row.value);return ['task','attendance'].includes(o.kind)&&o.result?.staffId===staffId}).map((row:any)=>row.key.slice('pos.offline.operation:'.length))
 return {includedOfflineOperationIds,actorId:actor.id,issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+POS_OFFLINE_TTL_MS).toISOString(),attendance:allowed('personal.attendance')?attendance:[],tasks:(allowed('personal.tasks')?tasks:[]).map(original=>{const task={...original,template:original.template?Object.fromEntries(['id','name','photoRequired','evidenceType','requiresApproval','checklists','estimatedMinutes','standardBefore','standardDuring','standardAfter'].map(key=>[key,original.template[key]])):null};return ({...task,photoRequired:task.template?.photoRequired||false,requiresApproval:task.template?.requiresApproval||false,standardBefore:task.template?.standardBefore,standardDuring:task.template?.standardDuring,standardAfter:task.template?.standardAfter,proof:jwt.sign({purpose:'pos-offline-task',actorId:actor.id,storeId:actor.storeId,staffId,issuedAt:now,task},config.jwt.secret,{audience:'pos-offline-work',expiresIn:`${POS_OFFLINE_DAYS}d`})})})}
}
export async function applyOfflineWork(tx:any,storeId:string,input:any,actor:any){
 const at=new Date(input.occurredAt),data=input.data,staffId=actor.staffId
 if(!staffId)throw Error('OFFLINE_WORK_STAFF_REQUIRED')
 if(input.kind==='attendance'){
  if(data.type==='check_in'){
   const open=await tx.attendance.findFirst({where:{staffId,checkOutTime:null}})
   if(open)throw Error('OFFLINE_ATTENDANCE_ALREADY_OPEN')
   const day=wibDate(at),duplicate=await tx.attendance.findFirst({where:{staffId,checkInTime:{gte:new Date(day+'T00:00:00+07:00'),lt:new Date(new Date(day+'T00:00:00+07:00').getTime()+86400000)}}})
   if(duplicate)throw Error('OFFLINE_ATTENDANCE_ALREADY_RECORDED')
   const attendance=await tx.attendance.create({data:{id:'POSATT-'+input.id,staffId,checkInTime:at,createdAt:at,status:'pending_review',gpsLocation:'POS:offline',note:'Original offline POS clock-in'}})
   const snapshot=await snapshotAttendance(attendance,storeId,tx);await writeWork(storeId,`attendance.${staffId}.${attendance.id}`,{...snapshot,recordedAt:at.toISOString()},tx)
   return tx.attendance.findUniqueOrThrow({where:{id:attendance.id}})
  }
  const row=await tx.attendance.findFirst({where:{id:data.attendanceId,staffId,checkOutTime:null}})
  if(!row||at<row.checkInTime)throw Error('OFFLINE_ATTENDANCE_STATE_CHANGED')
  return tx.attendance.update({where:{id:row.id},data:{checkOutTime:at}})
 }
 let proof:any;try{proof=jwt.verify(data.proof,config.jwt.secret,{audience:'pos-offline-work',clockTimestamp:Math.floor(at.getTime()/1000)})}catch{throw Error('OFFLINE_TASK_PROOF_INVALID')}
 const prepared=proof.task
 if(proof.purpose!=='pos-offline-task'||proof.storeId!==storeId||proof.actorId!==actor.id||proof.staffId!==staffId||proof.issuedAt>at.getTime()+1000||prepared?.id!==data.taskId||prepared.staffId!==staffId||prepared.date>wibDate(at))throw Error('OFFLINE_TASK_PROOF_INVALID')
 let task=await tx.hygieneTask.findUnique({where:{id:data.taskId}})
 if(!task&&data.taskId.startsWith('POSHT-')){
  task=await tx.hygieneTask.findFirst({where:{storeId,staffId,templateId:prepared.templateId,date:prepared.date,executionIndex:prepared.executionIndex}})
  if(!task)task=await tx.hygieneTask.create({data:{id:prepared.id,storeId,staffId,templateId:prepared.templateId,areaCode:prepared.areaCode,name:prepared.name,date:prepared.date,time:prepared.time,priority:prepared.priority,executionIndex:prepared.executionIndex,status:'pending',dueTime:prepared.dueTime?new Date(prepared.dueTime):null}})
 }
 if(!task||task.storeId!==storeId||task.staffId!==staffId)throw Error('OFFLINE_TASK_STATE_CHANGED')
 let update:any
 if(data.action==='start'){
  if(!['pending','overdue'].includes(task.status))throw Error('OFFLINE_TASK_STATE_CHANGED')
  update={status:'in_progress',startedAt:at}
 }else if(data.action==='skip'){
  if(!['pending','overdue','in_progress'].includes(task.status)||!data.note?.trim())throw Error('OFFLINE_TASK_STATE_CHANGED')
  update={status:'skipped',note:data.note,completedBy:staffId,completedAt:at}
 }else{
  if(task.status!=='in_progress')throw Error('OFFLINE_TASK_STATE_CHANGED')
  const rules=prepared.template
  if(rules?.checklists?.some((c:any)=>c.isRequired&&!data.checklistResults?.some((r:any)=>r.checklistId===c.id&&r.completed)))throw Error('OFFLINE_TASK_CHECKLIST_REQUIRED')
  if(rules?.photoRequired&&!data.photoUrl)throw Error('OFFLINE_TASK_PHOTO_REQUIRED')
  let photoUrl=data.photoUrl
  if(photoUrl?.startsWith('data:')){
   const match=/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(photoUrl)
   if(!match)throw Error('OFFLINE_TASK_PHOTO_INVALID')
   const bytes=Buffer.from(match[2],'base64')
   if(bytes.length>2500000||!(match[1]==='png'?bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a':bytes[0]===255&&bytes[1]===216&&bytes[2]===255))throw Error('OFFLINE_TASK_PHOTO_INVALID')
   const folder=path.join(uploadRoot,'attachments');await fs.promises.mkdir(folder,{recursive:true})
   const name='pos-task-'+input.id+'-'+createHash('sha256').update(bytes).digest('hex').slice(0,16)+'.'+(match[1]==='jpeg'?'jpg':'png')
   await fs.promises.writeFile(path.join(folder,name),bytes);photoUrl='/uploads/attachments/'+name
  }
  update={status:rules?.requiresApproval?'pending_approval':'completed',completedAt:at,completedBy:staffId,note:data.note,selfRating:data.selfRating,photoUrl,actualMinutes:task.startedAt?Math.max(0,Math.round((at.getTime()-task.startedAt.getTime())/60000)):null}
 }
 const result=await tx.hygieneTask.update({where:{id:task.id},data:update})
 await tx.hygieneTaskLog.create({data:{taskId:task.id,performedBy:staffId,action:data.action==='start'?'started':data.action==='skip'?'skipped':'completed',photoUrl:update.photoUrl,note:JSON.stringify({source:'offline_pos',note:data.note,checklistResults:data.checklistResults}),createdAt:at}})
 return result
}
