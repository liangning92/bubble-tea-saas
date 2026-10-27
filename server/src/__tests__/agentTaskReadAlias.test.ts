import { describe, expect, it, jest } from '@jest/globals'
jest.mock('../config/database', () => ({ __esModule: true, default: {} }))
import { createAgentTaskService } from '../services/agentTasks/service'
import { claimTaskSchema, reviewTaskSchema } from '../services/agentTasks/contract'
import type { AgentPrincipal } from '../services/agentTasks/contract'

const storeId='store-a',taskId='10000000-0000-4000-8000-000000000001',channelId='20000000-0000-4000-8000-000000000001'
const now=Date.parse('2026-10-27T05:00:00.000Z')
const stamp={id:'30000000-0000-4000-8000-000000000001',startedAt:'2026-10-27T00:00:00.000Z',expiresAt:'2026-10-28T00:00:00.000Z'}
const manager:AgentPrincipal={agentId:'manager-a',storeId,role:'manager',grantVersion:1,clientRevision:1,scopes:['management.read'],pilot:stamp}
function fixture() {
 const rows=new Map<string,any>([
  ['agent.task.code.STOCK-RO-001',{taskId,channelId}],
  [`agent.task.index.${taskId}`,{channelId}],
  [`channel.${channelId}`,{id:channelId,archived:false}],
  [`task.${channelId}.${taskId}`,{id:taskId,channelId,version:1,agentTask:{taskCode:'STOCK-RO-001',capability:'stock_readonly_v1',managerId:manager.agentId,executorId:'executor-a',pilot:stamp,state:'assigned',runId:'run-a',round:1,leaseVersion:0,plan:{objective:'Check stock'},eventId:'event-a'}}]
 ])
 const reads:any[]=[],writes:any[]=[]
 const db:any={config:{findUnique:async({where}:any)=>{const key=where.storeId_key;reads.push(key);const value=key.storeId===storeId?rows.get(key.key.replace(/^team\.communication\./,'')):undefined;return value===undefined?null:{value:JSON.stringify(value)}},upsert:async(input:any)=>{writes.push(input);return{}}},$transaction:async(fn:any)=>fn(db)}
 const deps={now:()=>now,authorize:jest.fn(async(_db:any,p:AgentPrincipal,scope:string,channel:string)=>{if(p.storeId!==storeId||scope!=='management.read'||channel!==channelId)throw Error('AUTH_DENIED');return p}),executorFor:async()=>{throw Error('UNEXPECTED_DISPATCH')}}
 return {rows,reads,writes,deps,service:createAgentTaskService(db,deps)}
}
describe('fixed manager-only read alias',()=>{
 it('resolves the current-store fixed task pointer through existing live authorization',async()=>{
  const {service,deps,reads,writes}=fixture();const result=await service.get(manager,{taskId:'STOCK-RO-001',authVersion:1})
  expect(result.taskId).toBe(taskId);expect(result.taskCode).toBe('STOCK-RO-001')
  expect(deps.authorize).toHaveBeenCalledWith(expect.anything(),manager,'management.read',channelId)
  expect(reads.every(r=>r.storeId===storeId)).toBe(true)
  expect(writes.every(w=>w.where.storeId_key.key.startsWith('team.communication.lock.'))).toBe(true)
 })
 it('rejects missing and malformed pointers rather than scanning for a task',async()=>{
  for(const pointer of [undefined,{taskId:'STOCK-RO-001',channelId},{taskId,channelId:'arbitrary'}]){
   const {rows,service,reads}=fixture();if(pointer)rows.set('agent.task.code.STOCK-RO-001',pointer);else rows.delete('agent.task.code.STOCK-RO-001')
   await expect(service.get(manager,{taskId:'STOCK-RO-001',authVersion:1})).rejects.toThrow('AGENT_TASK_NOT_FOUND')
   expect(reads).toHaveLength(1)
  }
 })
 it('rejects foreign channel and cross-store principals using the existing backend grant check',async()=>{
  const f=fixture();f.rows.set('agent.task.code.STOCK-RO-001',{taskId,channelId:'40000000-0000-4000-8000-000000000001'})
  await expect(f.service.get(manager,{taskId:'STOCK-RO-001',authVersion:1})).rejects.toThrow('AUTH_DENIED')
  const g=fixture();await expect(g.service.get({...manager,storeId:'store-b'},{taskId:'STOCK-RO-001',authVersion:1})).rejects.toThrow('AGENT_TASK_NOT_FOUND')
  expect(g.reads.every(r=>r.storeId==='store-b')).toBe(true)
 })
 it('does not allow executor aliases or mutate claim/review UUID contracts',async()=>{
  const {service,reads}=fixture();await expect(service.get({...manager,role:'executor'},{taskId:'STOCK-RO-001',authVersion:1})).rejects.toThrow('AGENT_TASK_MANAGER_REQUIRED');expect(reads).toHaveLength(0)
  const mutation={requestId:'50000000-0000-4000-8000-000000000001',taskId:'STOCK-RO-001',runId:'60000000-0000-4000-8000-000000000001',round:1,expectedVersion:1,authVersion:1}
  const claim=claimTaskSchema.safeParse(mutation);expect(claim.success).toBe(false)
  if(!claim.success)expect(claim.error.issues.map(i=>i.path.join('.'))).toEqual(['taskId'])
  const review=reviewTaskSchema.safeParse({...mutation,reportId:'70000000-0000-4000-8000-000000000001',reportVersion:1,decision:'accept',check:{summary:'checked',checkedEvidenceIds:[],criteria:[{id:'one',result:'met',note:'checked'}]}})
  expect(review.success).toBe(false);if(!review.success)expect(review.error.issues.map(i=>i.path.join('.'))).toContain('taskId')
 })
 it('does not bypass revoked grants, task-manager binding or the immutable pilot expiry',async()=>{
  const revoked=fixture();revoked.deps.authorize.mockRejectedValueOnce(Error('AUTH_REVOKED'))
  await expect(revoked.service.get(manager,{taskId:'STOCK-RO-001',authVersion:1})).rejects.toThrow('AUTH_REVOKED')
  const other=fixture();const task=other.rows.get(`task.${channelId}.${taskId}`);task.agentTask.managerId='another-manager'
  await expect(other.service.get(manager,{taskId:'STOCK-RO-001',authVersion:1})).rejects.toThrow('AGENT_TASK_PRINCIPAL_REQUIRED')
  const expired=fixture();await expect(expired.service.get({...manager,pilot:{...stamp,startedAt:'2020-01-01T00:00:00.000Z',expiresAt:'2020-01-02T00:00:00.000Z'}},{taskId:'STOCK-RO-001',authVersion:1})).rejects.toThrow('AGENT_PILOT_UNAVAILABLE_OR_EXPIRED')
 })
})
