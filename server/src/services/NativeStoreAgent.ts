import {storeOperationsGuide} from './StoreOperationsGuides'
import {backendOperation} from './ManagementBackendRegistry'
import {nativeChannelAdmission} from './NativeStoreQueue'
import {createHash,randomUUID,randomBytes} from 'node:crypto'
import {z} from 'zod'
import {Router,json as jsonBody} from 'express'
import {readTeam,writeTeam,lockTeam,teamCommunication,TeamError} from './TeamCommunicationService'
import {readCommunicationScope} from './teamAgentBridge/confidentiality'
import {reserveBackendOperation,executeBackendTool,NativeBackendPrincipal} from './teamAgentBridge/employeeBackendTool'
import {employeeNativeReply} from './teamAgentBridge/employeeNativeReply'
import {bindNativeBackendAgent,bindNativeBackendPublication} from './ManagementBackendIdentity'
import {userAccessV2} from './StaffPermissionV2Service'
import {assignedStaffAccess} from './StaffPermissionService'
import {hasManagementAccess} from '../utils/managementAccess'
import {HermesNativeClient} from './HermesNativeClient'
import {openNativeSubscribedResponse} from './TeamAiService'
import {accountFile,storeNativeDownload} from './NativeBackendFiles'
import fs from 'node:fs/promises'
import type {CommunicationScope} from './teamAgentBridge/contract'

const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const prefix='nativeAgent.job.'
export interface NativeStoreConfig {storeId:string;agentId:string;gatewayOrigin:string;gatewayKey:string;backendOrigin:string}
type NativeJob={id:string;storeId:string;channelId:string;sourceSeq:number;messageId:string;requesterStaffId:string;sourceHash:string;publicObjective?:any;authorizationChannelId?:string;sourceAudienceHash?:string;parentJobId?:string;audienceHash?:string;profileKey?:string;scope?:CommunicationScope;principal?:NativeBackendPrincipal;state:string;createdAt:string;updatedAt:string;sessionId?:string;runId?:string;input?:any;callbackCredentialHash?:string;providerCredentialHash?:string;credentials?:never;fault?:string;outputMessageId?:string;outputFileId?:string;model?:string;pollLeaseUntil?:number;pollToken?:string;nextAttemptAt?:number;failureMessageId?:string;statusMessageId?:string;lastPollFault?:string}
const atomic=(tx:any)=>new Proxy(tx,{get(target,key){return key==='$transaction'?async(fn:any)=>fn(atomic(target)):typeof target[key]==='function'?target[key].bind(target):target[key]}})
const channelLease=(id:string)=>'nativeAgent.channel.'+id
const stamp=()=>new Date().toISOString()
const jobKey=(id:string)=>prefix+id
const taskId=(s:string)=>{const h=digest(s);return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32)}

export function createNativeStoreAgent(db:any,cfg:NativeStoreConfig){
 const gateway=(profile?:string)=>new HermesNativeClient(cfg.gatewayOrigin,cfg.gatewayKey,profile)
 const read=(id:string,tx=db)=>readTeam<NativeJob>(tx,cfg.storeId,jobKey(id))
 const save=(job:NativeJob,tx=db)=>{job.updatedAt=stamp();return writeTeam(tx,cfg.storeId,jobKey(job.id),job)}
 async function current(job:NativeJob,tx=db){
  const settings=await readTeam<any>(tx,cfg.storeId,'ai.agent.settings')
  if(!settings?.enabled)throw Error('NATIVE_AGENT_DISABLED')
  const staff=await tx.staff.findFirst({where:{id:job.requesterStaffId,storeId:cfg.storeId,status:'active'},include:{user:true}}),user=staff?.user
  if(!user||user.storeId!==cfg.storeId||!['admin','manager','cashier','staff'].includes(user.role))throw Error('NATIVE_ACCOUNT_UNAVAILABLE')
  const actor:any={id:user.id,phone:user.phone||'',role:user.role,storeId:cfg.storeId,staffId:staff.id,issuedAtMs:Date.now()}
  actor.accessRole=await userAccessV2(actor,tx)||await assignedStaffAccess(actor,tx);actor.employeeApp=!hasManagementAccess(actor.role,actor.accessRole)
  const channel=await readTeam<any>(tx,cfg.storeId,'channel.'+job.channelId)
  if(!channel||channel.archived||!channel.members.some((m:any)=>m.staffId===staff.id))throw Error('NATIVE_CHANNEL_UNAVAILABLE')
  const sourceChannel=job.authorizationChannelId?await readTeam<any>(tx,cfg.storeId,'channel.'+job.authorizationChannelId):channel
  if(!sourceChannel||sourceChannel.archived||!sourceChannel.members.some((m:any)=>m.staffId===staff.id)||job.sourceAudienceHash&&digest(sourceChannel.members)!==job.sourceAudienceHash)throw Error('NATIVE_CONTEXT_CHANGED')
  const enrollment=await nativeChannelAdmission(tx,cfg.storeId,channel,cfg.agentId)
  if(!enrollment||!job.authorizationChannelId&&job.sourceSeq<enrollment.fromSeq)throw Error('NATIVE_CONTEXT_CHANGED')
  if(job.audienceHash&&digest(channel.members)!==job.audienceHash)throw Error('NATIVE_CONTEXT_CHANGED')
  if(job.publicObjective?.message){
   const ref=job.publicObjective.message,m=await readTeam<any>(tx,cfg.storeId,'message.'+channel.id+'.'+String(ref.seq).padStart(12,'0'))
   if(!m||channel.members.some((member:any)=>m.seq<member.fromSeq)||digest({id:m.id,seq:m.seq,text:m.text,files:m.files||[]})!==ref.hash)throw Error('NATIVE_CONTEXT_CHANGED')
  }

  if(sourceChannel.members.some((m:any)=>job.sourceSeq<m.fromSeq))throw Error('NATIVE_CONTEXT_CHANGED')
  const source=await readTeam<any>(tx,cfg.storeId,'message.'+sourceChannel.id+'.'+String(job.sourceSeq).padStart(12,'0'))
  if(!source||source.agent||source.ai||source.id!==job.messageId||source.authorId!==staff.id||digest({id:source.id,seq:source.seq,authorId:source.authorId,text:source.text,files:source.files||[]})!==job.sourceHash)throw Error('NATIVE_SOURCE_CHANGED')
  // This is runtime metadata, not a second authorization or expiring business grant.
  const principal:NativeBackendPrincipal={agentId:cfg.agentId,displayName:settings.agentName||'Hermes AI',storeId:cfg.storeId,version:1,clientRevision:1}
  const task={taskId:taskId([cfg.storeId,cfg.agentId,channel.id].join(':')),version:1}
  const scope=await readCommunicationScope(tx,principal,task,channel,staff.id)
  if(job.scope&&job.scope.compartmentKey!==scope.compartmentKey)throw Error('NATIVE_CONTEXT_CHANGED')
  return {actor,principal,scope,source,channel,settings}
 }
 async function admission(job:NativeJob){
  const c=await current(job),profileKey=digest([cfg.storeId,c.actor.id,c.scope.compartmentKey]),sessionId='store_'+profileKey
  const ai=await readTeam<any>(db,cfg.storeId,'ai.settings')
  if(!ai?.enabled||ai.provider!=='minimax'||!ai.model)throw Error('NATIVE_PROVIDER_UNAVAILABLE')
  const callbackCredential=randomBytes(48).toString('base64url'),providerCredential=randomBytes(48).toString('base64url')
  const input={clock:{asOf:stamp(),timeZone:'Asia/Jakarta'},currentRequest:job.publicObjective?{workOrderId:job.id,objective:job.publicObjective,files:job.publicObjective.message?.files||[]}:{messageId:c.source.id,seq:c.source.seq,text:c.source.text,files:c.source.files||[]},store:{id:cfg.storeId},account:{role:c.actor.role},context:{channelId:c.channel.id,cleanHandoff:!!job.authorizationChannelId},instructions:'You are the single store operations agent Hermes. Read and use your store-operations skill; it supplies professional routines, not additional permissions. Use native store operations and actual receipts; distinguish completed actions from independent acceptance. Handle only the current request, not historical unfinished requests. For a clean handoff, the work order contains only a registered native operation and approved public operating guidance or a target-visible source message. The private manager instruction, parent history, memory and attachments were not transferred. Work from these sources and target-visible facts; do not invent missing business choices. Use plain Indonesian with staff and the requested language with administrators. Never modify or deploy the store system. Do not pay, exceed budget or punish employees without owner approval. Reuse the purchased subscription only; never switch to paid fallback.'}
  Object.assign(job,{scope:c.scope,principal:c.principal,profileKey,sessionId,model:ai.model,state:'admitting',input:job.input||{input:JSON.stringify(input),session_id:sessionId},callbackCredentialHash:digest(callbackCredential),providerCredentialHash:digest(providerCredential)})
  await save(job)
  const client=gateway(profileKey)
  await client.configure({jobId:job.id,sessionKey:sessionId,model:job.model,providerBaseUrl:cfg.backendOrigin+'/api/internal/employee-hermes/native/v1',providerCredential:job.id+'.'+providerCredential,backendUrl:cfg.backendOrigin+'/api/internal/employee-hermes/native/backend',callbackCredential:job.id+'.'+callbackCredential})
  const result=await client.submit(job.input,job.id)
  job.runId=result.id||result.run_id;if(!job.runId)throw Error('NATIVE_RUN_ID_MISSING');job.state='running';await save(job)
 }
 async function deliver(job:NativeJob,text:string,kind:'result'|'status'='result'){
  const field=kind==='result'?'outputMessageId':'statusMessageId',deliveryId=kind==='result'?job.id:digest([job.id,'status'])
  await db.$transaction(async(tx:any)=>{
   await lockTeam(tx,cfg.storeId,'native-agent-delivery.'+job.id)
   const saved=await read(job.id,tx);if(saved?.[field]){job[field]=saved[field];return}
   const c=await current(job,tx)
   const native=await employeeNativeReply(tx,cfg.storeId,{ticket:{executionId:deliveryId},scope:c.scope,grant:c.principal})
   if(native){const message=await readTeam<any>(tx,cfg.storeId,'message.'+job.channelId+'.'+String(native.seq).padStart(12,'0'));if(message?.text===text){job[field]=native.messageId;await save(job,tx);return}}
   const actor:any={...c.actor};bindNativeBackendAgent(actor,{agentId:cfg.agentId,grantVersion:c.principal.version,clientRevision:1,executionId:deliveryId,name:c.principal.displayName||'Hermes',...(!job.authorizationChannelId?{replyToSeq:job.sourceSeq}:{})})
   bindNativeBackendPublication(actor,{check:async(_tx,target)=>{if(target.channelId!==job.channelId||digest(target.members)!==digest(c.channel.members))throw Error('NATIVE_OUTPUT_CONTEXT_CHANGED')}})
   const requestId=taskId('native-output:'+deliveryId)
   const result=await teamCommunication(atomic(tx)).send(actor,job.channelId,{requestId,text,files:kind==='result'&&job.outputFileId?[job.outputFileId]:[],expectedLastSeq:c.channel.lastSeq})
   job[field]=result.id;await save(job,tx)
  })
 }
 async function access(token:string,purpose:'callback'|'provider'){
  const match=/^([a-f0-9]{64})\.([A-Za-z0-9_-]{64})$/.exec(token)
  if(!match)throw Error('NATIVE_INGRESS_UNAUTHORIZED')
  const job=await read(match[1]);if(!job||!['admitting','running','waiting_children'].includes(job.state)||digest(match[2])!==job[purpose==='callback'?'callbackCredentialHash':'providerCredentialHash'])throw Error('NATIVE_INGRESS_UNAUTHORIZED')
  return {job,...await current(job)}
 }
 const router=Router();router.use('/native',jsonBody({limit:'32mb'}))
 const token=(req:any)=>/^Bearer ([^\s]+)$/.exec(req.headers.authorization||'')?.[1]||''
 const failure=(res:any,error:any)=>res.headersSent?res.end():res.status(409).json({ok:false,code:/^[A-Z0-9_]{1,100}$/.test(error?.message||'')?error.message:'NATIVE_OPERATION_UNCONFIRMED'})
 router.post('/native/backend',async(req,res)=>{try{
  const c=await access(token(req),'callback'),v=z.object({jobId:z.string(),sessionId:z.string().min(1),toolCallId:z.string().min(1),args:z.unknown()}).strict().parse(req.body)
  if(v.jobId!==c.job.id)throw Error('NATIVE_JOB_MISMATCH')
  const raw=v.args as any
  if(raw?.action==='handoff'){
   const value=z.object({action:z.literal('handoff'),targetChannelId:z.string().uuid(),operationId:z.string().min(1),guideId:z.string().optional(),targetSourceSeq:z.number().int().positive().optional()}).strict().refine(v=>!!v.guideId||!!v.targetSourceSeq).parse(raw)
   const child=await db.$transaction(async(tx:any)=>{
    const source=await current(c.job,tx),target=await readTeam<any>(tx,cfg.storeId,'channel.'+value.targetChannelId)
    if(!target||target.archived||!target.members.some((m:any)=>m.staffId===source.actor.staffId)||!await nativeChannelAdmission(tx,cfg.storeId,target,cfg.agentId,true))throw Error('NATIVE_TARGET_CHANNEL_UNAVAILABLE')
    if(target.id===source.channel.id)throw Error('NATIVE_HANDOFF_USE_NATIVE_DELEGATION')
    if(!backendOperation(value.operationId))throw Error('NATIVE_OPERATION_NOT_FOUND')
    const guide=value.guideId?storeOperationsGuide(value.guideId):undefined
    if(value.guideId&&!guide)throw Error('NATIVE_PUBLIC_GUIDE_REQUIRED')
    let message:any
    if(value.targetSourceSeq){
     const m=await readTeam<any>(tx,cfg.storeId,'message.'+target.id+'.'+String(value.targetSourceSeq).padStart(12,'0'))
     if(!m||target.members.some((member:any)=>m.seq<member.fromSeq))throw Error('NATIVE_TARGET_SOURCE_NOT_VISIBLE')
     message={id:m.id,seq:m.seq,text:m.text,files:m.files||[],hash:digest({id:m.id,seq:m.seq,text:m.text,files:m.files||[]})}
    }
    const publicObjective={operationId:value.operationId,...(guide?{guide}:{}) ,...(message?{message}:{})}

    const id=digest([c.job.id,target.id,digest(target.members),publicObjective,'clean_handoff'])
    await lockTeam(tx,cfg.storeId,'native-handoff.'+id)
    const existing=await read(id,tx);if(existing)return existing
    const authorizationChannelId=c.job.authorizationChannelId||c.job.channelId,origin=await readTeam<any>(tx,cfg.storeId,'channel.'+authorizationChannelId)
    const job:NativeJob={id,storeId:cfg.storeId,channelId:target.id,publicObjective,authorizationChannelId,sourceAudienceHash:digest(origin.members),parentJobId:c.job.id,sourceSeq:c.job.sourceSeq,messageId:c.job.messageId,requesterStaffId:c.job.requesterStaffId,sourceHash:c.job.sourceHash,audienceHash:digest(target.members),state:'queued',createdAt:stamp(),updatedAt:stamp()}
    await save(job,tx);return job
   })
   res.json({ok:true,jobId:child.id,state:child.state,parentHistoryTransferred:false,parentAttachmentsTransferred:false,businessCompleted:false});return
  }
  if(raw?.action==='handoff_status'){
   const value=z.object({action:z.literal('handoff_status'),jobId:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(raw),child=await read(value.jobId)
   if(!child)throw Error('NATIVE_HANDOFF_NOT_VISIBLE')
   const target=await readTeam<any>(db,cfg.storeId,'channel.'+child.channelId)
   const creatorPrivate=c.actor.staffId===child.requesterStaffId&&c.scope.audienceStaffIds.every(id=>id===child.requesterStaffId)
   const targetVisible=target&&!target.archived&&digest(target.members)===child.audienceHash&&c.scope.audienceStaffIds.every(id=>target.members.some((m:any)=>m.staffId===id))
   if(!creatorPrivate&&!targetVisible)throw Error('NATIVE_HANDOFF_NOT_VISIBLE')
   res.json({ok:true,jobId:child.id,state:child.state,outputMessageId:child.outputMessageId||null,fault:child.fault||null,businessCompleted:false});return
  }

  if(raw?.action==='file_read'){
   const fileId=z.string().uuid().parse(raw.fileId),authorized=await accountFile(db,c.actor,fileId,c.job.channelId)
   // A shared conversation may only ingest an attachment visible to every member.
   for(const staffId of c.scope.audienceStaffIds){
    if(staffId===c.actor.staffId)continue
    const staff=await db.staff.findFirst({where:{id:staffId,storeId:cfg.storeId,status:'active'},include:{user:true}})
    if(!staff?.user)throw Error('NATIVE_FILE_AUDIENCE_CHANGED')
    const actor:any={id:staff.user.id,role:staff.user.role,storeId:cfg.storeId,staffId,issuedAtMs:Date.now()};actor.accessRole=await userAccessV2(actor,db)||await assignedStaffAccess(actor,db);actor.employeeApp=!hasManagementAccess(actor.role,actor.accessRole)
    await accountFile(db,actor,fileId,c.job.channelId)
   }
   const bytes=await fs.readFile(authorized.filename),sha256=createHash('sha256').update(bytes).digest('hex')
   if(authorized.file.sha256&&authorized.file.sha256!==sha256)throw Error('NATIVE_FILE_CHANGED')
   res.json({ok:true,fileId,sha256,mimeType:authorized.file.type,base64:bytes.toString('base64')});return
  }
  if(raw?.action==='file_write'){
   const value=z.object({action:z.literal('file_write'),base64:z.string().max(12*1024*1024),mimeType:z.string().regex(/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/)}).strict().parse(raw)
   const bytes=Buffer.from(value.base64,'base64');if(bytes.length>8*1024*1024||bytes.toString('base64')!==value.base64)throw Error('NATIVE_ACCOUNT_UPLOAD_LIMIT')
   const file=await storeNativeDownload(db,c.actor,bytes,value.mimeType,c.job.id,'team',{staffIds:c.scope.audienceStaffIds,publicOutput:c.channel.kind==='public'});res.json({ok:true,file});return
  }
  const callId=digest([v.sessionId,v.toolCallId]),executionId=c.job.id
  const reservation=await db.$transaction(async(tx:any)=>{await lockTeam(tx,cfg.storeId,'native-backend.'+callId);return reserveBackendOperation(tx,cfg.storeId,c.scope,c.source.id,executionId,callId,v.args)})
  const publication={check:async(tx:any,target:any)=>{const fresh=await current(c.job,tx);if(target.publicOutput&&fresh.channel.kind!=='public'||target.channelId&&target.channelId!==c.job.channelId||target.members.some((m:any)=>!fresh.channel.members.some((x:any)=>x.staffId===m.staffId)))throw Error('BACKEND_TARGET_CONTEXT_REQUIRED')}}
  const result=await executeBackendTool(db,c.principal,c.scope,c.source.id,v.args,reservation,async()=>{await current(c.job)},publication)
  res.json(result)
 }catch(error){failure(res,error)}})
 router.post('/native/v1/chat/completions',async(req,res)=>{try{
  const c=await access(token(req),'provider'),body=req.body
  if(body.model!==c.job.model||!Array.isArray(body.messages))throw Error('NATIVE_SUBSCRIBED_MODEL_REQUIRED')
  const settings=await readTeam<any>(db,cfg.storeId,'ai.settings');if(!settings?.version)throw Error('NATIVE_PROVIDER_UNAVAILABLE')
  const requestId=randomUUID(),inputHash=digest(body)
  await writeTeam(db,cfg.storeId,'nativeAgent.provider.'+requestId,{jobId:c.job.id,inputHash,state:'started',createdAt:stamp()})
  const response=await openNativeSubscribedResponse(db,cfg.storeId,settings.version,body,async()=>{await current(c.job)},Date.now()+(c.settings.taskTimeoutMinutes||10)*60000)
  res.status(response.status);res.setHeader('Content-Type',response.headers.get('content-type')||'application/json');res.setHeader('Cache-Control','no-store')
  if(!response.body)throw Error('NATIVE_PROVIDER_RESPONSE_INVALID')
  const reader=response.body.getReader();let complete=false
  try{for(;;){const part=await reader.read();if(part.done){complete=true;break}res.write(Buffer.from(part.value))}res.end()}finally{reader.releaseLock();await writeTeam(db,cfg.storeId,'nativeAgent.provider.'+requestId,{jobId:c.job.id,inputHash,state:complete?'completed':'unknown',completedAt:stamp()})}

 }catch(error){failure(res,error)}})
 async function finish(job:NativeJob){
  await db.$transaction(async(tx:any)=>{await lockTeam(tx,cfg.storeId,'native-admission.'+job.channelId);await save(job,tx);const lease=await readTeam<any>(tx,cfg.storeId,channelLease(job.channelId));if(lease?.jobId===job.id)await writeTeam(tx,cfg.storeId,channelLease(job.channelId),{jobId:null,updatedAt:stamp()})})
 }
 return {router,gatewayHealth:()=>gateway().gatewayHealth(),async runBatch(limit=10){
  const rows=await db.config.findMany({where:{storeId:cfg.storeId,key:{startsWith:'team.communication.'+prefix},OR:['queued','preparing','admitting','running','waiting_children'].map(state=>({value:{contains:JSON.stringify('state')+':'+JSON.stringify(state)}}))},orderBy:{createdAt:'asc'},take:1000})
  let processed=0
  for(const row of rows){if(processed>=limit)break
   const snapshot:NativeJob=JSON.parse(row.value)
   if(!['queued','preparing','admitting','running','waiting_children'].includes(snapshot.state)||snapshot.nextAttemptAt&&snapshot.nextAttemptAt>Date.now())continue
   const job:NativeJob|undefined=await db.$transaction(async(tx:any)=>{
    await lockTeam(tx,cfg.storeId,'native-admission.'+snapshot.channelId)
    const j=await read(snapshot.id,tx);if(!j||j.pollLeaseUntil&&j.pollLeaseUntil>Date.now())return
    const lease=await readTeam<any>(tx,cfg.storeId,channelLease(j.channelId))
    if(lease?.jobId&&lease.jobId!==j.id)return
    if(!['queued','preparing','admitting','running','waiting_children'].includes(j.state))return
    j.pollToken=randomUUID();j.pollLeaseUntil=Date.now()+120000
    if(j.state==='queued')j.state='preparing'
    await writeTeam(tx,cfg.storeId,channelLease(j.channelId),{jobId:j.id,updatedAt:stamp()});await save(j,tx);return j
   })
   if(!job)continue;processed++
   try{
    if(job.state==='preparing')await admission(job)
    else if(job.state==='admitting'){
     const result=await gateway(job.profileKey).admission(job.input,job.id)
     if(result.run_id){job.runId=result.run_id;job.state='running';await save(job)}
     else if(result.state==='missing')await admission(job)
     else throw Error('NATIVE_ADMISSION_UNCONFIRMED')
    }else if(job.runId){
     await current(job);const result=await gateway(job.profileKey).status(job.runId)
     if(result.status==='completed'){
      const ready=await gateway(job.profileKey).readiness()
      if(ready.activeDelegations||(ready.blockingProcesses??ready.activeProcesses)||ready.activeRuns){job.state='waiting_children';await save(job);continue}
      let output=typeof result.output==='string'?result.output:result.output?.text
      if(!output)throw Error('NATIVE_OUTPUT_MISSING')
      if(output.length>4000){const c=await current(job);if(!job.outputFileId){const file=await storeNativeDownload(db,c.actor,Buffer.from(output),'text/plain',job.id,'team');job.outputFileId=file.id;await save(job)}output=output.slice(0,3800)+'\n\n完整回复见附件 / Jawaban lengkap ada di lampiran.'}
      await deliver(job,output);job.state='completed';await finish(job)
     }else if(['failed','cancelled','interrupted','unknown'].includes(result.status)){
      await deliver(job,'Maaf, pekerjaan ini belum selesai. Hasil yang sudah tersimpan tidak akan diulang otomatis. Pengelola dapat melihat kendalanya di tugas ini.')
      job.state=result.status;job.fault='NATIVE_RUN_'+result.status.toUpperCase();await finish(job)
     }
    }
   }catch(error:any){
    const code=/^[A-Z0-9_]{1,100}$/.test(error?.message||'')?error.message:'NATIVE_EXECUTION_UNCONFIRMED'
    job.lastPollFault=code;job.nextAttemptAt=Date.now()+15000
    // Transport failures are read/reconciled, never a reason to replay a business call.
    // Invalid source/account context is terminal and cannot publish private output.
    if(/NATIVE_(AGENT_DISABLED|ACCOUNT_UNAVAILABLE|CHANNEL_UNAVAILABLE|SOURCE_CHANGED|CONTEXT_CHANGED)/.test(code)){
     job.state='blocked';job.fault=code;await finish(job)
    }else{
     if(!job.runId&&[400,401,403].includes(error?.status)){job.state='failed';job.fault=code;await deliver(job,'Maaf, layanan Hermes belum dapat menerima pekerjaan ini. Pengelola perlu memeriksa sambungannya.');await finish(job)}
     else {await save(job);if(!job.statusMessageId&&Date.now()-Date.parse(job.createdAt)>60000)await deliver(job,'Pesan Anda sudah tersimpan. Sambungan Hermes sedang bermasalah; pekerjaan belum dinyatakan selesai. Hasil yang sudah tersimpan tidak akan diulang otomatis.','status').catch(()=>{})}
    }
   }finally{
    await db.$transaction(async(tx:any)=>{await lockTeam(tx,cfg.storeId,'native-admission.'+job.channelId);const saved=await read(job.id,tx);if(saved?.pollToken===job.pollToken){saved.pollLeaseUntil=0;delete saved.pollToken;await save(saved,tx)}})
   }
  }
  return {processed,disabled:false}
 }}
}
