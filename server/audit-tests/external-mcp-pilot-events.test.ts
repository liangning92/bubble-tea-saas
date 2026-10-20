import { afterEach, describe, expect, jest, test } from '@jest/globals'
import { randomBytes, randomUUID } from 'crypto'
jest.mock('../src/services/TeamCommunicationService',()=>({TeamError:class extends Error{constructor(public status:number,code:string){super(code)}}}))
jest.mock('dns/promises',()=>({lookup:jest.fn()}))
jest.mock('https',()=>({request:jest.fn()}))
import { lookup } from 'dns/promises'
import { request } from 'https'
import { taskEvents } from '../src/services/externalMcp/eventsService'
import type { EventOwner, EventState } from '../src/services/externalMcp/eventsContract'
import { publicHttpsPost, WebhookPostOptions } from '../src/services/externalMcp/webhookDelivery'

const T0=Date.parse('2026-10-21T00:00:00Z'),END=T0+86400000,taskId=randomUUID()
const owner:EventOwner={storeId:'synthetic-store',agentId:'synthetic-dot',grantVersion:1,clientRevision:1,subjectKey:'synthetic-subject',tokenHash:'synthetic-token-hash',pilot:{id:randomUUID(),startedAt:new Date(T0).toISOString(),expiresAt:new Date(END).toISOString()}}
function fixture(){
 const state:EventState={subscriptions:[],deliveries:{}},network:any[]=[],audits:any[]=[]
 const clock={now:T0,status:200,transactions:0,authorizations:0,beforeTx:undefined as undefined|((n:number)=>void),beforeNetwork:undefined as undefined|(()=>Promise<void>|void),afterNetwork:undefined as undefined|(()=>void),authoritative:undefined as undefined|EventOwner['pilot'],authorizeWait:undefined as undefined|(()=>Promise<void>)}
 const service=taskEvents({now:()=>clock.now,repository:{transaction:async(_store,work)=>{clock.transactions++;clock.beforeTx?.(clock.transactions);return work(state)}},authorize:async(p,id)=>{clock.authorizations++;expect(id).toBe(taskId);if(clock.authorizeWait)await clock.authorizeWait();if(clock.authoritative&&JSON.stringify(p.pilot)!==JSON.stringify(clock.authoritative))throw Error('SYNTHETIC_PILOT_CHANGED')},audit:async a=>{audits.push(a)},post:async(_url,body,_headers,guard?:WebhookPostOptions)=>{
   if(clock.beforeNetwork)await clock.beforeNetwork();await guard?.preflight?.()
   if(guard?.deadlineAt!==undefined&&clock.now>=guard.deadlineAt)throw Error('SYNTHETIC_NETWORK_DEADLINE')
   const value=JSON.parse(body);network.push(value);clock.afterNetwork?.();return{status:clock.status,body:JSON.stringify({challenge:value.challenge})}
 }})
 const input={name:'task.report_ready',arguments:{taskId},ttlMs:86400000,delivery:{mode:'webhook',url:'https://synthetic-callback.example.com/events',secret:'whsec_'+randomBytes(32).toString('base64')}}
 const event={eventId:randomUUID(),name:'task.report_ready',timestamp:new Date(T0).toISOString(),data:{taskId,runId:randomUUID(),round:1,taskVersion:2},cursor:null}
 return{service,state,clock,input,event,network,audits}
}
afterEach(()=>{jest.restoreAllMocks();jest.useRealTimers();(lookup as jest.Mock).mockReset();(request as jest.Mock).mockReset()})

describe('Events use the same absolute 24-hour pilot deadline',()=>{
 test('renewing at T0+23h cannot move T0 or extend expiry past T0+24h',async()=>{
  const f=fixture(),first=await f.service.subscribe(owner,f.input);expect(Date.parse(first.refreshBefore)).toBe(END)
  f.clock.now=T0+23*3600000;const renewed=await f.service.subscribe(owner,f.input)
  expect(renewed.id).toBe(first.id);expect(Date.parse(renewed.refreshBefore)).toBe(END);expect(f.state.subscriptions).toHaveLength(1);expect(f.state.subscriptions[0].owner.pilot).toEqual(owner.pilot)
 })
 test('exact deadline rejects subscribe/list before authorization or DB; unsubscribe cleanup remains available',async()=>{
  const f=fixture();await f.service.subscribe(owner,f.input);const prior={db:f.clock.transactions,auth:f.clock.authorizations,network:f.network.length};f.clock.now=END
  await expect(f.service.subscribe(owner,f.input)).rejects.toThrow('AGENT_PILOT_UNAVAILABLE_OR_EXPIRED');await expect(f.service.list(owner,taskId)).rejects.toThrow('AGENT_PILOT_UNAVAILABLE_OR_EXPIRED')
  expect(f.clock.transactions).toBe(prior.db);expect(f.clock.authorizations).toBe(prior.auth);expect(f.network).toHaveLength(prior.network)
  const {secret:_,...delivery}=f.input.delivery;await f.service.unsubscribe(owner,{name:f.input.name,arguments:f.input.arguments,delivery});expect(f.state.subscriptions[0].active).toBe(false)
 })
 test('a challenge response arriving at expiry never activates its subscription',async()=>{
  const f=fixture();f.clock.now=END-1;f.clock.afterNetwork=()=>{f.clock.now=END}
  await expect(f.service.subscribe(owner,f.input)).rejects.toMatchObject({code:-32015})
  expect(f.network).toHaveLength(1);expect(f.state.subscriptions[0].active).toBe(false);expect(f.state.subscriptions[0].secret).toBe('')
 })
 test('expiry while waiting for activation transaction cannot commit active',async()=>{
  const f=fixture();f.clock.now=END-1;f.clock.beforeTx=n=>{if(n===2)f.clock.now=END}
  await expect(f.service.subscribe(owner,f.input)).rejects.toMatchObject({code:-32015});expect(f.state.subscriptions[0].active).toBe(false)
 })
 test('expiry while waiting before external callback is rechecked and makes zero new network requests',async()=>{
  const f=fixture();await f.service.subscribe(owner,f.input);f.clock.now=END-1;f.clock.beforeNetwork=()=>{f.clock.now=END}
  const result=await f.service.deliver(owner.storeId,f.event)
  expect(f.network).toHaveLength(1);expect(result[0].state).toBe('stopped');expect(Object.values(f.state.deliveries)[0].nextAt).toBeLessThanOrEqual(END)
 })
 test('retry and sending deadlines never extend the pilot; retained dedupe ledger cannot authorize expired sends',async()=>{
  const f=fixture();await f.service.subscribe(owner,f.input);f.clock.now=END-500;f.clock.status=503
  const result=await f.service.deliver(owner.storeId,f.event),row=Object.values(f.state.deliveries)[0]
  expect(result[0].state).toBe('retry');expect(result[0].retryAt).toBe(END);expect(row.deliveryUntil).toBe(END);expect(row.expiresAt).toBeGreaterThan(END)
  row.nextAt=END+60000;expect((await f.service.deliver(owner.storeId,f.event))[0].retryAt).toBe(END)
  f.clock.now=END;f.state.subscriptions[0].expiresAt=END+86400000
  expect(await f.service.deliver(owner.storeId,f.event)).toEqual([]);expect(f.network).toHaveLength(2)
 })
 test('a callback begun before expiry may save its accepted receipt after expiry without another send',async()=>{
  const f=fixture();await f.service.subscribe(owner,f.input);f.clock.now=END-1;f.clock.afterNetwork=()=>{f.clock.now=END}
  expect((await f.service.deliver(owner.storeId,f.event))[0].state).toBe('accepted');expect(await f.service.deliver(owner.storeId,f.event)).toEqual([]);expect(f.network).toHaveLength(2)
 })
 test('a new pilot owner cannot overwrite or unsubscribe the old pilot subscription and old authoritative bindings fail closed',async()=>{
  const f=fixture(),old=await f.service.subscribe(owner,f.input);f.clock.now=T0+3600000
  const next={...owner,pilot:{id:randomUUID(),startedAt:new Date(T0+3600000).toISOString(),expiresAt:new Date(END+3600000).toISOString()}}
  const fresh=await f.service.subscribe(next,f.input);expect(fresh.id).not.toBe(old.id);expect(f.state.subscriptions).toHaveLength(2)
  expect(f.state.subscriptions.find(s=>s.id===old.id)!.expiresAt).toBe(END)
  const {secret:_,...delivery}=f.input.delivery;await f.service.unsubscribe(owner,{name:f.input.name,arguments:f.input.arguments,delivery});expect(f.state.subscriptions.find(s=>s.id===fresh.id)!.active).toBe(true)
  f.clock.authoritative=owner.pilot;await f.service.deliver(owner.storeId,f.event)
  expect(f.state.subscriptions.find(s=>s.id===fresh.id)!.active).toBe(false);expect(f.network).toHaveLength(2)
 })
})

describe('physical HTTPS boundary uses the shorter absolute deadline',()=>{
 test('already expired transport deadline does not even start DNS',async()=>{
  await expect(publicHttpsPost('https://synthetic.example.com/events','{}',{}, {deadlineAt:Date.now()})).rejects.toThrow('MCP_CALLBACK_TIMEOUT')
  expect(lookup).not.toHaveBeenCalled();expect(request).not.toHaveBeenCalled()
 })
 test('DNS completing after the absolute deadline cannot start an HTTPS request',async()=>{
  let clock=1000,resolveDns!:(v:any)=>void;const end=2000;jest.spyOn(Date,'now').mockImplementation(()=>clock)
  ;(lookup as jest.Mock).mockImplementation(()=>new Promise(resolve=>{resolveDns=resolve}))
  const pending=publicHttpsPost('https://synthetic.example.com/events','{}',{}, {deadlineAt:end}).catch(e=>e)
  for(let n=0;n<10&&!resolveDns;n++)await Promise.resolve()
  expect(lookup).toHaveBeenCalledTimes(1);clock=end;resolveDns([{address:'8.8.8.8',family:4}])
  expect((await pending).message).toBe('MCP_CALLBACK_TIMEOUT');expect(request).not.toHaveBeenCalled()
 })
 test('asynchronous fresh authorization after DNS is rechecked before HTTPS',async()=>{
  let clock=1000,release!:()=>void,count=0;jest.spyOn(Date,'now').mockImplementation(()=>clock)
  ;(lookup as jest.Mock).mockImplementation(async()=>[{address:'8.8.8.8',family:4}])
  const pending=publicHttpsPost('https://synthetic.example.com/events','{}',{}, {deadlineAt:2000,preflight:async()=>{if(++count===2)await new Promise<void>(r=>release=r)}}).catch(e=>e)
  for(let n=0;n<20&&!release;n++)await Promise.resolve()
  expect(count).toBe(2);clock=2000;release();expect((await pending).message).toBe('MCP_CALLBACK_TIMEOUT');expect(request).not.toHaveBeenCalled()
 })
 test('absolute pilot remainder shortens the ten-second network timer',async()=>{
  jest.useFakeTimers();(lookup as jest.Mock).mockImplementation(()=>new Promise(()=>{}))
  const pending=publicHttpsPost('https://synthetic.example.com/events','{}',{}, {deadlineAt:Date.now()+2000}).catch(e=>e)
  await Promise.resolve();await Promise.resolve();jest.advanceTimersByTime(2000)
  expect((await pending).message).toBe('MCP_CALLBACK_TIMEOUT');expect(request).not.toHaveBeenCalled()
 })
})
