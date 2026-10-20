import { createHash, randomUUID } from 'crypto'
import { TeamError, TeamTask, TEAM_PREFIX, readTeam, writeTeam, lockTeam } from '../TeamCommunicationService'
import { buildTeamStockReadOnlySource, stockReadOnlySnapshotSchema } from '../TeamStockReadOnlySource'
import { assertAgentPilotStamp } from './pilot'
import { AgentPrincipal, AgentTaskDependencies, AgentTaskService, AgentTaskState, AgentTaskView, AgentTaskReport, AgentTaskEvent, AgentTaskScope,
  assignTaskSchema, readTaskSchema, claimTaskSchema, leaseSchema, reportTaskSchema, reviewTaskSchema, eventCursorSchema } from './contract'

type RecordTask = TeamTask & { agentTask: AgentTaskState }
type Evidence = { id:string; taskId:string; runId:string; round:number; executorId:string; leaseVersion:number; snapshotHash:string; sourceRefs:string[]; snapshot:unknown; createdAt:string }
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const fail=(code:string,status=409):never=>{throw new TeamError(status,code)}
const taskKey=(c:string,t:string)=>`task.${c}.${t}`
const actorRef=(p:AgentPrincipal)=>'agent:'+p.agentId
const LEASE_MS=600000
const scopeForRead=(p:AgentPrincipal):AgentTaskScope=>p.role==='manager'?'management.read':'executor.claim'

/** Existing TeamTask persistence, first-class agent metadata, no staff impersonation or executor side effects. */
interface SupervisionInput { taskId: string; runId: string; round: number; expectedVersion: number; authVersion: number }
export function createAgentTaskService(db:any,deps:AgentTaskDependencies):AgentTaskService & { supervise(principal:AgentPrincipal,input:SupervisionInput):Promise<AgentTaskView> } {
  if(typeof deps?.authorize!=='function'||typeof deps?.executorFor!=='function')throw Error('AGENT_TASK_AUTH_DEPENDENCIES_REQUIRED')
  const now=deps.now||Date.now,at=()=>new Date(now()).toISOString()
  async function auth(tx:any,p:AgentPrincipal,scope:AgentTaskScope,channelId:string,authVersion:number) {
    if(!['manager','executor'].includes(p.role))fail('AGENT_TASK_PRINCIPAL_REQUIRED',403)
    const live=await deps.authorize(tx,p,scope,channelId)
    if(!live||live.agentId!==p.agentId||live.storeId!==p.storeId||live.role!==p.role||live.grantVersion!==authVersion||live.clientRevision!==p.clientRevision||!live.scopes.includes(scope))fail('AGENT_TASK_AUTH_CHANGED',403)
    assertAgentPilotStamp(live,now())
    if (p.pilot && JSON.stringify(p.pilot)!==JSON.stringify(live.pilot)) fail('AGENT_TASK_PILOT_CHANGED',403)
    return live
  }
  async function storeLock(tx:any,storeId:string){await lockTeam(tx,storeId,'agent.tasks')}
  async function load(tx:any,p:AgentPrincipal,taskId:string) {
    const index=await readTeam(tx,p.storeId,`agent.task.index.${taskId}`)
    if(!index?.channelId)fail('AGENT_TASK_NOT_FOUND',404)
    await lockTeam(tx,p.storeId,'channel.'+index.channelId)
    const t=await readTeam<RecordTask>(tx,p.storeId,taskKey(index.channelId,taskId))
    if(!t?.agentTask||t.id!==taskId||t.channelId!==index.channelId||t.agentTask.taskCode!=='STOCK-RO-001'||t.agentTask.capability!=='stock_readonly_v1')fail('AGENT_TASK_NOT_FOUND',404)
    const c=await readTeam(tx,p.storeId,`channel.${t.channelId}`)
    if(!c||c.id!==t.channelId||c.archived)fail('AGENT_TASK_CHANNEL_UNAVAILABLE',403)
    return t
  }
  function bound(p:AgentPrincipal,t:RecordTask,role?:'manager'|'executor') {
    if((p.pilot||t.agentTask.pilot)&&JSON.stringify(p.pilot)!==JSON.stringify(t.agentTask.pilot))fail('AGENT_TASK_PILOT_CHANGED',403)
    if(role&&p.role!==role||p.role==='manager'&&t.agentTask.managerId!==p.agentId||p.role==='executor'&&t.agentTask.executorId!==p.agentId)fail('AGENT_TASK_PRINCIPAL_REQUIRED',403)
  }
  function version(t:RecordTask,v:number){if(t.version!==v)fail('AGENT_TASK_VERSION_CONFLICT')}
  function run(t:RecordTask,input:{runId?:string;round?:number}){if(t.agentTask.runId!==input.runId||t.agentTask.round!==input.round)fail('AGENT_TASK_RUN_CHANGED')}
  async function reportFor(tx:any,p:AgentPrincipal,t:RecordTask):Promise<AgentTaskReport|undefined>{return t.agentTask.reportId?await readTeam(tx,p.storeId,`agent.report.${t.agentTask.reportId}`)||undefined:undefined}
  const reportReceipt=(r:AgentTaskReport)=>({id:r.id,version:r.version,runId:r.runId,round:r.round,outcome:r.outcome,createdAt:r.createdAt})
  async function view(tx:any,p:AgentPrincipal,t:RecordTask,full=false):Promise<AgentTaskView>{
    const x=t.agentTask,report=await reportFor(tx,p,t);let evidence:AgentTaskView['evidence']
    if(full&&x.evidenceId){
      const row=await readTeam<Evidence>(tx,p.storeId,`agent.evidence.${x.evidenceId}`)
      if(!row||row.id!==x.evidenceId||row.taskId!==t.id||row.runId!==x.runId||row.round!==x.round||row.executorId!==x.executorId||row.snapshotHash!==x.inputSnapshotHash)fail('AGENT_TASK_EVIDENCE_CHANGED')
      const snapshot=stockReadOnlySnapshotSchema.parse(row.snapshot),{fingerprint,...facts}=snapshot
      if(snapshot.storeId!==p.storeId||fingerprint!==row.snapshotHash||digest(facts)!==fingerprint)fail('AGENT_TASK_EVIDENCE_CHANGED')
      evidence={evidenceId:row.id,inputSnapshotHash:row.snapshotHash,evidence:snapshot}
    }
    return{taskId:t.id,taskCode:x.taskCode,taskVersion:t.version,channelId:t.channelId,runId:x.runId,round:x.round,executorId:x.executorId,managerId:x.managerId,leaseVersion:x.leaseVersion,state:x.state,plan:x.plan,...(x.reportDueAt?{reportDueAt:x.reportDueAt}:{}),...(x.error?{error:x.error}:{}),...(full&&x.programFailure?{programFailure:x.programFailure}:{}),...(report?{report:full?report:reportReceipt(report)}:{}),...(evidence?{evidence}:{}),dispatch:{taskId:t.id,runId:x.runId,eventId:x.eventId,round:x.round,taskVersion:t.version,executorId:x.executorId,leaseVersion:x.leaseVersion}}
  }
  async function audit(tx:any,p:AgentPrincipal,t:RecordTask,action:string,detail:unknown={}) {
    await tx.financeAuditLog.create({data:{storeId:p.storeId,userId:actorRef(p),action:'update',entityType:'agent_task',entityId:t.id,description:action,newValue:JSON.stringify({actorType:'agent',agentId:p.agentId,role:p.role,grantVersion:p.grantVersion,clientRevision:p.clientRevision,taskId:t.id,runId:t.agentTask.runId,round:t.agentTask.round,taskVersion:t.version,action,detail})}})
  }
  async function persist(tx:any,p:AgentPrincipal,t:RecordTask,action:string,detail?:unknown){t.updatedAt=at();await writeTeam(tx,p.storeId,taskKey(t.channelId,t.id),t);await audit(tx,p,t,action,detail)}
  async function event(tx:any,p:AgentPrincipal,t:RecordTask,type:AgentTaskEvent['type']) {
    const cursor=await readTeam(tx,p.storeId,'agent.event.cursor'),sequence=(cursor?.sequence||0)+1
    if(!Number.isSafeInteger(sequence))fail('AGENT_TASK_EVENT_SEQUENCE_INVALID')
    const e:AgentTaskEvent={id:randomUUID(),sequence,occurredAt:at(),type,payload:{taskId:t.id,runId:t.agentTask.runId,round:t.agentTask.round,taskVersion:t.version,...(t.agentTask.reportId?{reportId:t.agentTask.reportId,reportVersion:t.agentTask.reportVersion}: {})}}
    await writeTeam(tx,p.storeId,'agent.event.cursor',{sequence});await writeTeam(tx,p.storeId,`agent.event.${String(sequence).padStart(12,'0')}`,e)
    await writeTeam(tx,p.storeId,`agent.outbox.${e.id}`,{event:e,status:'pending',executorId:t.agentTask.executorId,managerId:t.agentTask.managerId,channelId:t.channelId})
    return e
  }
  const receiptKey=(p:AgentPrincipal,id:string)=>`agent.request.${p.agentId}.${id}`
  async function repeated(tx:any,p:AgentPrincipal,input:any,operation:string) {
    const r=await readTeam(tx,p.storeId,receiptKey(p,input.requestId));if(!r)return null;if(r.hash!==digest({operation,input}))fail('AGENT_TASK_REQUEST_CONFLICT')
    if(operation==='evidence')return r.result // This operation already rechecked executor.evidence.
    // Older saved mutation receipts may contain a full pre-projection view.
    const {evidence: _privateEvidence,...result}=r.result
    return {...result,...(result.report?{report:reportReceipt(result.report)}:{})}
  }
  async function receipt(tx:any,p:AgentPrincipal,input:any,operation:string,result:any){await writeTeam(tx,p.storeId,receiptKey(p,input.requestId),{hash:digest({operation,input}),result});return result}
  async function expire(tx:any,p:AgentPrincipal,t:RecordTask) {
    t.agentTask.state='unknown';t.agentTask.error='AGENT_TASK_LEASE_EXPIRED_OUTCOME_UNKNOWN';delete t.agentTask.lease;t.version++
    await persist(tx,p,t,'agent_task_lease_unknown');await event(tx,p,t,'task.blocked')
    return{failure:'AGENT_TASK_LEASE_EXPIRED_OUTCOME_UNKNOWN'}
  }
  function lease(t:RecordTask,p:AgentPrincipal,input:any) {
    run(t,input);const x=t.agentTask
    if(x.state!=='running'||!x.lease||x.leaseVersion!==input.leaseVersion||x.lease.token!==input.leaseToken||x.lease.grantVersion!==p.grantVersion||x.lease.clientRevision!==p.clientRevision)fail('AGENT_TASK_LEASE_CHANGED')
    return x.lease.until>now()
  }
  function finish<T>(r:T):T{if((r as any)?.failure)fail((r as any).failure);return r}
  function deadline(plan:{deadlineAt?:string},p?:AgentPrincipal){if(!Number.isFinite(Date.parse(plan.deadlineAt))||Date.parse(plan.deadlineAt)<=now())fail('AGENT_TASK_DEADLINE_PASSED');if(p?.pilot&&Date.parse(plan.deadlineAt)>Date.parse(p.pilot.expiresAt))fail('AGENT_TASK_PLAN_EXCEEDS_PILOT')}
  return {
    async assign(principal,input){const v=assignTaskSchema.parse(input);return db.$transaction(async(tx:any)=>{
      await storeLock(tx,principal.storeId);const p=await auth(tx,principal,'management.assign',v.channelId,v.authVersion);if(p.role!=='manager')fail('AGENT_TASK_MANAGER_REQUIRED',403)
      const old=await repeated(tx,p,v,'assign');if(old)return old
      const c=await readTeam(tx,p.storeId,`channel.${v.channelId}`);if(!c||c.id!==v.channelId||c.archived)fail('AGENT_TASK_CHANNEL_UNAVAILABLE',403)
      if(await readTeam(tx,p.storeId,`agent.task.code.${v.taskCode}`))fail('AGENT_TASK_CODE_ALREADY_ASSIGNED')
      deadline(v.plan,p);const proposed=await deps.executorFor(tx,p,v.channelId);if(proposed.role!=='executor'||proposed.storeId!==p.storeId||!proposed.agentId||proposed.agentId===p.agentId)fail('AGENT_TASK_EXECUTOR_REQUIRED',403)
      const executor=await auth(tx,proposed,'executor.claim',v.channelId,proposed.grantVersion),id=randomUUID(),runId=randomUUID(),eventId=randomUUID(),time=at()
      if(p.pilot&&JSON.stringify(p.pilot)!==JSON.stringify(executor.pilot))fail('AGENT_TASK_PILOT_CHANGED',403)
      const x:AgentTaskState={...(p.pilot?{pilot:p.pilot}:{}),taskCode:v.taskCode,capability:v.plan.scope,managerId:p.agentId,executorId:executor.agentId,plan:v.plan,round:1,runId,eventId,leaseVersion:0,state:'assigned',checks:[]}
      const t:RecordTask={id,channelId:v.channelId,roundId:runId,minuteVersion:1,actionIndex:0,text:v.plan.objective,ownerId:actorRef(executor),reviewerId:actorRef(p),dueDate:v.plan.deadlineAt.slice(0,10),sourceSeq:[],fromSeq:Math.max(1,c.lastSeq+1),status:'assigned',version:1,createdAt:time,updatedAt:time,evidenceRequired:v.plan.evidenceRequired,acceptanceCriteria:v.plan.criteria.map(r=>r.id+': '+r.standard).join('\n'),deadlineAt:v.plan.deadlineAt,audienceIds:[],events:[{action:'agent_assign',by:actorRef(p),at:time,note:'First-class executor '+executor.agentId+'; no staff impersonation.',sourceSeq:[]}],agentTask:x}
      await writeTeam(tx,p.storeId,`agent.task.index.${id}`,{channelId:t.channelId});await writeTeam(tx,p.storeId,`agent.task.code.${v.taskCode}`,{taskId:id,channelId:t.channelId});await persist(tx,p,t,'agent_task_assigned')
      const e=await event(tx,p,t,'task.dispatch_ready');x.eventId=e.id;await writeTeam(tx,p.storeId,taskKey(t.channelId,t.id),t)
      return receipt(tx,p,v,'assign',await view(tx,p,t))
    })},
    async get(principal,input){const v=readTaskSchema.parse(input);return db.$transaction(async(tx:any)=>{await storeLock(tx,principal.storeId);const t=await load(tx,principal,v.taskId),p=await auth(tx,principal,scopeForRead(principal),t.channelId,v.authVersion);bound(p,t);return view(tx,p,t,p.role==='manager')})},
    async supervise(principal,input){return db.$transaction(async(tx:any)=>{
      await storeLock(tx,principal.storeId);const t=await load(tx,principal,input.taskId),p=await auth(tx,principal,'management.read',t.channelId,input.authVersion);bound(p,t,'manager');version(t,input.expectedVersion);run(t,input)
      const x=t.agentTask
      if(x.state!=='running'||x.reportId)return view(tx,p,t,true)
      let code:string|undefined,knownNotSent=false
      const pointer=await readTeam(tx,p.storeId,`agent.model.run.${x.runId}`)
      const model=pointer?.requestId&&await readTeam(tx,p.storeId,`agent.model.request.${x.executorId}.${pointer.requestId}`)
      if(model&&model.taskId===t.id&&model.runId===x.runId&&model.taskVersion===t.version){
        if(model.state==='blocked'){knownNotSent=model.billingStatus==='not_started'&&model.error==='AGENT_MODEL_NOT_SENT'&&!model.startedAt&&!model.providerReceipt&&!model.usage;code=knownNotSent?'AGENT_TASK_PROGRAM_MODEL_NOT_SENT':'AGENT_TASK_PROGRAM_MODEL_RESULT_BLOCKED'}
        else if(model.state==='unknown')code='AGENT_TASK_PROGRAM_MODEL_OUTCOME_UNKNOWN'
        else if(model.state==='withheld')code='AGENT_TASK_PROGRAM_MODEL_RESULT_WITHHELD'
        else if(['reserved','calling'].includes(model.state)&&Number.isFinite(model.deadlineAt)&&model.deadlineAt<=now()){knownNotSent=model.state==='reserved'&&model.billingStatus==='not_started'&&!model.startedAt&&!model.providerReceipt&&!model.usage;code=knownNotSent?'AGENT_TASK_PROGRAM_MODEL_NOT_SENT':'AGENT_TASK_PROGRAM_MODEL_OUTCOME_UNKNOWN'}
      }
      if(!code&&(!x.lease||x.lease.until<=now()||Date.parse(x.plan.deadlineAt)<=now()||!!x.reportDueAt&&Date.parse(x.reportDueAt)<=now()))code='AGENT_TASK_PROGRAM_REPORT_DEADLINE_UNKNOWN'
      if(!code)return view(tx,p,t,true)
      x.state=knownNotSent?'blocked':'unknown';x.error=code
      x.programFailure={id:randomUUID(),version:1,code,knownNotSent,source:'program'}
      delete x.lease;t.version++
      t.events.push({action:'agent_program_blocked',by:'program:agent-task-supervisor',at:at(),note:code,sourceSeq:[]})
      await persist(tx,p,t,'agent_task_program_blocked',{source:'program',code,knownNotSent,programFailureId:x.programFailure.id})
      await event(tx,p,t,'task.blocked')
      return view(tx,p,t,true)
    })},
    async claim(principal,input){const v=claimTaskSchema.parse(input);const result=await db.$transaction(async(tx:any)=>{
      await storeLock(tx,principal.storeId);const t=await load(tx,principal,v.taskId),p=await auth(tx,principal,'executor.claim',t.channelId,v.authVersion);bound(p,t,'executor');const old=await repeated(tx,p,v,'claim');if(old)return old
      version(t,v.expectedVersion);run(t,v);if(t.agentTask.state==='running'&&t.agentTask.lease&&(t.agentTask.lease.until<=now()))return expire(tx,p,t)
      if(t.agentTask.state!=='assigned'||t.status!=='assigned')fail('AGENT_TASK_NOT_CLAIMABLE');deadline(t.agentTask.plan,p)
      const token=randomUUID(),until=Math.min(now()+LEASE_MS,Date.parse(t.agentTask.plan.deadlineAt),p.pilot?Date.parse(p.pilot.expiresAt):Infinity);t.agentTask.leaseVersion++;t.agentTask.lease={token,until,grantVersion:p.grantVersion,clientRevision:p.clientRevision};t.agentTask.state='running';t.agentTask.reportDueAt=new Date(until).toISOString();t.status='accepted';t.version++;t.events.push({action:'agent_claim',by:actorRef(p),at:at(),note:'Executor accepted its own agent run.',sourceSeq:[]});await persist(tx,p,t,'agent_task_claimed');return receipt(tx,p,v,'claim',{...await view(tx,p,t),leaseToken:token,leaseUntil:until})
    });return finish(result)},
    async readStockEvidence(principal,input){const v=leaseSchema.parse(input)
      const initial=await db.$transaction(async(tx:any)=>{await storeLock(tx,principal.storeId);const t=await load(tx,principal,v.taskId),p=await auth(tx,principal,'executor.evidence',t.channelId,v.authVersion);bound(p,t,'executor');const old=await repeated(tx,p,v,'evidence');if(old)return{old};version(t,v.expectedVersion);if(!lease(t,p,v))return expire(tx,p,t);return{channelId:t.channelId}})
      finish(initial);if(initial.old)return initial.old
      let snapshot:any
      try{snapshot=await buildTeamStockReadOnlySource(db,principal.storeId)}catch{
        await db.$transaction(async(tx:any)=>{await storeLock(tx,principal.storeId);const t=await load(tx,principal,v.taskId),p=await auth(tx,principal,'executor.evidence',t.channelId,v.authVersion);bound(p,t,'executor');version(t,v.expectedVersion);if(!lease(t,p,v))return expire(tx,p,t);t.agentTask.error='AGENT_TASK_EVIDENCE_READ_FAILED';t.version++;await persist(tx,p,t,'agent_task_evidence_failed');await event(tx,p,t,'task.failed')});fail('AGENT_TASK_EVIDENCE_READ_FAILED')
      }
      const result=await db.$transaction(async(tx:any)=>{
        await storeLock(tx,principal.storeId);const t=await load(tx,principal,v.taskId),p=await auth(tx,principal,'executor.evidence',t.channelId,v.authVersion);bound(p,t,'executor');const old=await repeated(tx,p,v,'evidence');if(old)return old;version(t,v.expectedVersion);if(!lease(t,p,v))return expire(tx,p,t)
        let evidence:Evidence
        if(t.agentTask.evidenceId){evidence=await readTeam(tx,p.storeId,`agent.evidence.${t.agentTask.evidenceId}`);if(!evidence||evidence.runId!==v.runId||evidence.round!==v.round||evidence.executorId!==p.agentId||evidence.leaseVersion!==v.leaseVersion||evidence.snapshotHash!==t.agentTask.inputSnapshotHash)fail('AGENT_TASK_EVIDENCE_CHANGED')}
        else{evidence={id:randomUUID(),taskId:t.id,runId:v.runId,round:v.round,executorId:p.agentId,leaseVersion:v.leaseVersion,snapshotHash:snapshot.fingerprint,sourceRefs:[...new Set<string>(snapshot.items.flatMap((i:any)=>[i.sourceId,...(i.observation?.sourceIds||[])]))],snapshot,createdAt:at()};await writeTeam(tx,p.storeId,`agent.evidence.${evidence.id}`,evidence);t.agentTask.evidenceId=evidence.id;t.agentTask.inputSnapshotHash=evidence.snapshotHash;t.version++;delete t.agentTask.error;await persist(tx,p,t,'agent_task_evidence_saved')}
        return receipt(tx,p,v,'evidence',{...await view(tx,p,t),evidenceId:evidence.id,inputSnapshotHash:evidence.snapshotHash,evidence:evidence.snapshot})
      });return finish(result)
    },
    async report(principal,input){const v={...reportTaskSchema.parse(input),rawReport:input.rawReport};const result=await db.$transaction(async(tx:any)=>{
      await storeLock(tx,principal.storeId);const t=await load(tx,principal,v.taskId),p=await auth(tx,principal,'executor.report',t.channelId,v.authVersion);bound(p,t,'executor');const old=await repeated(tx,p,v,'report');if(old)return old;version(t,v.expectedVersion);if(!lease(t,p,v))return expire(tx,p,t)
      let evidence:Evidence|null=null
      if(v.evidenceId||v.inputSnapshotHash){if(!v.evidenceId||!v.inputSnapshotHash)fail('AGENT_TASK_EVIDENCE_REQUIRED');evidence=await readTeam(tx,p.storeId,`agent.evidence.${v.evidenceId}`);if(!evidence||evidence.taskId!==t.id||evidence.runId!==v.runId||evidence.round!==v.round||evidence.executorId!==p.agentId||evidence.leaseVersion!==v.leaseVersion||evidence.snapshotHash!==v.inputSnapshotHash||t.agentTask.evidenceId!==v.evidenceId||t.agentTask.inputSnapshotHash!==v.inputSnapshotHash)fail('AGENT_TASK_EVIDENCE_CHANGED')}
      if(v.outcome==='completed'&&!evidence||!evidence&&v.sourceRefs.length||evidence&&v.sourceRefs.some(ref=>!evidence!.sourceRefs.includes(ref))||new Set(v.sourceRefs).size!==v.sourceRefs.length)fail('AGENT_TASK_SOURCE_REFERENCE_INVALID')
      if(v.outcome==='completed'&&evidence!.sourceRefs.length&&!v.sourceRefs.length)fail('AGENT_TASK_SOURCE_REFERENCE_REQUIRED')
      const report:AgentTaskReport={id:randomUUID(),version:1,runId:v.runId,round:v.round,executorId:p.agentId,...(evidence?{evidenceId:evidence.id,inputSnapshotHash:evidence.snapshotHash}:{}),rawReport:v.rawReport,sourceRefs:v.sourceRefs,outcome:v.outcome,createdAt:at(),...(v.runtimeReceipt?{runtimeReceipt:{hermesRunId:v.runtimeReceipt.hermesRunId!,...(v.runtimeReceipt.sessionId?{sessionId:v.runtimeReceipt.sessionId}:{})}}:{})}
      await writeTeam(tx,p.storeId,`agent.report.${report.id}`,report);t.agentTask.reportId=report.id;t.agentTask.reportVersion=report.version;t.agentTask.state=v.outcome==='completed'?'awaiting_review':v.outcome==='unknown'?'unknown':'blocked';delete t.agentTask.lease;t.status=v.outcome==='unknown'?'accepted':'submitted';t.version++;t.events.push({action:'agent_report',by:actorRef(p),at:at(),note:'Untrusted raw executor report saved; human acceptance remains required.',sourceSeq:[]});await persist(tx,p,t,'agent_task_report_saved',{outcome:v.outcome});await event(tx,p,t,v.outcome==='completed'?'task.report_ready':v.outcome==='failed'?'task.failed':'task.blocked');return receipt(tx,p,v,'report',await view(tx,p,t))
    });return finish(result)},
    async review(principal,input){const v=reviewTaskSchema.parse(input);return db.$transaction(async(tx:any)=>{
      await storeLock(tx,principal.storeId);const t=await load(tx,principal,v.taskId),p=await auth(tx,principal,'management.review',t.channelId,v.authVersion);bound(p,t,'manager');const old=await repeated(tx,p,v,'review');if(old)return old;version(t,v.expectedVersion);run(t,v)
      const r=await reportFor(tx,p,t),program=v.programFailureId?t.agentTask.programFailure:undefined
      if(v.programFailureId){
        if(!program||program.id!==v.programFailureId||program.version!==v.programFailureVersion||!program.knownNotSent||t.agentTask.state!=='blocked'||r||v.decision!=='rework')fail('AGENT_TASK_PROGRAM_RECOVERY_FORBIDDEN')
      }else if(!r||r.id!==v.reportId||r.version!==v.reportVersion||r.runId!==v.runId||r.round!==v.round||t.agentTask.reportVersion!==v.reportVersion)fail('AGENT_TASK_REPORT_CHANGED')
      if(t.agentTask.state==='unknown'||r?.outcome==='unknown'||!['awaiting_review','blocked'].includes(t.agentTask.state))fail('AGENT_TASK_REVIEW_OUTCOME_UNKNOWN')
      const expected=t.agentTask.plan.criteria.map(c=>c.id),given=v.check.criteria.map(c=>c.id)
      if(given.length!==expected.length||new Set(given).size!==given.length||expected.some(id=>!given.includes(id)))fail('AGENT_TASK_REVIEW_CRITERIA_REQUIRED')
      if(new Set(v.check.checkedEvidenceIds).size!==v.check.checkedEvidenceIds.length||v.check.checkedEvidenceIds.some(id=>id!==r?.evidenceId))fail('AGENT_TASK_REVIEW_EVIDENCE_CHANGED')
      if(v.decision==='accept'&&(!r||r.outcome!=='completed'||t.agentTask.state!=='awaiting_review'||!r.evidenceId||!v.check.checkedEvidenceIds.includes(r.evidenceId)||v.check.criteria.some(c=>c.result!=='met')||v.nextPlan))fail('AGENT_TASK_ACCEPTANCE_REQUIRED')
      t.agentTask.checks.push({round:v.round,runId:v.runId,...(program?{programFailureId:program.id,programFailure:{...program}}:{reportId:r!.id}),by:p.agentId,at:at(),decision:v.decision,check:v.check,...(v.nextPlan?{nextPlan:v.nextPlan}:{})})
      if(v.decision==='accept'){t.agentTask.state='accepted';t.status='completed'}else{
        if(!v.nextPlan)fail('AGENT_TASK_REWORK_PLAN_REQUIRED');if(!v.check.criteria.some(c=>c.result==='not_met'))fail('AGENT_TASK_REWORK_FINDING_REQUIRED');deadline(v.nextPlan,p)
        // The immutable prior report/evidence and check retain the old run. Unknown is never redispatched.
        t.agentTask.plan=v.nextPlan;t.agentTask.round++;t.agentTask.runId=randomUUID();t.agentTask.eventId=randomUUID();t.agentTask.state='assigned';delete t.agentTask.lease;delete t.agentTask.reportId;delete t.agentTask.reportVersion;delete t.agentTask.evidenceId;delete t.agentTask.inputSnapshotHash;delete t.agentTask.reportDueAt;delete t.agentTask.error;delete t.agentTask.programFailure;t.status='assigned';t.roundId=t.agentTask.runId;t.minuteVersion=t.agentTask.round;t.text=v.nextPlan.objective;t.dueDate=v.nextPlan.deadlineAt.slice(0,10);t.deadlineAt=v.nextPlan.deadlineAt;t.evidenceRequired=v.nextPlan.evidenceRequired;t.acceptanceCriteria=v.nextPlan.criteria.map(c=>c.id+': '+c.standard).join('\n')
      }
      t.version++;t.events.push({action:'agent_'+v.decision,by:actorRef(p),at:at(),note:v.check.summary,sourceSeq:[],...(v.decision==='accept'?{criteriaConfirmed:true}:{})});await persist(tx,p,t,'agent_task_'+v.decision)
      if(v.decision==='rework'){const e=await event(tx,p,t,'task.dispatch_ready');t.agentTask.eventId=e.id;await writeTeam(tx,p.storeId,taskKey(t.channelId,t.id),t)}
      return receipt(tx,p,v,'review',await view(tx,p,t))
    })},
    async events(principal,input){const v=eventCursorSchema.parse(input);return db.$transaction(async(tx:any)=>{
      await storeLock(tx,principal.storeId);await auth(tx,principal,scopeForRead(principal),'',v.authVersion)
      const rows=await tx.config.findMany({where:{storeId:principal.storeId,key:{startsWith:TEAM_PREFIX+'agent.event.',gt:TEAM_PREFIX+`agent.event.${String(v.after).padStart(12,'0')}`}},orderBy:{key:'asc'}}),events:AgentTaskEvent[]=[];let next=v.after,hasMore=false
      for(const row of rows){if(!/^\d{12}$/.test(row.key.slice((TEAM_PREFIX+'agent.event.').length)))continue;let e:AgentTaskEvent;try{e=JSON.parse(row.value)}catch{continue}if(!Number.isSafeInteger(e.sequence)||e.sequence<=v.after||typeof e.id!=='string'||!e.payload||typeof e.payload.taskId!=='string'||!['task.dispatch_ready','task.report_ready','task.blocked','task.failed'].includes(e.type))continue
        if(events.length>=v.limit){hasMore=true;break}next=Math.max(next,e.sequence)
        try{const t=await load(tx,principal,e.payload.taskId),p=await auth(tx,principal,scopeForRead(principal),t.channelId,v.authVersion);bound(p,t);events.push(e)}catch(error){if(!(error instanceof TeamError)||error.status!==403&&error.status!==404)throw error}
      }
      return{events,nextCursor:next,hasMore}
    })}
  }
}
export const agentTaskService=createAgentTaskService
