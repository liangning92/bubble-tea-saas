import { describe, expect, test, jest } from '@jest/globals'
import { randomUUID } from 'crypto'
import type { AgentPrincipal, AgentTaskView } from '../src/services/agentTasks/contract'
jest.mock('../src/services/TeamCommunicationService', () => ({
  TEAM_PREFIX: 'team.communication.',
  TeamError: class extends Error { constructor(public status: number, code: string) { super(code) } },
  readTeam: async (db: any, storeId: string, key: string) => { const row = await db.config.findUnique({ where: { storeId_key: { storeId, key: 'team.communication.' + key } } }); return row ? JSON.parse(row.value) : null },
  writeTeam: async (db: any, storeId: string, key: string, value: any) => { await db.config.upsert({ where: { storeId_key: { storeId, key: 'team.communication.' + key } }, create: { storeId, key: 'team.communication.' + key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } }); return value },
  lockTeam: async () => {},
  auditTeam: async (db: any, actor: any, channelId: string, action: string, details: any) => db.financeAuditLog.create({ data: { actor, channelId, action, details } })
}))
import { createAgentTaskService } from '../src/services/agentTasks/service'
import { createAgentTaskDispatcher } from '../src/services/agentTasks/dispatch'
import { persistentAdmissionBindings } from '../src/services/agentTasks/admissionBindings'
import { AGENT_TASK_CAPABILITY } from '../src/services/agentTasks/contract'
import { createAgentTaskRuntime } from '../src/services/agentTasks/runtime'
import { HermesRunsClient } from '../src/services/hermesTransport/client'
const plan = () => ({ objective: 'Review synthetic stock records without business writes', scope: AGENT_TASK_CAPABILITY,
  constraints: ['Read only; no stock, payment, employee-message or permission writes'], deadlineAt: '2026-10-22T12:00:00+07:00',
  firstReportWithinMs: 600000 as const, evidenceRequired: 'Native stock snapshot and explicit source references',
  criteria: [{ id: 'stock-proof', standard: 'Report the recorded quantities and distinguish unknown physical counts' }] })
const lease = () => ({ requestId: randomUUID(), authVersion: 1, taskId: randomUUID(), runId: randomUUID(), round: 1,
  expectedVersion: 2, leaseVersion: 1, leaseToken: randomUUID() })

async function serviceFixture() {
  const channelId = randomUUID(), storeId = 'synthetic-store', rows = new Map<string, any>(), audits: any[] = []
  let now = Date.parse('2026-10-21T00:00:00Z'), tail: Promise<unknown> = Promise.resolve()
  const principal = (agentId: string, role: 'manager'|'executor', scopes: string[]): AgentPrincipal => ({ agentId, role, storeId, grantVersion: 1, clientRevision: 1, scopes })
  const manager = principal('synthetic-manager','manager',['management.assign','management.read','management.review'])
  const executor = principal('synthetic-executor','executor',['executor.claim','executor.evidence','executor.report'])
  const grants = new Map([[manager.agentId, manager],[executor.agentId, executor]])
  const put = (key: string, value: any) => rows.set(storeId + ':' + 'team.communication.' + key, { storeId, key: 'team.communication.' + key, value: JSON.stringify(value), updatedAt: new Date(now) })
  put('channel.' + channelId, { id: channelId, ownerId: 'real-owner', kind: 'group', archived: false, version: 1, lastSeq: 3, members: [{staffId:'real-owner',fromSeq:1},{staffId:'real-employee',fromSeq:1}] })
  const stock = [{ id:'synthetic-cup', name:'Synthetic cup', unit:'pcs', currentStock:-12, updatedAt:'2026-10-20T23:00:00.000Z', ledgerSequence:3n, ledgerEpoch:1n }]
  const forbiddenWrite = jest.fn(async () => { throw Error('BUSINESS_WRITE_FORBIDDEN') })
  const db: any = {
    config: {
      findUnique: async (q: any) => rows.get(q.where.storeId_key.storeId + ':' + q.where.storeId_key.key) || null,
      upsert: async (q: any) => { const k=q.where.storeId_key.storeId+':'+q.where.storeId_key.key; const old=rows.get(k); const value={...(old||q.create),...(old?q.update:{}),updatedAt:new Date(now)};rows.set(k,value);return value },
      findMany: async (q: any) => [...rows.values()].filter(r => (!q.where?.storeId || r.storeId===q.where.storeId) && (!q.where?.key?.startsWith || r.key.startsWith(q.where.key.startsWith)) && (!q.where?.key?.gt || r.key>q.where.key.gt) && (!q.where?.key?.in || q.where.key.in.includes(r.key))).sort((a,b)=>a.key.localeCompare(b.key)).slice(0,q.take),
    },
    financeAuditLog: { create: async (q: any) => { audits.push(structuredClone(q.data));return q.data } },
    inventory: { findMany: jest.fn(async (q: any) => { expect(q.where.storeId).toBe(storeId);return structuredClone(stock) }), update:forbiddenWrite,create:forbiddenWrite,delete:forbiddenWrite },
    inventoryCountItem: { findFirst: jest.fn(async()=>null), update:forbiddenWrite },
    purchaseOrder: { create:forbiddenWrite,update:forbiddenWrite },
    $transaction: async (fn: (tx:any)=>Promise<any>, _options?:unknown) => {
      const prior=tail;let unlock!:()=>void;tail=new Promise<void>(resolve=>{unlock=resolve});await prior
      const saved=structuredClone([...rows]), auditCount=audits.length
      try{return await fn(db)}catch(e){rows.clear();for(const [k,v]of saved)rows.set(k,v);audits.splice(auditCount);throw e}finally{unlock()}
    }
  }
  const deps = {
    now:()=>now,
    authorize:async (_db:any,p:AgentPrincipal,scope:string,id:string) => {
      const live=grants.get(p.agentId)
      if(!live || live.storeId!==p.storeId || live.storeId!==storeId || live.grantVersion!==p.grantVersion || live.clientRevision!==p.clientRevision || live.role!==p.role || !live.scopes.includes(scope) || id && id!==channelId)throw Error('SYNTHETIC_AUTH_REVOKED')
      return structuredClone(live)
    },
    executorFor:async()=>structuredClone(grants.get(executor.agentId)!)
  }
  const service=createAgentTaskService(db,deps)
  const assignInput=()=>({requestId:randomUUID(),authVersion:1,channelId,taskCode:'STOCK-RO-001' as const,expectedVersion:0 as const,plan:plan()})
  const claimInput=(v:AgentTaskView)=>({requestId:randomUUID(),authVersion:1,taskId:v.taskId,runId:v.runId,round:v.round,expectedVersion:v.taskVersion})
  const leaseInput=(v:any,token:string)=>({...claimInput(v),leaseVersion:v.leaseVersion,leaseToken:token})
  const begin=async()=>{const assigned=await service.assign(manager,assignInput());const claimed=await service.claim(executor,claimInput(assigned));const evidence=await service.readStockEvidence(executor,leaseInput(claimed,claimed.leaseToken));return{assigned,claimed,evidence}}
  const reportInput=(v:any,token:string,outcome:'completed'|'unknown'='completed')=>({...leaseInput(v,token),evidenceId:v.evidenceId,inputSnapshotHash:v.inputSnapshotHash,outcome,rawReport:' \nNative book stock is -12 pcs; no certified physical count is available. This is not proof of physical shortage.\n ',sourceRefs:['inventory:synthetic-cup:1:3'],runtimeReceipt:{hermesRunId:'synthetic-hermes-run'}})
  const reviewInput=(v:any,evidenceId:string,decision:'accept'|'rework'='accept')=>({requestId:randomUUID(),authVersion:1,taskId:v.taskId,runId:v.runId,round:v.round,expectedVersion:v.taskVersion,reportId:v.report.id,reportVersion:v.report.version,decision,check:{summary:'Independently checked native immutable evidence',checkedEvidenceIds:[evidenceId],criteria:[{id:'stock-proof',result:(decision==='rework'?'not_met':'met') as 'not_met'|'met',note:decision==='rework'?'The report needs clearer explanation of the unverified physical count':'Recorded stock and unknown physical count are distinguished'}]},...(decision==='rework'?{nextPlan:{...plan(),objective:'Recheck the same immutable evidence and explicitly label the unknown physical count'}}:{})})
  return{service,db,manager,executor,grants,put,rows,audits,stock,channelId,storeId,forbiddenWrite,assignInput,claimInput,leaseInput,begin,reportInput,reviewInput,advance:(ms:number)=>{now+=ms},read:(key:string)=>{const row=rows.get(storeId+':team.communication.'+key);return row?JSON.parse(row.value):null}}
}


async function runtimeFixture(){
 const f=await serviceFixture(),state={depth:0,auditFail:false,admissionUnknown:false,publishFail:false,noSubscription:false},requests:{method:string;url:string}[]=[],callbacks:any[]=[],sessions=new Map<string,string>()
 const tx=f.db.$transaction,audit=f.db.financeAuditLog.create
 f.db.$transaction=async(fn:any,options?:unknown)=>tx(async(inner:any)=>{state.depth++;try{return await fn(inner)}finally{state.depth--}},options)
 f.db.financeAuditLog.create=async(q:any)=>{if(state.auditFail)throw Error('SYNTHETIC_AUDIT_FAIL');return audit(q)}
 const target={origin:'http://127.0.0.1:19779',identityId:'synthetic-runtime-transport',credentialGeneration:1}
 const client=new HermesRunsClient({origin:target.origin,profile:'synthetic-runtime',admissionBindings:persistentAdmissionBindings(f.db,f.storeId),bearerToken:()=> 'synthetic-runtime-token',fetch:async(url,request)=>{
   expect(state.depth).toBe(0);requests.push({url,method:request.method})
   if(request.method==='POST'){
     const body=JSON.parse(request.body!),refs=JSON.parse(body.input).references
     const task=f.read('task.'+f.channelId+'.'+refs.taskId),reservation=f.read('agent.dispatch.'+refs.eventId)
     expect(task.agentTask.runId).toBe(refs.backendRunId);expect(reservation.state).toBe('in_flight')
     expect(f.read('agent.transport.binding.'+refs.backendRunId)).toBeTruthy()
     if(state.admissionUnknown)throw Error('SYNTHETIC_ADMISSION_UNKNOWN')
     const id='run_synthetic_'+sessions.size;sessions.set(id,body.session_id)
     return{status:202,text:async()=>JSON.stringify({run_id:id,status:'queued',replayed:false})}
   }
   const id=url.split('/').at(-1)!;return{status:200,text:async()=>JSON.stringify({run_id:id,session_id:sessions.get(id),status:'running'})}
 }})
 const dispatcher=createAgentTaskDispatcher(f.db,{authorize:async(_db:any,p:AgentPrincipal,scope:any,channelId:string)=>{
   const live=f.grants.get(p.agentId);if(!live||live.storeId!==p.storeId||live.grantVersion!==p.grantVersion||live.clientRevision!==p.clientRevision||!live.scopes.includes(scope)||channelId!==f.channelId)throw Error('SYNTHETIC_AUTH_REVOKED');return live
 },now:()=>Date.parse('2026-10-21T00:00:00Z')},'synthetic-runtime',client,target)
 const publish=async(storeId:string,event:any)=>{expect(state.depth).toBe(0);expect(storeId).toBe(f.storeId);expect(f.read('agent.outbox.'+event.id).event).toEqual(event);callbacks.push(structuredClone(event));if(state.publishFail)throw Error('SYNTHETIC_CALLBACK_FAIL');return state.noSubscription?[]:[{state:'accepted'}]}
 const runtime=createAgentTaskRuntime(f.db,f.service,dispatcher,publish)
 const runToReport=async()=>{const assigned=await runtime.service.assign(f.manager,f.assignInput()),claimed=await runtime.service.claim(f.executor,f.claimInput(assigned)),evidence=await runtime.service.readStockEvidence(f.executor,f.leaseInput(claimed,claimed.leaseToken)),report=await runtime.service.report(f.executor,f.reportInput(evidence,claimed.leaseToken));return{assigned,claimed,evidence,report}}
 return{...f,state,requests,callbacks,runtime,publish,dispatcher,runToReport}
}

describe('post-commit native agent runtime composition',()=>{
 test('assign and rework automatically dispatch after commit; native report publishes its actual durable event; accept does not dispatch',async()=>{
  const f=await runtimeFixture(),first=await f.runToReport();expect(f.requests.filter(r=>r.method==='POST')).toHaveLength(1)
  expect(f.callbacks).toHaveLength(1);expect(f.callbacks[0].type).toBe('task.report_ready');expect(f.callbacks[0].payload.reportId).toBe(first.report.report!.id)
  expect(f.read('agent.outbox.'+f.callbacks[0].id).delivery.state).toBe('service_accepted')
  expect((await f.runtime.service.get(f.manager,{taskId:first.report.taskId,authVersion:1})).state).toBe('awaiting_review')
  const next=await f.runtime.service.review(f.manager,f.reviewInput(first.report,first.evidence.evidenceId,'rework'));expect(f.requests.filter(r=>r.method==='POST')).toHaveLength(2)
  const claimed=await f.runtime.service.claim(f.executor,f.claimInput(next)),evidence=await f.runtime.service.readStockEvidence(f.executor,f.leaseInput(claimed,claimed.leaseToken)),report=await f.runtime.service.report(f.executor,f.reportInput(evidence,claimed.leaseToken))
  expect(f.callbacks).toHaveLength(2);const accepted=await f.runtime.service.review(f.manager,f.reviewInput(report,evidence.evidenceId))
  expect(accepted.state).toBe('accepted');expect(f.requests.filter(r=>r.method==='POST')).toHaveLength(2);expect(f.callbacks).toHaveLength(2);expect(f.forbiddenWrite).not.toHaveBeenCalled()
 })
 test('failed assignment and failed rework transactions cannot dispatch a rolled-back run',async()=>{
  const f=await runtimeFixture();f.state.auditFail=true
  await expect(f.runtime.service.assign(f.manager,f.assignInput())).rejects.toThrow('SYNTHETIC_AUDIT_FAIL');expect(f.requests).toHaveLength(0);expect(f.callbacks).toHaveLength(0)
  expect([...f.rows.values()].filter((r:any)=>r.key.startsWith('team.communication.task.'))).toHaveLength(0)
  f.state.auditFail=false;const first=await f.runToReport();f.state.auditFail=true
  await expect(f.runtime.service.review(f.manager,f.reviewInput(first.report,first.evidence.evidenceId,'rework'))).rejects.toThrow('SYNTHETIC_AUDIT_FAIL')
  expect(f.requests.filter(r=>r.method==='POST')).toHaveLength(1)
  const current=await f.service.get(f.manager,{taskId:first.report.taskId,authVersion:1});expect(current.runId).toBe(first.report.runId);expect(current.round).toBe(1)
 })
 test('unknown automatic admission emits its original attention event and outbox recovery never repeats POST',async()=>{
  const f=await runtimeFixture();f.state.admissionUnknown=true;const assigned=await f.runtime.service.assign(f.manager,f.assignInput())
  expect(f.requests.filter(r=>r.method==='POST')).toHaveLength(1);expect(f.callbacks).toHaveLength(1);expect(f.callbacks[0].type).toBe('task.blocked')
  expect((await f.service.get(f.manager,{taskId:assigned.taskId,authVersion:1})).error).toBe('AGENT_TRANSPORT_ADMISSION_UNKNOWN')
  const original=f.callbacks[0].id;await f.runtime.recoverOutbox(f.manager,{authVersion:1,after:0,limit:100})
  expect(f.requests.filter(r=>r.method==='POST')).toHaveLength(1);expect(f.callbacks.at(-1).id).toBe(original)
 })
 test('callback failure retains pending event; missing subscription remains durable; recovery republishes that same report without a new run or POST',async()=>{
  const f=await runtimeFixture();f.state.publishFail=true;const first=await f.runToReport(),event=f.callbacks[0]
  expect(f.read('agent.outbox.'+event.id).delivery.state).toBe('pending');expect(f.read('agent.outbox.'+event.id).delivery.error).toBe('AGENT_EVENT_DELIVERY_UNCONFIRMED')
  f.state.publishFail=false;f.state.noSubscription=true;await f.runtime.recoverOutbox(f.manager,{authVersion:1,after:0,limit:100})
  expect(f.read('agent.outbox.'+event.id).delivery.state).toBe('awaiting_subscription')
  f.state.noSubscription=false;await f.runtime.recoverOutbox(f.manager,{authVersion:1,after:0,limit:100})
  expect(f.read('agent.outbox.'+event.id).delivery.state).toBe('service_accepted');expect(f.callbacks.every(e=>e.id===event.id)).toBe(true)
  expect(f.requests.filter(r=>r.method==='POST')).toHaveLength(1)
  const current=await f.service.get(f.manager,{taskId:first.report.taskId,authVersion:1});expect(current.runId).toBe(first.report.runId);expect(current.report!.id).toBe(first.report.report!.id);expect(current.state).toBe('awaiting_review')
 })
})
