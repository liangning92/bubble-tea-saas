import { describe, expect, jest, test } from '@jest/globals'
import { randomUUID } from 'crypto'
import type { AgentPrincipal } from '../src/services/agentTasks/contract'
jest.mock('../src/services/TeamCommunicationService',()=>({
  TeamError:class extends Error{constructor(public status:number,code:string){super(code)}},
  readTeam:async(db:any,storeId:string,key:string)=>{const r=await db.config.findUnique({where:{storeId_key:{storeId,key:'team.communication.'+key}}});return r?JSON.parse(r.value):null},
  writeTeam:async(db:any,storeId:string,key:string,value:any)=>{await db.config.upsert({where:{storeId_key:{storeId,key:'team.communication.'+key}},create:{storeId,key:'team.communication.'+key,value:JSON.stringify(value)},update:{value:JSON.stringify(value)}});return value},
  lockTeam:async()=>{}
}))
import { persistentAdmissionBindings } from '../src/services/agentTasks/admissionBindings'
import { createAgentTaskDispatcher } from '../src/services/agentTasks/dispatch'
import { prepareDispatchEvent, HermesRunsClient } from '../src/services/hermesTransport/client'

function fixture(){
 const storeId='synthetic-store',channelId=randomUUID(),taskId=randomUUID(),runId=randomUUID(),eventId=randomUUID(),rows=new Map<string,any>(),audits:any[]=[],calls:{url:string;method:string;body?:string}[]=[]
 const principal:AgentPrincipal={agentId:'synthetic-dot',role:'manager',storeId,grantVersion:1,clientRevision:1,scopes:['management.assign']}
 const target={origin:'http://127.0.0.1:19777',identityId:'synthetic-transport-identity',credentialGeneration:1}
 const state={token:'synthetic-transport-token',now:Date.parse('2026-10-21T00:00:00Z'),revoked:false,auditFail:false,status:'queued',admission:'accepted' as 'accepted'|'unknown'|'rejected'|'throw',active:false,gate:undefined as undefined|Promise<void>}
 let tail:Promise<unknown>=Promise.resolve()
 const put=(key:string,v:any)=>rows.set(storeId+':team.communication.'+key,{storeId,key:'team.communication.'+key,value:JSON.stringify(v)})
 const read=(key:string)=>{const r=rows.get(storeId+':team.communication.'+key);return r?JSON.parse(r.value):null}
 const task:any={id:taskId,channelId,status:'assigned',version:1,agentTask:{managerId:principal.agentId,executorId:'synthetic-hermes',state:'assigned',round:1,runId,eventId,leaseVersion:0,plan:{deadlineAt:'2026-10-22T12:00:00Z'}}}
 const event={id:eventId,sequence:1,type:'task.dispatch_ready',occurredAt:'2026-10-21T00:00:00Z',payload:{taskId,runId,round:1,taskVersion:1}}
 put('channel.'+channelId,{id:channelId,archived:false});put('task.'+channelId+'.'+taskId,task);put('agent.outbox.'+eventId,{event,channelId,managerId:principal.agentId,executorId:'synthetic-hermes',status:'pending'});put('agent.event.cursor',{sequence:1});put('agent.event.000000000001',event)
 const db:any={config:{findUnique:async(q:any)=>rows.get(q.where.storeId_key.storeId+':'+q.where.storeId_key.key)||null,upsert:async(q:any)=>{const k=q.where.storeId_key.storeId+':'+q.where.storeId_key.key;rows.set(k,{...(rows.get(k)||q.create),...(rows.has(k)?q.update:{})});return rows.get(k)}},financeAuditLog:{create:async(q:any)=>{if(state.auditFail)throw Error('SYNTHETIC_AUDIT_FAILURE');audits.push(q.data);return q.data}},$transaction:async(fn:any)=>{const prior=tail;let unlock!:()=>void;tail=new Promise<void>(r=>unlock=r);await prior;const saved=structuredClone([...rows]),n=audits.length;state.active=true;try{return await fn(db)}catch(e){rows.clear();for(const[k,v]of saved)rows.set(k,v);audits.splice(n);throw e}finally{state.active=false;unlock()}}}
 const deps={now:()=>state.now,authorize:async(_db:any,p:AgentPrincipal,scope:string,c:string)=>{if(state.revoked||p.storeId!==storeId||p.agentId!==principal.agentId||p.role!=='manager'||p.grantVersion!==1||p.clientRevision!==1||!p.scopes.includes(scope)||c!==channelId)throw Error('SYNTHETIC_AUTH_REVOKED');return p}}
 const bindings=persistentAdmissionBindings(db,storeId)
 const client=new HermesRunsClient({origin:target.origin,profile:'synthetic-stock',admissionBindings:bindings,bearerToken:()=>state.token,fetch:async(url,request)=>{
   calls.push({url,method:request.method,body:request.body});expect(state.active).toBe(false)
   if(request.method==='POST'){
     const reserved=read('agent.dispatch.'+eventId);expect(reserved.state).toBe('in_flight');expect(audits.some(a=>a.description==='agent_dispatch_reserved')).toBe(true)
     if(state.gate)await state.gate
     if(state.admission==='throw')throw Error('SYNTHETIC_NETWORK_UNKNOWN')
     if(state.admission==='unknown')return{status:503,text:async()=>{throw Error('ERROR_BODY_MUST_NOT_BE_READ')}}
     if(state.admission==='rejected')return{status:401,text:async()=>{throw Error('ERROR_BODY_MUST_NOT_BE_READ')}}
     return{status:202,text:async()=>JSON.stringify({run_id:'run_synthetic',status:'queued',replayed:false})}
   }
   return{status:200,text:async()=>JSON.stringify({run_id:'run_synthetic',session_id:read('agent.dispatch.'+eventId).prepared.sessionId,status:state.status,output:'Untrusted runtime output must not become task acceptance'})}
 }})
 const make=(nextTarget=target)=>createAgentTaskDispatcher(db,deps,'synthetic-stock',client,nextTarget),dispatcher=make(),input={eventId,authVersion:1}
 return{db,deps,dispatcher,make,target,bindings,client,storeId,input,principal,state,calls,rows,audits,put,read,task,taskId,channelId,eventId}
}

describe('persisted Hermes admission and status never substitute for task execution or acceptance',()=>{
 test('reservation and audit commit before POST; 202 only records mapping, never claims task',async()=>{
  const f=fixture(),r=await f.dispatcher.dispatch(f.principal,f.input)
  expect(r.state).toBe('admitted');expect(r.mapping?.hermesRunId).toBe('run_synthetic');expect(f.calls.map(c=>c.method)).toEqual(['POST'])
  const t=f.read('task.'+f.channelId+'.'+f.taskId);expect(t.status).toBe('assigned');expect(t.agentTask.state).toBe('assigned');expect(t.agentTask.lease).toBeUndefined()
  expect(await f.make().dispatch(f.principal,f.input)).toEqual(r);expect(f.calls).toHaveLength(1)
 })
 test('same event concurrent dispatches reserve once; restarted in_flight admission never posts again',async()=>{
  const f=fixture();let release!:()=>void;f.state.gate=new Promise<void>(r=>release=r)
  const first=f.dispatcher.dispatch(f.principal,f.input)
  for(let i=0;i<30&&!f.calls.length;i++)await new Promise<void>(r=>setImmediate(r))
  expect(f.calls).toHaveLength(1)
  const second=await f.make().dispatch(f.principal,f.input);expect(second.state).toBe('in_flight');expect(f.calls).toHaveLength(1)
  expect((await f.make().reconcile(f.principal,f.input)).state).toBe('in_flight');expect(f.calls).toHaveLength(1)
  release();expect((await first).state).toBe('admitted');expect(f.calls).toHaveLength(1)
 })
 for(const kind of ['unknown','throw','rejected'] as const)test(kind+' admission remains durable, emits an attention event and cannot POST again',async()=>{
  const f=fixture();f.state.admission=kind;const r=await f.dispatcher.dispatch(f.principal,f.input)
  expect(r.state).toBe(kind==='rejected'?'rejected':'admission_unknown')
  const task=f.read('task.'+f.channelId+'.'+f.taskId);expect(task.agentTask.error).toBe(kind==='rejected'?'AGENT_TRANSPORT_REJECTED':'AGENT_TRANSPORT_ADMISSION_UNKNOWN');expect(task.status).not.toBe('completed')
  const emitted=[...f.rows.values()].map(row=>JSON.parse(row.value)).filter(x=>x.type==='task.failed'||x.type==='task.blocked');expect(emitted).toHaveLength(1)
  await f.make().dispatch(f.principal,f.input);await f.make().reconcile(f.principal,f.input);expect(f.calls.map(c=>c.method)).toEqual(['POST'])
 })
 test('known runtime status uses only GET; completed cannot accept and interrupted cannot redispatch',async()=>{
  const f=fixture();await f.dispatcher.dispatch(f.principal,f.input)
  for(const status of ['running','completed','interrupted']){f.state.status=status;const r=await f.make().reconcile(f.principal,f.input);expect(r.lastStatus?.kind).toBe('status');expect((r.lastStatus as any).status).toBe(status);expect(f.read('task.'+f.channelId+'.'+f.taskId).agentTask.state).toBe('assigned')}
  await f.make().dispatch(f.principal,f.input);expect(f.calls.map(c=>c.method)).toEqual(['POST','GET','GET','GET'])
 })
 test('lost in-flight reservation after 120 seconds becomes visible unknown once without HTTP; a late known receipt cannot overwrite a newer business run',async()=>{
  const f=fixture(),outbox=f.read('agent.outbox.'+f.eventId),prepared=prepareDispatchEvent('synthetic-stock',outbox.event,{taskId:f.taskId,runId:f.task.agentTask.runId,eventId:f.eventId,round:1,taskVersion:1,executorId:f.task.agentTask.executorId,leaseVersion:0})
  f.put('agent.dispatch.'+f.eventId,{eventId:f.eventId,taskId:f.taskId,runId:f.task.agentTask.runId,preparedAt:new Date(f.state.now).toISOString(),updatedAt:new Date(f.state.now).toISOString(),prepared,state:'in_flight',target:f.target,requestedBy:{agentId:f.principal.agentId,grantVersion:1,clientRevision:1}})
  f.state.now+=120001
  expect((await f.make().reconcile(f.principal,f.input)).state).toBe('admission_unknown')
  expect(f.read('task.'+f.channelId+'.'+f.taskId).agentTask.error).toBe('AGENT_TRANSPORT_ADMISSION_UNKNOWN')
  await f.make().reconcile(f.principal,f.input);await f.make().dispatch(f.principal,f.input)
  expect(f.calls).toHaveLength(0)
  expect([...f.rows.values()].map(row=>JSON.parse(row.value)).filter(x=>x.type==='task.blocked')).toHaveLength(1)
  const g=fixture();let release!:()=>void;g.state.gate=new Promise<void>(r=>release=r)
  const pending=g.dispatcher.dispatch(g.principal,g.input)
  for(let i=0;i<30&&!g.calls.length;i++)await new Promise<void>(r=>setImmediate(r))
  expect(g.calls).toHaveLength(1);g.state.now+=120001
  await g.make().reconcile(g.principal,g.input)
  const next={...g.task,version:9,agentTask:{...g.task.agentTask,round:2,runId:randomUUID(),eventId:randomUUID()}}
  g.put('task.'+g.channelId+'.'+g.taskId,next);release()
  expect((await pending).state).toBe('admitted')
  expect(g.read('task.'+g.channelId+'.'+g.taskId)).toEqual(next)
  expect(g.calls.map(c=>c.method)).toEqual(['POST'])
 })
 test('origin, transport identity and credential generation rotation cannot replay or query an existing reservation',async()=>{
  const f=fixture();await f.dispatcher.dispatch(f.principal,f.input)
  for(const change of [{origin:'https://other-synthetic.invalid'},{identityId:'another-identity'},{credentialGeneration:2}]){
    const rotated=f.make({...f.target,...change})
    await expect(rotated.dispatch(f.principal,f.input)).rejects.toThrow('AGENT_DISPATCH_TARGET_CHANGED')
    await expect(rotated.reconcile(f.principal,f.input)).rejects.toThrow('AGENT_DISPATCH_TARGET_CHANGED')
  }
  expect(f.calls.map(c=>c.method)).toEqual(['POST'])
  f.state.token='synthetic-rotated-token'
  const status=await f.make().reconcile(f.principal,f.input)
  expect(status.lastStatus?.kind).toBe('status_unknown');expect((status.lastStatus as any).reason).toBe('auth_scope_changed')
  expect(f.calls.map(c=>c.method)).toEqual(['POST'])
 })
 test('permanent admission binding requires a committed reservation and binds a backend run once across concurrent candidates',async()=>{
  const f=fixture(),e=f.read('agent.outbox.'+f.eventId).event,dispatch=prepareDispatchEvent('synthetic-stock',e,{taskId:f.taskId,runId:f.task.agentTask.runId,eventId:f.eventId,round:1,taskVersion:1,executorId:f.task.agentTask.executorId,leaseVersion:0})
  const a={dispatch,origin:f.target.origin,authScopeHash:'a'.repeat(64)},b={...a,authScopeHash:'b'.repeat(64)}
  await expect(f.bindings.bindOnce(dispatch.references.backendRunId,a)).rejects.toThrow('AGENT_ADMISSION_RESERVATION_REQUIRED')
  expect(await f.bindings.load(dispatch.references.backendRunId)).toBeUndefined()
  f.put('agent.dispatch.'+f.eventId,{eventId:f.eventId,taskId:f.taskId,runId:dispatch.references.backendRunId,prepared:dispatch,state:'in_flight',target:f.target,requestedBy:{agentId:f.principal.agentId,grantVersion:1,clientRevision:1}})
  const results=await Promise.all([f.bindings.bindOnce(dispatch.references.backendRunId,a),f.bindings.bindOnce(dispatch.references.backendRunId,b)])
  expect(results[0]).toEqual(results[1]);expect(await persistentAdmissionBindings(f.db,f.storeId).load(dispatch.references.backendRunId)).toEqual(results[0])
  expect(f.audits.filter(a=>a.description==='agent_admission_bound')).toHaveLength(1);expect(f.calls).toHaveLength(0)
 })
 test('binding audit failure rolls back the binding and performs zero network calls',async()=>{
  const f=fixture(),e=f.read('agent.outbox.'+f.eventId).event,dispatch=prepareDispatchEvent('synthetic-stock',e,{taskId:f.taskId,runId:f.task.agentTask.runId,eventId:f.eventId,round:1,taskVersion:1,executorId:f.task.agentTask.executorId,leaseVersion:0})
  f.put('agent.dispatch.'+f.eventId,{eventId:f.eventId,taskId:f.taskId,runId:dispatch.references.backendRunId,prepared:dispatch,state:'in_flight',target:f.target,requestedBy:{agentId:f.principal.agentId,grantVersion:1,clientRevision:1}})
  f.state.auditFail=true
  await expect(f.bindings.bindOnce(dispatch.references.backendRunId,{dispatch,origin:f.target.origin,authScopeHash:'a'.repeat(64)})).rejects.toThrow('SYNTHETIC_AUDIT_FAILURE')
  expect(await f.bindings.load(dispatch.references.backendRunId)).toBeUndefined();expect(f.calls).toHaveLength(0)
 })
 test('reservation audit failure rolls back and performs zero transport calls',async()=>{
  const f=fixture();f.state.auditFail=true;await expect(f.dispatcher.dispatch(f.principal,f.input)).rejects.toThrow('SYNTHETIC_AUDIT_FAILURE');expect(f.calls).toHaveLength(0);expect(f.read('agent.dispatch.'+f.eventId)).toBeNull()
 })
 test('revoked binding, executor role and cross-store cannot dispatch or query a saved mapping',async()=>{
  const f=fixture();await expect(f.dispatcher.dispatch({...f.principal,role:'executor'},f.input)).rejects.toThrow();await expect(f.dispatcher.dispatch({...f.principal,storeId:'another-store'},f.input)).rejects.toThrow();expect(f.calls).toHaveLength(0)
  await f.dispatcher.dispatch(f.principal,f.input);f.state.revoked=true
  await expect(f.make().dispatch(f.principal,f.input)).rejects.toThrow();await expect(f.make().reconcile(f.principal,f.input)).rejects.toThrow();expect(f.calls.map(c=>c.method)).toEqual(['POST'])
 })
})
