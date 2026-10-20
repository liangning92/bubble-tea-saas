import { test, expect, jest } from '@jest/globals'
import { randomUUID } from 'crypto'
import type { AgentPrincipal } from '../src/services/agentTasks/contract'
jest.mock('../src/services/TeamCommunicationService',()=>({TEAM_PREFIX:'team.communication.',TeamError:class extends Error{constructor(public status:number,code:string){super(code)}},lockTeam:async()=>{},readTeam:async(db:any,s:string,k:string)=>{const r=await db.config.findUnique({where:{storeId_key:{storeId:s,key:'team.communication.'+k}}});return r?JSON.parse(r.value):null},writeTeam:async(db:any,s:string,k:string,v:any)=>db.config.upsert({where:{storeId_key:{storeId:s,key:'team.communication.'+k}},create:{storeId:s,key:'team.communication.'+k,value:JSON.stringify(v)},update:{value:JSON.stringify(v)}})}))
import { createAgentTaskService } from '../src/services/agentTasks/service'
import { reviewTaskSchema } from '../src/services/agentTasks/contract'

function fixture(state='unknown',billingStatus='possible'){
 const taskId=randomUUID(),runId=randomUUID(),channelId=randomUUID(),requestId=randomUUID(),storeId='synthetic-store',rows=new Map<string,any>(),audits:any[]=[]
 let now=Date.parse('2026-10-21T00:00:00Z'),revoked=false,failAudit=false,tail=Promise.resolve()
 const manager:AgentPrincipal={agentId:'manager',storeId,role:'manager',grantVersion:1,clientRevision:1,scopes:['management.read','management.review']}
 const executor:AgentPrincipal={agentId:'executor',storeId,role:'executor',grantVersion:1,clientRevision:1,scopes:['executor.claim','executor.evidence','executor.report']}
 const plan={objective:'Synthetic stock review',scope:'stock_readonly_v1' as const,constraints:['Read only'],deadlineAt:new Date(now+3600000).toISOString(),firstReportWithinMs:600000 as const,evidenceRequired:'Native snapshot',criteria:[{id:'stock',standard:'Distinguish known and unknown'}]}
 const put=(k:string,v:any)=>rows.set('team.communication.'+k,{storeId,key:'team.communication.'+k,value:JSON.stringify(v)})
 const read=(k:string)=>{const r=rows.get('team.communication.'+k);return r&&JSON.parse(r.value)}
 put('channel.'+channelId,{id:channelId,lastSeq:0,archived:false});put('agent.task.index.'+taskId,{channelId});put('agent.task.code.STOCK-RO-001',{taskId,channelId})
 put('task.'+channelId+'.'+taskId,{id:taskId,channelId,version:3,status:'accepted',events:[],agentTask:{taskCode:'STOCK-RO-001',capability:'stock_readonly_v1',managerId:manager.agentId,executorId:executor.agentId,runId,eventId:randomUUID(),round:1,leaseVersion:1,state:'running',lease:{token:randomUUID(),until:now+10000,grantVersion:1,clientRevision:1},plan,checks:[]}})
 put('agent.model.run.'+runId,{requestId});put('agent.model.request.executor.'+requestId,{taskId,runId,taskVersion:3,state,billingStatus,...(state==='blocked'&&billingStatus==='not_started'?{error:'AGENT_MODEL_NOT_SENT'}:{}),deadlineAt:now+5000})
 const db:any={config:{findUnique:async(q:any)=>q.where.storeId_key.storeId===storeId?rows.get(q.where.storeId_key.key)||null:null,upsert:async(q:any)=>{const old=rows.get(q.where.storeId_key.key),v=old?{...old,...q.update}:q.create;rows.set(q.where.storeId_key.key,v);return v}},financeAuditLog:{create:async(q:any)=>{if(failAudit)throw Error('AUDIT_FAULT');audits.push(q.data);return q.data}}}
 db.$transaction=async(fn:any)=>{const prior=tail;let release!:()=>void;tail=new Promise<void>(r=>release=r);await prior;const before=structuredClone([...rows]),len=audits.length;try{return await fn(db)}catch(e){rows.clear();for(const [k,v]of before)rows.set(k,v);audits.splice(len);throw e}finally{release()}}
 const service=createAgentTaskService(db,{now:()=>now,authorize:async(_db,p,scope,c)=>{if(revoked||p.storeId!==storeId||p.agentId!==manager.agentId||p.role!=='manager'||p.grantVersion!==1||p.clientRevision!==1||!p.scopes.includes(scope)||c!==channelId)throw Error('AUTH_REVOKED');return manager},executorFor:async()=>executor})
 const input=()=>({taskId,runId,round:1,expectedVersion:read('task.'+channelId+'.'+taskId).version,authVersion:1})
 const review=(v:any)=>({requestId:randomUUID(),authVersion:1,taskId,runId,round:1,expectedVersion:v.taskVersion,programFailureId:v.programFailure.id,programFailureVersion:v.programFailure.version,decision:'rework' as const,check:{summary:'Program never sent model request; repair and explicitly retry',checkedEvidenceIds:[],criteria:[{id:'stock',result:'not_met' as const,note:'No executor report was produced'}]},nextPlan:plan})
 return{service,manager,executor,rows,audits,put,read,input,review,requestId,taskId,runId,channelId,modelKey:'agent.model.request.executor.'+requestId,advance:(ms:number)=>now+=ms,revoke:()=>revoked=true,failAudit:()=>failAudit=true}
}

test('supervision unknown emits one native program blocked outbox without inventing a report or repeating models',async()=>{
 const f=fixture(),input=f.input(),outcomes=await Promise.allSettled([f.service.supervise(f.manager,input),f.service.supervise(f.manager,input)])
 expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1)
 const v=await f.service.get(f.manager,{taskId:f.taskId,authVersion:1});expect(v.state).toBe('unknown');expect(v.programFailure?.source).toBe('program');expect(v.programFailure?.knownNotSent).toBe(false);expect(v.report).toBeUndefined()
 expect(f.read('task.'+f.channelId+'.'+f.taskId).agentTask.lease).toBeUndefined()
 expect([...f.rows.keys()].filter(k=>k.includes('agent.outbox.'))).toHaveLength(1)
 expect([...f.rows.keys()].filter(k=>k.includes('agent.report.'))).toHaveLength(0)
 expect(f.read(f.modelKey).state).toBe('unknown');expect(f.audits[0].newValue).toContain('"source":"program"')
 await expect(f.service.review(f.manager,f.review(v))).rejects.toThrow('AGENT_TASK_PROGRAM_RECOVERY_FORBIDDEN')
})

test('supervision known not sent gets manager-only failure receipt and explicit native rework with permanent request receipt',async()=>{
 const f=fixture('blocked','not_started'),v=await f.service.supervise(f.manager,f.input())
 expect(v.state).toBe('blocked');expect(v.programFailure?.knownNotSent).toBe(true)
 const input=f.review(v);expect(reviewTaskSchema.safeParse({...input,decision:'accept'}).success).toBe(false)
 expect(reviewTaskSchema.safeParse({...input,reportId:randomUUID(),reportVersion:1}).success).toBe(false)
 const next=await f.service.review(f.manager,input);expect(next.state).toBe('assigned');expect(next.round).toBe(2);expect(next.runId).not.toBe(f.runId);expect(next.report).toBeUndefined();expect(next.programFailure).toBeUndefined()
 expect(await f.service.review(f.manager,input)).toEqual(next)
 expect(f.read('task.'+f.channelId+'.'+f.taskId).agentTask.checks[0].programFailureId).toBe(v.programFailure!.id)
})

test('supervision stale report deadline and uncertain calling preserve unknown; only expired never-started reservation may rework',async()=>{
 for(const [state,billing,known]of [['calling','possible',false],['reserved','not_started',true],['ready','usage_recorded',false]] as const){
  const f=fixture(state,billing);f.advance(11000);const v=await f.service.supervise(f.manager,f.input());expect(v.programFailure?.knownNotSent).toBe(known);expect(v.state).toBe(known?'blocked':'unknown');expect(f.read(f.modelKey).state).toBe(state)
 }
})

test('supervision billing/provider receipt contradicting not-started is never recoverable; withheld is unknown',async()=>{
 for(const [state,billing]of [['blocked','usage_recorded'],['withheld','usage_recorded']] as const){const f=fixture(state,billing),v=await f.service.supervise(f.manager,f.input());expect(v.state).toBe('unknown');await expect(f.service.review(f.manager,f.review(v))).rejects.toThrow()}
 const f=fixture('blocked','not_started');f.put(f.modelKey,{...f.read(f.modelKey),providerReceipt:{usage:{completion_tokens:1}}});expect((await f.service.supervise(f.manager,f.input())).state).toBe('unknown')
})

test('supervision revoked, cross-store, old run/version and submitted reports never mutate or bypass fresh authority',async()=>{
 const f=fixture(),before=JSON.stringify([...f.rows]);
 await expect(f.service.supervise({...f.manager,storeId:'other'},f.input())).rejects.toThrow()
 await expect(f.service.supervise(f.executor,f.input())).rejects.toThrow()
 await expect(f.service.supervise(f.manager,{...f.input(),runId:randomUUID()})).rejects.toThrow()
 await expect(f.service.supervise(f.manager,{...f.input(),expectedVersion:2})).rejects.toThrow()
 f.revoke();await expect(f.service.supervise(f.manager,f.input())).rejects.toThrow();expect(JSON.stringify([...f.rows])).toBe(before)
})

test('supervision audit failure rolls back task transition, lease, failure receipt and event',async()=>{
 const f=fixture(),before=JSON.stringify([...f.rows]);f.failAudit();await expect(f.service.supervise(f.manager,f.input())).rejects.toThrow('AUDIT_FAULT');expect(JSON.stringify([...f.rows])).toBe(before)
})
