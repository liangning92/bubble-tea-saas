import {createHash} from 'crypto'
import jwt from 'jsonwebtoken'
import {z} from 'zod'
import prisma from '../config/database'
import {config} from '../config/env'
import {POS_OFFLINE_TTL_MS} from '../utils/offlinePolicy'
import {attendanceQRHashes,verifyAttendanceQR} from './AttendanceQRService'
import {createEmployeeAttendance} from './EmployeeAttendanceService'
import {workLock,readWork,writeWork} from './EmployeeWorkspaceStore'

const audience='employee-offline-attendance'
export class EmployeeOfflineAttendanceError extends Error { constructor(message:string,public status=409){super(message)} }
export const employeeAttendanceInput=z.object({id:z.string().uuid(),authorization:z.string().max(10000),occurredAt:z.string().datetime(),qrData:z.string().min(1).max(2000),type:z.enum(['check_in','check_out']),attendanceId:z.string().max(100).optional()}).strict()
export async function prepareEmployeeOfflineAttendance(actor:{id:string;storeId:string}){
 const user=await prisma.user.findUnique({where:{id:actor.id},include:{staff:true}})
 if(!user?.staff||user.staff.status!=='active'||user.staff.storeId!==actor.storeId)throw new EmployeeOfflineAttendanceError('EMPLOYEE_OFFLINE_STAFF_REQUIRED',403)
 const now=Date.now(),expiresAt=now+POS_OFFLINE_TTL_MS
 const authorization=jwt.sign({actorId:user.id,staffId:user.staff.id,storeId:actor.storeId,role:user.role,issuedAt:now,purpose:audience},config.jwt.secret,{audience,expiresIn:'30d'})
 const attendance=await prisma.attendance.findMany({where:{staffId:user.staff.id,OR:[{checkInTime:{gte:new Date(now-POS_OFFLINE_TTL_MS)}},{checkOutTime:null}]},orderBy:{checkInTime:'desc'},take:200})
 return {...attendanceQRHashes(actor.storeId,actor.storeId,now),actorId:user.id,staffId:user.staff.id,expiresAt,authorization,attendance}
}
export async function syncEmployeeOfflineAttendance(body:unknown){
 const input=employeeAttendanceInput.parse(body),at=Date.parse(input.occurredAt)
 if(at>Date.now()+60000)throw new EmployeeOfflineAttendanceError('EMPLOYEE_OFFLINE_CLOCK_INVALID',400)
 let grant:any
 try{grant=jwt.verify(input.authorization,config.jwt.secret,{audience,clockTimestamp:Math.floor(at/1000),clockTolerance:1})}catch{throw new EmployeeOfflineAttendanceError('EMPLOYEE_OFFLINE_AUTHORIZATION_INVALID',403)}
 if(grant.purpose!==audience||!grant.actorId||!grant.staffId||!grant.storeId||!Number.isFinite(grant.issuedAt)||at<grant.issuedAt||at>=grant.issuedAt+POS_OFFLINE_TTL_MS)throw new EmployeeOfflineAttendanceError('EMPLOYEE_OFFLINE_AUTHORIZATION_INVALID',403)
 try{verifyAttendanceQR(input.qrData,grant.storeId,at)}catch{throw new EmployeeOfflineAttendanceError('ATTENDANCE_QR_INVALID',400)}
 const fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex'),key='employee.offline.attendance:'+input.id
 const apply=()=>prisma.$transaction(async tx=>{
  await workLock(grant.storeId,'offline-attendance.'+grant.staffId,tx)
  const saved=await tx.config.findUnique({where:{storeId_key:{storeId:grant.storeId,key}}})
  if(saved){const receipt=JSON.parse(saved.value);if(receipt.actorId!==grant.actorId||receipt.fingerprint!==fingerprint)throw new EmployeeOfflineAttendanceError('EMPLOYEE_OFFLINE_CONFLICT');return receipt.result}
  const user=await tx.user.findUnique({where:{id:grant.actorId},include:{staff:true}})
  if(!user?.staff||user.staff.status!=='active'||user.staff.id!==grant.staffId||user.staff.storeId!==grant.storeId||user.role!==grant.role||user.updatedAt.getTime()>grant.issuedAt)throw new EmployeeOfflineAttendanceError('EMPLOYEE_OFFLINE_AUTHORIZATION_REVOKED',403)
  const when=new Date(at),payload=verifyAttendanceQR(input.qrData,grant.storeId,at)
  const proof={gpsLocation:'POS:'+payload.p,note:`Offline employee QR ${input.type}; original ${input.occurredAt}`}
  let attendance:any
  if(input.type==='check_in'){
   if(await tx.attendance.findFirst({where:{staffId:user.staff.id,checkOutTime:null}}))throw new EmployeeOfflineAttendanceError('EMPLOYEE_OFFLINE_ALREADY_OPEN')
   attendance=await createEmployeeAttendance({id:'POSATT-'+input.id,staffId:user.staff.id,checkInTime:when,createdAt:when,status:'pending_review',...proof},grant.storeId,tx)
   if(attendance.id!=='POSATT-'+input.id)throw new EmployeeOfflineAttendanceError('EMPLOYEE_OFFLINE_ALREADY_RECORDED')
   const snapshot=await readWork(grant.storeId,`attendance.${user.staff.id}.${attendance.id}`,tx)
   if(snapshot)await writeWork(grant.storeId,`attendance.${user.staff.id}.${attendance.id}`,{...snapshot,recordedAt:input.occurredAt},tx)
  }else{
   const old=await tx.attendance.findFirst({where:{id:input.attendanceId||'',staffId:user.staff.id,checkOutTime:null}})
   if(!old||when<old.checkInTime)throw new EmployeeOfflineAttendanceError('EMPLOYEE_OFFLINE_ATTENDANCE_CHANGED')
   attendance=await tx.attendance.update({where:{id:old.id},data:{checkOutTime:when,...proof}})
  }
  const result={operationId:input.id,attendance}
  await tx.config.create({data:{storeId:grant.storeId,key,category:'employee_offline_attendance',value:JSON.stringify({actorId:user.id,fingerprint,result})}})
  return result
 },{isolationLevel:'Serializable',maxWait:5000,timeout:20000})
 for(let attempt=0;;attempt++){try{return await apply()}catch(error){if(attempt>=2||!['P2034','P2002'].includes((error as any)?.code))throw error}}
}
