import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID,createHash } from 'node:crypto'
import { z } from 'zod'
import { readWork,writeWork } from './EmployeeWorkspaceStore'
import {TeamError} from './TeamError'
import type { AuthUser } from '../middlewares/auth'

const privateRoot=()=>path.resolve(process.env.UPLOADS_PATH||path.resolve(__dirname,'../../uploads'),'.employee-private')
/** Shared by the normal account file route and native Agent transport. */
export async function accountFile(db:any,actor:AuthUser,id:string,channelId?:string,auditReason?:string){
 z.string().uuid().parse(id)
 const {isTeamAttachment,teamCommunication}=await import('./TeamCommunicationService.js')
 const stored=await readWork<any>(actor.storeId,'file.'+id,db)
 let file=stored
 if(stored&&await isTeamAttachment(db,actor.storeId,id,stored)){
  const posted=await db.config.findFirst({where:{storeId:actor.storeId,key:{startsWith:'team.communication.fileGrant.',contains:'.'+id+'.'}},select:{id:true}})
  if(stored.staffId!==actor.staffId||posted){
   if(!channelId)throw new TeamError(403,'TEAM_CHANNEL_REQUIRED')
   file=await teamCommunication(db).attachment(actor as any,z.string().uuid().parse(channelId),id,auditReason)
  }
 }else if(!stored||(actor.role!=='admin'&&stored.staffId!==actor.staffId))throw new TeamError(403,'FILE_FORBIDDEN')
 const filename=path.join(await fs.realpath(privateRoot()),id),stat=await fs.lstat(filename)
 if(!stat.isFile()||stat.isSymbolicLink()||await fs.realpath(filename)!==filename)throw new TeamError(403,'FILE_FORBIDDEN')
 return {file,filename}
}
/** Native downloads remain private account files, never public media URLs. */
export async function storeNativeDownload(db:any,actor:AuthUser,bytes:Buffer,type:string,operationId:string,purpose:'native_backend'|'team'='native_backend'){
 if(!actor.staffId)throw new TeamError(403,'STAFF_IDENTITY_REQUIRED')
 const id=randomUUID(),sha256=createHash('sha256').update(bytes).digest('hex'),root=privateRoot()
 await fs.mkdir(root,{recursive:true})
 const target=path.join(root,id)
 await fs.writeFile(target,bytes,{flag:'wx',mode:0o600})
 try{await writeWork(actor.storeId,'file.'+id,{id,staffId:actor.staffId,purpose,type,sha256,size:bytes.length,operationId,createdAt:new Date().toISOString()},db)}catch(error){await fs.unlink(target).catch(()=>{});throw error}
 return {id,url:'/api/staff-work/files/'+id,type,size:bytes.length,sha256,access:'authenticated_account'}
}
export const nativeFileInput=z.object({field:z.string().min(1).max(100),fileId:z.string().uuid(),channelId:z.string().uuid().optional(),auditReason:z.string().min(5).max(500).optional()}).strict()
export async function nativeMultipart(db:any,actor:AuthUser,body:any,files:z.infer<typeof nativeFileInput>[]){
 const boundary='youme-native-'+randomUUID(),parts:Buffer[]=[]
 const add=(s:string)=>parts.push(Buffer.from(s))
 for(const [name,value]of Object.entries(body||{})){
  if(/[\r\n"\\]/.test(name))throw Error('BACKEND_FORM_FIELD_INVALID')
  add('--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"\r\n\r\n'+(typeof value==='string'?value:JSON.stringify(value))+'\r\n')
 }
 for(const raw of files){
  const item=nativeFileInput.parse(raw)
  if(/[\r\n"\\]/.test(item.field))throw Error('BACKEND_FORM_FIELD_INVALID')
  const {file,filename}=await accountFile(db,actor,item.fileId,item.channelId,item.auditReason)
  const mime=String(file.type||'application/octet-stream')
  if(!/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/.test(mime))throw Error('BACKEND_FILE_TYPE_INVALID')
  const ext:Record<string,string>={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','application/pdf':'.pdf','text/csv':'.csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'.xlsx'}
  add('--'+boundary+'\r\nContent-Disposition: form-data; name="'+item.field+'"; filename="'+item.fileId+(ext[mime]||'')+'"\r\nContent-Type: '+mime+'\r\n\r\n')
  const bytes=await fs.readFile(filename)
  if(file.sha256&&createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('BACKEND_FILE_CHANGED')
  parts.push(bytes);add('\r\n')
 }
 add('--'+boundary+'--\r\n')
 return {bytes:Buffer.concat(parts),contentType:'multipart/form-data; boundary='+boundary}
}
