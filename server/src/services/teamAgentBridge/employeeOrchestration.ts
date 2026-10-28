import { sendEmployeeFailureReply } from './employeeFailureReply'
import { employeeGrantAuthority } from './employeeGrantAuthority'
import { createHash } from 'crypto'
import { TeamError, TeamTask, lockTeam, readTeam, writeTeam } from '../TeamCommunicationService'
import { grantSchema } from './contract'
import { readCommunicationScope } from './confidentiality'
import { readAuthorizedBridgeChannel } from './directDelegation'
import { employeeRouteKey, employeeGrantKey, employeeRouteSchema } from './employeeIntake'
import { createEmployeeContinuation, EmployeeContinuationEvent, EmployeeContinuationReservation } from './employeeContinuation'
import { createTeamAgentBridge } from './service'
import type { EmployeeRuntimeHostPort, EmployeeRuntimeTicket } from './employeeRuntimeContract'
import type { EmployeeGatewayEnvelope, EmployeeGatewayReceipt } from './employeeGatewayClient'
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const pendingPrefix='externalAgent.teamBridge.v1.employeePending.'
const mappingKey=(id:string)=>'employeeOrchestration.mapping.'+id
const reportKey=(id:string)=>'employeeOrchestration.report.'+id
const questionContextKey=(channelId:string)=>'employeeOrchestration.questionContext.'+channelId
const fail=(code:string):never=>{throw new TeamError(409,code)}
export interface EmployeeOrchestrationDependencies {
  enabled?:boolean;storeId:string;now?:()=>number
  runtime:{host:EmployeeRuntimeHostPort}
  gateway:{start(envelope:EmployeeGatewayEnvelope):Promise<EmployeeGatewayReceipt|{executionId:string;state:'admission_unknown'}>;get?(executionId:string):Promise<EmployeeGatewayReceipt>}
  /** Trusted issuer: execution-scoped credentials expire no later than supplied
   * absolute deadline. No credentials are stored in this module's Config rows. */
  issueCredentials(ticket:EmployeeRuntimeTicket,scope:{expiresAt:string;reservationId:string}):Promise<{callbackCredential:string;providerCredential:string}>
}
/** Default-off glue called by the existing worker: no timer, enrollment, or new
 * task database. Native TeamTask and persistent continuation are authoritative. */
export function createEmployeeOrchestration(db:any,deps:EmployeeOrchestrationDependencies) {
 const now=deps.now||Date.now,storeId=deps.storeId
 async function current(tx:any,e:EmployeeContinuationEvent) {
  if(deps.enabled!==true)fail('EMPLOYEE_ORCHESTRATION_DISABLED')
  const row=await tx.config.findUnique({where:{storeId_key:{storeId,key:employeeRouteKey(e.channelId)}}})
  const route=employeeRouteSchema.parse(row&&JSON.parse(row.value))
  const policy=await readTeam<any>(tx,storeId,'workflow.policy.'+e.channelId)
  if(policy?.paused||policy?.enabled===false)fail('EMPLOYEE_ORCHESTRATION_CHANNEL_PAUSED')
  const g=await tx.config.findUnique({where:{storeId_key:{storeId,key:employeeGrantKey(route.agentId)}}})
  const grant=grantSchema.parse(g&&JSON.parse(g.value))
  if(!route.enabled||route.paused||Date.parse(route.expiresAt)<=now()||Date.parse(route.expiresAt)>Date.parse(grant.expiresAt)||grant.revoked||grant.storeId!==storeId||grant.agentId!==route.agentId||!grant.actions.includes('messages.read')||!grant.actions.includes('messages.send'))fail('EMPLOYEE_ORCHESTRATION_AUTHORITY_CHANGED')
  const access=await readAuthorizedBridgeChannel(tx,grant,route.task,e.channelId,undefined,now())
  const speaker=await tx.staff.findFirst({where:{id:e.sourceStaffId,storeId},include:{user:true}})
  const isAdminSpeaker=speaker?.user?.role==='admin'||speaker?.user?.role==='manager'
  const isChannelMember=access.channel.members.some((m:any)=>m.staffId===e.sourceStaffId)
  if(route.fromSeq!==access.fromSeq||e.sourceSeq<route.fromSeq)fail('EMPLOYEE_ORCHESTRATION_SOURCE_CHANGED')
  if(!isAdminSpeaker&&!isChannelMember&&route.sourceStaffId!==e.sourceStaffId)fail('EMPLOYEE_ORCHESTRATION_SOURCE_CHANGED')
  if(!isAdminSpeaker&&access.delegatedDirect&&access.sourceStaffId!==e.sourceStaffId&&!isChannelMember)fail('EMPLOYEE_ORCHESTRATION_SOURCE_CHANGED')
  const source=await readTeam<any>(tx,storeId,`message.${e.channelId}.${String(e.sourceSeq).padStart(12,'0')}`)
  if(!source||source.id!==e.sourceMessageId||source.authorId!==e.sourceStaffId||source.seq!==e.sourceSeq||source.ai||source.agent||typeof source.text!=='string'||(!source.text.trim()&&!source.files?.length))fail('EMPLOYEE_ORCHESTRATION_SOURCE_CHANGED')
  const task=await readTeam<TeamTask>(tx,storeId,`task.${e.channelId}.${route.task.taskId}`)
  if(!task||task.id!==route.task.taskId||task.channelId!==e.channelId||task.version!==route.task.version||!['assigned','accepted','submitted','changes_requested'].includes(task.status)||task.agentTask?.state==='accepted')fail('EMPLOYEE_ORCHESTRATION_TASK_CHANGED')
  return {route,grant,channel:access.channel,source,task,authorizationVersion:hash([route,employeeGrantAuthority(grant)])}
 }
 async function observed(tx:any,r:EmployeeContinuationReservation) {
  const live=await current(tx,r.event)
  if(live.authorizationVersion!==r.authorizationVersion)fail('EMPLOYEE_ORCHESTRATION_AUTHORITY_CHANGED')
  const m=await readTeam<any>(tx,storeId,mappingKey(r.id))
  if(!m||m.reservationId!==r.id||m.sourceMessageId!==r.event.sourceMessageId||!m.executionId)return {phase:'unknown' as const}
  const s=await readTeam<any>(tx,storeId,'employeeRuntime.execution.'+m.executionId)
  if(!s||s.ticket?.executionId!==m.executionId||s.scope?.task?.taskId!==r.task.taskId||s.scope?.channelId!==r.event.channelId||s.grant?.agentId!==live.grant.agentId)return {phase:'unknown' as const}
  const sends=(s.tools||[]).filter((t:any)=>t.name==='employee_send_message')
  if(sends.length>1)fail('EMPLOYEE_ORCHESTRATION_OUTBOUND_RECEIPT_CHANGED')
  const send=sends[0]
  if(send){
   const message=await readTeam<any>(tx,storeId,`message.${r.event.channelId}.${String(send.value?.seq).padStart(12,'0')}`)
   if(!message||message.id!==send.value?.messageId||message.agent?.agentId!==live.grant.agentId||message.authorId!=='agent:'+live.grant.agentId||message.seq<=r.event.sourceSeq)fail('EMPLOYEE_ORCHESTRATION_OUTBOUND_RECEIPT_CHANGED')
   // An outbound tool receipt proves delivery, but the runtime still owns this
   // compartment until its final receipt arrives. Keep later employee messages
   // queued rather than starting them against an unfinished runtime.
   if(!['complete','unknown'].includes(s.phase)&&Date.parse(s.expiresAt)>now())return {phase:'running' as const}
   // Intent cannot establish delivery or employee non-cooperation. Waiting needs
   // both the issued-tool flag and this exact actually stored outbound receipt.
   if(send.value.expectsReply===true){await writeTeam(tx,storeId,questionContextKey(r.event.channelId),{executionId:s.ticket.executionId,questionMessageId:message.id,taskId:r.task.taskId});return {phase:'complete' as const,question:{messageId:message.id,seq:message.seq}}}
   const id=m.executionId,k=reportKey(id),existing=await readTeam<any>(tx,storeId,k)
   const report={id,taskId:r.task.taskId,taskVersion:r.task.version,reservationId:r.id,executionId:id,sourceMessageId:r.event.sourceMessageId,status:'awaiting_review',providerRequestId:s.responses?.at(-1)?.providerRequestId||'outbound-delivered',text:s.phase==='complete'&&s.responses?.at(-1)?.finishReason==='stop'?s.responses.at(-1).providerMessage.content:message.text||'Operational reply sent',sourceRefs:(s.sources||[]).map((x:any)=>({source:x.source,fingerprint:x.fingerprint})),outbound:send.value}
   if(existing&&hash(existing)!==hash(report))fail('EMPLOYEE_ORCHESTRATION_REPORT_CHANGED')
   if(!existing)await writeTeam(tx,storeId,k,report)
   await writeTeam(tx,storeId,questionContextKey(r.event.channelId),send?{executionId:s.ticket.executionId,questionMessageId:send.value.messageId,taskId:r.task.taskId}:null)
   return {phase:'complete' as const,reportId:id}
  }
  if(s.phase==='unknown'||s.phase!=='complete'&&Date.parse(s.expiresAt)<=now()){
    await writeTeam(tx,storeId,'employeeOrchestration.lastOutcome.'+r.event.channelId,{executionId:s.ticket.executionId,taskId:r.task.taskId})
    try { await sendEmployeeFailureReply(tx,storeId,r.event,s) } catch { /* Disabled/revoked channel authority still stops publication; source failure remains visible. */ }
    return {phase:'unknown' as const}
  }
  if(s.phase!=='complete')return {phase:Date.parse(s.expiresAt)<=now()?'unknown' as const:'running' as const}
  const final=s.responses?.at(-1)
  if(final?.finishReason!=='stop'||typeof final.providerMessage?.content!=='string'||!final.providerMessage.content.trim())return {phase:'unknown' as const}

  // Auto-delivery fallback: If the assistant generated output but did not call employee_send_message,
  // automatically deliver the response to the channel so the user is never left without feedback.
  if(!send && final.providerMessage?.content?.trim()){
    const replyText = final.providerMessage.content.trim()
    try {
      const bridge = createTeamAgentBridge(tx, {...deps, resolveGrant: async () => live.grant, tasks: { assert: async () => {} } as any, readAttachment: async () => new Uint8Array() })
      const reply = s.scope.requesterStaffId ? s.sources.filter((x: any) => x.source.kind === 'conversation' && (x.value as any)?.authorStaffId === s.scope.requesterStaffId).sort((a:any,b:any)=>b.value.seq-a.value.seq)[0] : undefined
      const r_msg = await bridge.send({
        channelId: s.scope.channelId,
        task: s.scope.task,
        requestId: s.ticket.requestId,
        expectedLastSeq: s.lastSeq,
        text: replyText,
        ...(reply?.source.kind === 'conversation' ? { replyToSeq: reply.source.seq } : {})
      })
      const autoSend = { messageId: r_msg.id, seq: r_msg.seq, delivery: 'stored', device: 'unknown', expectsReply: false }
      s.lastSeq = r_msg.seq
      s.tools.push({ turn: s.turn, toolCallId: 'auto_fallback_' + r_msg.id, name: 'employee_send_message', value: autoSend, sources: [] })
      await writeTeam(tx, storeId, 'employeeRuntime.execution.' + s.ticket.executionId, s)

      const id = m.executionId, k = reportKey(id), existing = await readTeam<any>(tx, storeId, k)
      const report = {
        id,
        taskId: r.task.taskId,
        taskVersion: r.task.version,
        reservationId: r.id,
        executionId: id,
        sourceMessageId: r.event.sourceMessageId,
        status: 'awaiting_review',
        providerRequestId: final.providerRequestId || 'outbound-fallback-delivered',
        text: replyText,
        sourceRefs: (s.sources || []).map((x: any) => ({ source: x.source, fingerprint: x.fingerprint })),
        outbound: autoSend
      }
      if (existing && hash(existing) !== hash(report)) fail('EMPLOYEE_ORCHESTRATION_REPORT_CHANGED')
      if (!existing) await writeTeam(tx, storeId, k, report)
      await writeTeam(tx, storeId, questionContextKey(r.event.channelId), null)
      return { phase: 'complete' as const, reportId: id }
    } catch (e: any) {
      console.warn('Fallback auto-delivery to channel warning:', e.message)
    }
  }

  const id=m.executionId,k=reportKey(id),existing=await readTeam<any>(tx,storeId,k)
  const report={id,taskId:r.task.taskId,taskVersion:r.task.version,reservationId:r.id,executionId:id,sourceMessageId:r.event.sourceMessageId,status:'awaiting_review',providerRequestId:final.providerRequestId,text:final.providerMessage.content,sourceRefs:(s.sources||[]).map((x:any)=>({source:x.source,fingerprint:x.fingerprint})),outbound:send?.value||null}
  if(existing&&hash(existing)!==hash(report))fail('EMPLOYEE_ORCHESTRATION_REPORT_CHANGED')
  if(!existing)await writeTeam(tx,storeId,k,report)
  await writeTeam(tx,storeId,questionContextKey(r.event.channelId),send?{executionId:s.ticket.executionId,questionMessageId:send.value.messageId,taskId:r.task.taskId}:null)
  return {phase:'complete' as const,reportId:id}
 }
 const continuation=createEmployeeContinuation(db,{enabled:deps.enabled,storeId,now,executionDeadlineMs:86400000,
  authorize:async(tx,e)=>{const a=await current(tx,e);return {fromSeq:a.route.fromSeq,expiresAt:a.route.expiresAt,authorizationVersion:a.authorizationVersion}},
  resolveTask:async(tx,e,existing)=>{const a=await current(tx,e);if(existing&&existing.taskId!==a.route.task.taskId)fail('EMPLOYEE_ORCHESTRATION_TASK_CHANGED');return a.route.task},
  execute:async r=>{
   // Reserve before begin. Crash between begin and mapping stays unresolved;
   // repeat execution cannot issue another begin or another network POST.
   await db.$transaction(async(tx:any)=>{await lockTeam(tx,storeId,mappingKey(r.id));const a=await current(tx,r.event);if(a.authorizationVersion!==r.authorizationVersion||await readTeam(tx,storeId,mappingKey(r.id)))fail('EMPLOYEE_ORCHESTRATION_EXECUTION_ALREADY_RESERVED');await writeTeam(tx,storeId,mappingKey(r.id),{reservationId:r.id,sourceMessageId:r.event.sourceMessageId,phase:'preparing'})})
   const a=await current(db,r.event),scope=await readCommunicationScope(db,a.grant,r.task,a.channel,r.event.sourceStaffId)
   const sources:any[]=[]
   const startSeq = Math.max(a.route.fromSeq, r.event.sourceSeq - 10)
   for (let seq = startSeq; seq < r.event.sourceSeq; seq++) {
     const pastMsg = await readTeam<any>(db, storeId, `message.${r.event.channelId}.${String(seq).padStart(12, '0')}`)
     if (pastMsg && typeof pastMsg.text === 'string' && pastMsg.text.trim()) {
       sources.push({ kind: 'conversation', channelId: r.event.channelId, messageId: pastMsg.id, seq: pastMsg.seq })
     }
   }
   sources.push({kind:'conversation',channelId:r.event.channelId,messageId:r.event.sourceMessageId,seq:r.event.sourceSeq})
   const previous=await readTeam<any>(db,storeId,questionContextKey(r.event.channelId))
   if(previous){
     const prior=await readTeam<any>(db,storeId,'employeeRuntime.execution.'+previous.executionId)
     if(prior&&prior.phase==='complete'&&previous.taskId===r.task.taskId&&prior.scope?.compartmentKey===scope.compartmentKey){
       sources.push({kind:'employee_exchange',executionId:previous.executionId,questionMessageId:previous.questionMessageId})
     }else{
       await writeTeam(db,storeId,questionContextKey(r.event.channelId),null)
     }
   }
   const outcome=await readTeam<any>(db,storeId,'employeeOrchestration.lastOutcome.'+r.event.channelId)
   if(outcome?.taskId===r.task.taskId){const prior=await readTeam<any>(db,storeId,'employeeRuntime.execution.'+outcome.executionId);if(prior?.scope?.compartmentKey===scope.compartmentKey)sources.push({kind:'employee_execution_outcome',executionId:outcome.executionId,channelId:r.event.channelId})}
   const ticket=await deps.runtime.host.begin(a.grant,scope,sources)
   const stored=await readTeam<any>(db,storeId,'employeeRuntime.execution.'+ticket.executionId)
   const expiresAt=new Date(Math.min(Date.parse(a.route.expiresAt),Date.parse(a.grant.expiresAt),Date.parse(stored?.expiresAt||''))).toISOString()
   await db.$transaction(async(tx:any)=>{
     await lockTeam(tx,storeId,mappingKey(r.id));
     const live=await current(tx,r.event),m=await readTeam<any>(tx,storeId,mappingKey(r.id));
     if(live.authorizationVersion!==r.authorizationVersion||m?.phase!=='preparing')fail('EMPLOYEE_ORCHESTRATION_MAPPING_CHANGED');
     await writeTeam(tx,storeId,mappingKey(r.id),{...m,executionId:ticket.executionId,phase:'reserved',expiresAt,ticketHash:hash(ticket)});
     const readKey=`read.${r.event.channelId}.agent:${live.grant.agentId}`,oldRead=await readTeam<any>(tx,storeId,readKey);
     await writeTeam(tx,storeId,readKey,{seq:Math.max(oldRead?.seq||0,r.event.sourceSeq),readAt:new Date(now()).toISOString()})
   })
   const credentials=await deps.issueCredentials(ticket,{expiresAt,reservationId:r.id})
   const ready=await current(db,r.event);if(ready.authorizationVersion!==r.authorizationVersion||Date.parse(expiresAt)<=now())fail('EMPLOYEE_ORCHESTRATION_AUTHORITY_CHANGED')
   const receipt=await deps.gateway.start({ticket,deadlineAt:expiresAt,...credentials})
   if(receipt.executionId!==ticket.executionId)fail('EMPLOYEE_ORCHESTRATION_GATEWAY_MAPPING_CHANGED')
   await db.$transaction(async(tx:any)=>{await lockTeam(tx,storeId,mappingKey(r.id));const m=await readTeam<any>(tx,storeId,mappingKey(r.id));if(m?.executionId!==ticket.executionId)fail('EMPLOYEE_ORCHESTRATION_MAPPING_CHANGED');await writeTeam(tx,storeId,mappingKey(r.id),{...m,gatewayState:receipt.state})})
   if(receipt.state==='admission_unknown'||receipt.state==='unknown')await deps.runtime.host.markUnknown(ticket.executionId,ticket.traceVersion,'EMPLOYEE_GATEWAY_ADMISSION_UNCONFIRMED')
   return {runtimeExecutionId:ticket.executionId}
  },readExecution:observed,
  // Only the persisted runtime decides whether an unfinished reservation can be
  // released. A stored employee reply is a real answer and is never executed twice;
  // a missing or unfinished runtime proves that no employee receipt was produced.
  readAbandoned:async(tx,r)=>{
   const m=await readTeam<any>(tx,storeId,mappingKey(r.id))
   if(!m||!m.executionId)return {releasable:true,reason:'NO_RUNTIME_EXECUTION'}
   const s=await readTeam<any>(tx,storeId,'employeeRuntime.execution.'+m.executionId)
   if(!s)return {releasable:true,reason:'NO_RUNTIME_EXECUTION'}
   const effect=(s.tools||[]).find((t:any)=>t.mutating===true||t.mutating===undefined&&!t.name.startsWith('employee_read_'))
   if(effect)return {releasable:false,reason:effect.name==='employee_send_message'?'OUTBOUND_ALREADY_SENT':'BUSINESS_EFFECT_RECORDED'}
   if(s.phase==='complete')return {releasable:false,reason:'RUNTIME_COMPLETED'}
   if(s.phase!=='unknown')await writeTeam(tx,storeId,'employeeRuntime.execution.'+m.executionId,{...s,phase:'unknown',fault:{code:'RELEASED_BY_CONTINUATION',at:new Date().toISOString()}})
   return {releasable:true,reason:'RUNTIME_NOT_COMPLETED'}
  }})
 return {get:continuation.get,reconcile:continuation.reconcile,
  async drain(limit=20) {
   if(deps.enabled!==true)return {processed:0,disabled:true}
   if(!Number.isInteger(limit)||limit<1||limit>100)fail('EMPLOYEE_ORCHESTRATION_LIMIT_INVALID')
   const rows=await db.config.findMany({where:{storeId,key:{startsWith:pendingPrefix},value:{contains:'"state":"pending"'}},orderBy:{key:'asc'},take:limit})
   const entries=rows.map((row:any)=>{try{return {key:row.key,value:JSON.parse(row.value)}}catch{return null}}).filter((x:any)=>x&&x.value.state==='pending').sort((a:any,b:any)=>a.value.channelId.localeCompare(b.value.channelId)||a.value.sourceSeq-b.value.sourceSeq).slice(0,limit)
   let processed=0
   for(const entry of entries){const p=entry.value,e={channelId:p.channelId,sourceMessageId:p.messageId,sourceSeq:p.sourceSeq,sourceStaffId:p.sourceStaffId}
    try{await continuation.receive(e);const started=await continuation.dispatchPending(e.channelId)
     await db.$transaction(async(tx:any)=>{
      await lockTeam(tx,storeId,entry.key);const row=await tx.config.findUnique({where:{storeId_key:{storeId,key:entry.key}}}),v=row&&JSON.parse(row.value);
      if(v?.state==='pending')await tx.config.update({where:{storeId_key:{storeId,key:entry.key}},data:{value:JSON.stringify({...v,state:'received'})}});
      if(p.agentId){
       const readKey=`read.${p.channelId}.agent:${p.agentId}`,oldRead=await readTeam<any>(tx,storeId,readKey);
       await writeTeam(tx,storeId,readKey,{seq:Math.max(oldRead?.seq||0,p.sourceSeq),readAt:new Date(now()).toISOString()});
      }
     })
     if(started.started&&started.executionId)await continuation.reconcile(e.channelId,started.executionId)
     processed++
    }catch(error:any){const reason=/^(EMPLOYEE_|TEAM_AGENT_)[A-Z0-9_]+$/.test(error?.message||'')?error.message:'EMPLOYEE_ORCHESTRATION_REVIEW_REQUIRED';await db.$transaction(async(tx:any)=>{await lockTeam(tx,storeId,entry.key);const row=await tx.config.findUnique({where:{storeId_key:{storeId,key:entry.key}}}),v=row&&JSON.parse(row.value);if(v?.state==='pending')await tx.config.update({where:{storeId_key:{storeId,key:entry.key}},data:{value:JSON.stringify({...v,state:'blocked',reason})}})})}
   }
   // Running completions and queued follow-ups need progress even when no new
   // pending row arrives. Reconstruct from the existing continuation records.
   const states=await db.config.findMany({where:{storeId,key:{startsWith:'team.communication.employeeContinuation.channel.'},OR:[{value:{contains:'"active":'}},{value:{contains:'"queue":[{'}}]},orderBy:{key:'asc'},take:limit})
   for(const row of states.slice(0,limit))try{const saved=JSON.parse(row.value),channelId=saved.channelId
    if(saved.active){
     // Query the persistent gateway journal outside any business transaction. A
     // restart is not evidence that the old execution can be replayed.
     if(deps.gateway.get)try{
      const m=await readTeam<any>(db,storeId,mappingKey(saved.active.id))
      if(m?.executionId){const receipt=await deps.gateway.get(m.executionId)
       if(receipt.state==='unknown'){const s=await readTeam<any>(db,storeId,'employeeRuntime.execution.'+m.executionId);if(s?.ticket)await deps.runtime.host.markUnknown(m.executionId,s.ticket.traceVersion,receipt.code||'EMPLOYEE_GATEWAY_RESTARTED')}
      }
     }catch{/* Connectivity alone does not establish an execution outcome. */}
     await continuation.reconcile(channelId,saved.active.id)
    }
    const started=await continuation.dispatchPending(channelId)
    if(started.started&&started.executionId)await continuation.reconcile(channelId,started.executionId)
   }catch{/* Fresh authority remains fail-closed; no replacement execution. */}
   return {processed,disabled:false}
  },
 }
}
