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
import { AGENT_TASK_CAPABILITY, agentPlanSchema, assignTaskSchema, claimTaskSchema, leaseSchema, reportTaskSchema, reviewTaskSchema } from '../src/services/agentTasks/contract'

const plan = () => ({ objective: 'Review synthetic stock records without business writes', scope: AGENT_TASK_CAPABILITY,
  constraints: ['Read only; no stock, payment, employee-message or permission writes'], deadlineAt: '2026-10-22T12:00:00+07:00',
  firstReportWithinMs: 600000 as const, evidenceRequired: 'Native stock snapshot and explicit source references',
  criteria: [{ id: 'stock-proof', standard: 'Report the recorded quantities and distinguish unknown physical counts' }] })
const lease = () => ({ requestId: randomUUID(), authVersion: 1, taskId: randomUUID(), runId: randomUUID(), round: 1,
  expectedVersion: 2, leaseVersion: 1, leaseToken: randomUUID() })

describe('Hermes agent task fixed capability contract', () => {
  test('assignment is one explicit read capability and never accepts principal identity or executable tools from JSON', () => {
    const input = { requestId: randomUUID(), authVersion: 1, channelId: randomUUID(), taskCode: 'STOCK-RO-001', expectedVersion: 0, plan: plan() }
    expect(assignTaskSchema.parse(input)).toEqual(input)
    for (const extra of [{ agentId: 'manager' }, { role: 'manager' }, { storeId: 'other-store' }, { scopes: ['*'] }, { sql: 'UPDATE inventory' }, { tools: ['pay'] }]) expect(assignTaskSchema.safeParse({ ...input, ...extra }).success).toBe(false)
    expect(assignTaskSchema.safeParse({ ...input, plan: { ...plan(), scope: 'stock_write_v1' } }).success).toBe(false)
  })
  test('first report cadence, acceptance criteria and all lease fences are mandatory', () => {
    expect(agentPlanSchema.safeParse({ ...plan(), firstReportWithinMs: 1 }).success).toBe(false)
    expect(agentPlanSchema.safeParse({ ...plan(), criteria: [...plan().criteria, ...plan().criteria] }).success).toBe(false)
    for (const field of ['runId', 'round', 'expectedVersion', 'leaseVersion', 'leaseToken', 'authVersion']) {
      const input: any = lease(); delete input[field]; expect(leaseSchema.safeParse(input).success).toBe(false)
    }
    expect(claimTaskSchema.safeParse({ requestId: randomUUID(), authVersion: 1, taskId: randomUUID(), runId: randomUUID(), round: 0, expectedVersion: 1 }).success).toBe(false)
  })
  test('model/runtime completion is a report outcome, never an acceptance command', () => {
    const input = { ...lease(), evidenceId: randomUUID(), inputSnapshotHash: 'a'.repeat(64), outcome: 'completed', rawReport: 'Synthetic recorded stock reviewed; physical stock remains unknown.', sourceRefs: ['inventory:synthetic'], runtimeReceipt: { hermesRunId: 'synthetic-hermes-run' } }
    expect(reportTaskSchema.parse(input)).toEqual(input)
    expect(reportTaskSchema.safeParse({ ...input, state: 'accepted' }).success).toBe(false)
    expect(reportTaskSchema.safeParse({ ...input, outcome: 'accepted' }).success).toBe(false)
    const noEvidence: any = { ...input }; delete noEvidence.evidenceId; delete noEvidence.inputSnapshotHash
    expect(reportTaskSchema.safeParse(noEvidence).success).toBe(false)
    expect(reportTaskSchema.safeParse({ ...noEvidence, outcome: 'unknown', sourceRefs: [] }).success).toBe(true)
    expect(reportTaskSchema.safeParse({ ...input, inputSnapshotHash: 'not-a-hash' }).success).toBe(false)
    expect(reportTaskSchema.safeParse({ ...input, runtimeReceipt: { hermesRunId: 'synthetic', credential: 'never-accepted' } }).success).toBe(false)
  })
  test('manager review must cite an immutable report, checked evidence and per-criterion result', () => {
    const input = { requestId: randomUUID(), authVersion: 1, taskId: randomUUID(), runId: randomUUID(), round: 1, expectedVersion: 4,
      reportId: randomUUID(), reportVersion: 1, decision: 'accept', check: { summary: 'Checked native evidence independently', checkedEvidenceIds: [randomUUID()], criteria: [{ id: 'stock-proof', result: 'met', note: 'Native record matches report' }] } }
    expect(reviewTaskSchema.parse(input)).toEqual(input)
    for (const field of ['reportId', 'reportVersion', 'check']) { const missing: any = { ...input }; delete missing[field]; expect(reviewTaskSchema.safeParse(missing).success).toBe(false) }
    expect(reviewTaskSchema.safeParse({ ...input, decision: 'rework', check: { ...input.check, checkedEvidenceIds: [] }, nextPlan: plan() }).success).toBe(true)
    expect(reviewTaskSchema.safeParse({ ...input, approved: true }).success).toBe(false)
  })
})

// JSON persistence and serialized rollback transactions; real service/source builder,
// synthetic authorization and native stock rows. No sockets, provider or staff impersonation.
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

function expectMetadataOnly(value:any){
  expect(value.evidence).toBeUndefined()
  if(value.report){
    expect(Object.keys(value.report).sort()).toEqual(['id','version','runId','round','outcome','createdAt'].sort())
    for(const field of ['rawReport','sourceRefs','runtimeReceipt','evidenceId','inputSnapshotHash'])expect(value.report[field]).toBeUndefined()
  }
}

describe('Hermes task business service with real immutable stock evidence',()=>{
  test('assign → claim → evidence → awaiting review → rework new round → report → explicit manager accept',async()=>{
    const f=await serviceFixture(),{claimed,evidence}=await f.begin()
    expect(claimed.state).toBe('running');expect((evidence.evidence as any).items[0].stock).toBe(-12)
    const reported=await f.service.report(f.executor,f.reportInput(evidence,claimed.leaseToken))
    expect(reported.state).toBe('awaiting_review');expect(reported.report?.outcome).toBe('completed');expectMetadataOnly(claimed);expectMetadataOnly(reported)
    const managerView=await f.service.get(f.manager,{taskId:reported.taskId,authVersion:1})
    expect(managerView.report?.rawReport).toBe(f.reportInput(evidence,claimed.leaseToken).rawReport)
    expect(managerView.report?.sourceRefs).toEqual(['inventory:synthetic-cup:1:3']);expect(managerView.evidence?.evidence).toEqual(evidence.evidence)
    const claimOnly={...f.executor,scopes:['executor.claim']};f.grants.set(f.executor.agentId,claimOnly)
    expectMetadataOnly(await f.service.get(claimOnly,{taskId:reported.taskId,authVersion:1}))
    await expect(f.service.readStockEvidence(claimOnly,f.leaseInput(evidence,claimed.leaseToken))).rejects.toThrow()
    f.grants.set(f.executor.agentId,f.executor)
    const reworked=await f.service.review(f.manager,f.reviewInput(reported,evidence.evidenceId,'rework'))
    expectMetadataOnly(reworked);expect(reworked.round).toBe(reported.round+1);expect(reworked.runId).not.toBe(reported.runId);expect(reworked.state).toBe('assigned')
    const claimed2=await f.service.claim(f.executor,f.claimInput(reworked)),evidence2=await f.service.readStockEvidence(f.executor,f.leaseInput(claimed2,claimed2.leaseToken))
    const reported2=await f.service.report(f.executor,f.reportInput(evidence2,claimed2.leaseToken))
    const accepted=await f.service.review(f.manager,f.reviewInput(reported2,evidence2.evidenceId))
    expect(accepted.state).toBe('accepted');expectMetadataOnly(accepted);expect(f.forbiddenWrite).not.toHaveBeenCalled()
    const saved=f.read('task.'+f.channelId+'.'+accepted.taskId);expect(saved.status).toBe('completed');expect(saved.agentTask.checks).toHaveLength(2)
  })
  test('same mutation request has an exact receipt and never repeats dispatch/report/review',async()=>{
    const f=await serviceFixture(),input=f.assignInput(),assigned=await f.service.assign(f.manager,input)
    expect(await f.service.assign(f.manager,input)).toEqual(assigned)
    await expect(f.service.assign(f.manager,{...input,plan:{...input.plan,objective:'Changed under same request'}})).rejects.toThrow()
    const cinput=f.claimInput(assigned),claimed=await f.service.claim(f.executor,cinput)
    expect(await f.service.claim(f.executor,cinput)).toEqual(claimed)
    const einput=f.leaseInput(claimed,claimed.leaseToken),e=await f.service.readStockEvidence(f.executor,einput)
    expect(await f.service.readStockEvidence(f.executor,einput)).toEqual(e)
    const rinput=f.reportInput(e,claimed.leaseToken),reported=await f.service.report(f.executor,rinput)
    expect(await f.service.report(f.executor,rinput)).toEqual(reported)
    const full=await f.service.get(f.manager,{taskId:reported.taskId,authVersion:1}),receiptKey='agent.request.'+f.executor.agentId+'.'+rinput.requestId,legacy=f.read(receiptKey)
    f.put(receiptKey,{...legacy,result:{...legacy.result,evidence:full.evidence,report:full.report}})
    const legacyReplay=await f.service.report(f.executor,rinput);expectMetadataOnly(legacyReplay);expect(legacyReplay).toEqual(reported)
    await expect(f.service.report(f.executor,{...rinput,rawReport:rinput.rawReport+' '})).rejects.toThrow()
    const review=f.reviewInput(reported,e.evidenceId),accepted=await f.service.review(f.manager,review)
    expect(await f.service.review(f.manager,review)).toEqual(accepted)
    const events=await f.service.events(f.manager,{authVersion:1,after:0,limit:100});expect(events.events.filter(e=>e.type==='task.dispatch_ready')).toHaveLength(1)
  })
  test('concurrent claims have one lease winner; stale lease and old report cannot overwrite a new round',async()=>{
    const f=await serviceFixture(),assigned=await f.service.assign(f.manager,f.assignInput())
    const claims=await Promise.allSettled([f.service.claim(f.executor,f.claimInput(assigned)),f.service.claim(f.executor,f.claimInput(assigned))])
    expect(claims.filter(r=>r.status==='fulfilled')).toHaveLength(1)
    const claimed=(claims.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>).value,e=await f.service.readStockEvidence(f.executor,f.leaseInput(claimed,claimed.leaseToken))
    await expect(f.service.report(f.executor,{...f.reportInput(e,claimed.leaseToken),leaseToken:randomUUID()})).rejects.toThrow()
    const old=f.reportInput(e,claimed.leaseToken),report=await f.service.report(f.executor,old),next=await f.service.review(f.manager,f.reviewInput(report,e.evidenceId,'rework'))
    await expect(f.service.report(f.executor,{...old,requestId:randomUUID()})).rejects.toThrow()
    expect((await f.service.get(f.manager,{taskId:next.taskId,authVersion:1})).round).toBe(next.round)
  })
  test('captured evidence is immutable despite stock drift; invented source, wrong evidence/hash and unmet acceptance are rejected',async()=>{
    const f=await serviceFixture(),{claimed,evidence}=await f.begin(),before=structuredClone(evidence.evidence)
    const visible=await f.service.get(f.manager,{taskId:evidence.taskId,authVersion:1})
    expectMetadataOnly(await f.service.get(f.executor,{taskId:evidence.taskId,authVersion:1}))
    expect(visible.evidence).toEqual({evidenceId:evidence.evidenceId,inputSnapshotHash:evidence.inputSnapshotHash,evidence:before})
    const key=f.storeId+':team.communication.agent.evidence.'+evidence.evidenceId,original=structuredClone(f.rows.get(key)),record=JSON.parse(original.value)
    for(const corrupt of [{...record,runId:randomUUID()},{...record,snapshotHash:'c'.repeat(64)},{...record,snapshot:{...record.snapshot,items:[{...record.snapshot.items[0],stock:111}]}}]){
      f.rows.set(key,{...original,value:JSON.stringify(corrupt)})
      await expect(f.service.get(f.manager,{taskId:evidence.taskId,authVersion:1})).rejects.toThrow('AGENT_TASK_EVIDENCE_CHANGED')
      f.rows.set(key,structuredClone(original))
    }
    f.stock[0].currentStock=999
    const second=await f.service.readStockEvidence(f.executor,f.leaseInput(evidence,claimed.leaseToken));expect(second.evidence).toEqual(before);expect(second.inputSnapshotHash).toBe(evidence.inputSnapshotHash)
    for(const extra of [{evidenceId:randomUUID()},{inputSnapshotHash:'b'.repeat(64)},{sourceRefs:['inventory:other-store:1:1']}])await expect(f.service.report(f.executor,{...f.reportInput(evidence,claimed.leaseToken),...extra})).rejects.toThrow()
    const report=await f.service.report(f.executor,f.reportInput(evidence,claimed.leaseToken)),review=f.reviewInput(report,evidence.evidenceId)
    await expect(f.service.review(f.manager,{...review,check:{...review.check,criteria:[{id:'stock-proof',result:'not_met',note:'Not verified'}]}})).rejects.toThrow()
    await expect(f.service.review(f.manager,{...review,check:{...review.check,checkedEvidenceIds:[randomUUID()]}})).rejects.toThrow()
    expect((await f.service.get(f.manager,{taskId:report.taskId,authVersion:1})).state).toBe('awaiting_review')
  })
  test('cross-store, wrong role and revoked live grant cannot read or mutate, even through an existing receipt',async()=>{
    const f=await serviceFixture(),input=f.assignInput(),assigned=await f.service.assign(f.manager,input)
    await expect(f.service.get({...f.manager,storeId:'other-store'},{taskId:assigned.taskId,authVersion:1})).rejects.toThrow()
    await expect(f.service.claim(f.manager,f.claimInput(assigned))).rejects.toThrow()
    f.grants.delete(f.manager.agentId)
    await expect(f.service.assign(f.manager,input)).rejects.toThrow()
    await expect(f.service.get(f.manager,{taskId:assigned.taskId,authVersion:1})).rejects.toThrow()
    f.grants.delete(f.executor.agentId)
    await expect(f.service.claim(f.executor,f.claimInput(assigned))).rejects.toThrow()
    await expect(f.service.events(f.manager,{authVersion:1,after:0,limit:100})).rejects.toThrow()
  })
  test('failed runtime before evidence permits an explicit manager rework, never acceptance',async()=>{
    const f=await serviceFixture(),assigned=await f.service.assign(f.manager,f.assignInput()),c=await f.service.claim(f.executor,f.claimInput(assigned))
    const report=await f.service.report(f.executor,{...f.leaseInput(c,c.leaseToken),outcome:'failed',rawReport:'Hermes execution failed before the native stock evidence could be read.',sourceRefs:[]})
    expect(report.state).toBe('blocked');expect(report.report?.evidenceId).toBeUndefined()
    const review={...f.reviewInput(report,randomUUID(),'rework'),check:{summary:'Checked the failed raw runtime report; no native evidence was collected.',checkedEvidenceIds:[],criteria:[{id:'stock-proof',result:'not_met' as const,note:'Native evidence was not read'}]}}
    await expect(f.service.review(f.manager,{...review,decision:'accept',nextPlan:undefined})).rejects.toThrow()
    const next=await f.service.review(f.manager,review);expect(next.state).toBe('assigned');expect(next.round).toBe(2);expect(next.runId).not.toBe(report.runId)
  })
  test('unknown runtime outcome and an expired lease never automatically redispatch',async()=>{
    const f=await serviceFixture(),{claimed,evidence}=await f.begin(),unknown=await f.service.report(f.executor,f.reportInput(evidence,claimed.leaseToken,'unknown'))
    expect(unknown.state).toBe('unknown')
    await expect(f.service.claim(f.executor,f.claimInput(unknown))).rejects.toThrow()
    await expect(f.service.review(f.manager,f.reviewInput(unknown,evidence.evidenceId,'rework'))).rejects.toThrow()
    const events=await f.service.events(f.executor,{authVersion:1,after:0,limit:100});expect(events.events.filter(e=>e.type==='task.dispatch_ready')).toHaveLength(1)
    const noEvidence=await serviceFixture(),a0=await noEvidence.service.assign(noEvidence.manager,noEvidence.assignInput()),c0=await noEvidence.service.claim(noEvidence.executor,noEvidence.claimInput(a0))
    const u0=await noEvidence.service.report(noEvidence.executor,{...noEvidence.leaseInput(c0,c0.leaseToken),outcome:'unknown',rawReport:'Runtime outcome is unknown before native evidence was read.',sourceRefs:[]})
    expect(u0.state).toBe('unknown');await expect(noEvidence.service.claim(noEvidence.executor,noEvidence.claimInput(u0))).rejects.toThrow()
    const g=await serviceFixture(),assigned=await g.service.assign(g.manager,g.assignInput()),c=await g.service.claim(g.executor,g.claimInput(assigned));g.advance(600001)
    await expect(g.service.readStockEvidence(g.executor,g.leaseInput(c,c.leaseToken))).rejects.toThrow()
    await expect(g.service.claim(g.executor,g.claimInput(c))).rejects.toThrow()
  })
})
