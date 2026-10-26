import { z } from 'zod'
import { createHash } from 'crypto'
import { userAccessV2 } from '../StaffPermissionV2Service'
import { employeeAppAccess } from '../EmployeeAppAccess'
import { TeamActor, TeamChannel, TeamError, readTeam } from '../TeamCommunicationService'
import type { BridgeDependencies, BridgeGrant, TaskRef, CommunicationScope, OutputRequest } from './contract'
export const contextKey = (g: BridgeGrant, task: TaskRef, channelId?: string, audience?:string) => createHash('sha256').update(JSON.stringify([g.storeId,g.agentId,task.taskId,task.version,channelId || 'new',audience || 'new',g.version,g.clientRevision])).digest('hex')
const reject = (): never => { throw new TeamError(403, 'TEAM_COMMUNICATION_DATA_POLICY_DENIED') }
export async function readCommunicationScope(db: any, g: BridgeGrant, task: TaskRef, channel?: TeamChannel, requesterStaffId?: string): Promise<CommunicationScope> {
  const audienceStaffIds = channel ? channel.members.filter(m => m.staffId !== 'agent:' + g.agentId).map(m => m.staffId).sort() : []
  const people = await db.staff.findMany({ where: { storeId:g.storeId,id:{in:audienceStaffIds},status:'active' }, select:{id:true,user:{select:{id:true,storeId:true,role:true}}} })
  if (people.length !== audienceStaffIds.length || people.some((s:any) => !s.user || s.user.storeId !== g.storeId || employeeAppAccess(s.user.role).modes['personal.messages'] !== 'allow')) reject()
  if (requesterStaffId && !people.some((s:any) => s.id === requesterStaffId)) reject()
  const policies=await db.config.findMany({where:{storeId:g.storeId,key:{in:['staff.access.policy.v2','staff.access.policy']}},select:{key:true,value:true},orderBy:{key:'asc'}})
  const accessHash=createHash('sha256').update(JSON.stringify([people.sort((a:any,b:any)=>a.id.localeCompare(b.id)),policies])).digest('hex')
  const membersHash=channel?audienceHash(channel):''
  const scope: CommunicationScope = { compartmentKey: contextKey(g,task,channel?.id,membersHash+accessHash), task, channelId: channel?.id, audienceStaffIds, audienceHash:membersHash, requesterStaffId }
  return scope
}
export async function communicationScope(db: any, deps: BridgeDependencies, g: BridgeGrant, task: TaskRef, channel?: TeamChannel, requesterStaffId?: string): Promise<CommunicationScope> {
  if (!deps.communication) reject()
  const scope = await readCommunicationScope(db,g,task,channel,requesterStaffId)
  const proof = await deps.communication.assertContext(db,g,scope)
  if (proof.purpose !== 'employee_work' || proof.compartmentKey !== scope.compartmentKey || proof.memoryNamespace !== scope.compartmentKey || typeof proof.executionId!=='string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(proof.executionId)) reject()
  scope.executionId=proof.executionId
  return scope
}
// Data rights are checked on each real recipient/requester, never on the sponsoring admin.
export async function assertDataAudience(db:any,g:BridgeGrant,scope:CommunicationScope,dataClass:string) {
  if (dataClass==='unknown') throw new TeamError(409,'TEAM_AGENT_OUTPUT_NEEDS_REVIEW')
  if (!['operational','revenue','profit','cost','salary','private_staff'].includes(dataClass)) reject()
  const required:Record<string,string[]>={operational:['personal.messages'],revenue:['finance.read'],profit:['finance.read','profit.read'],cost:['cost.read'],salary:['salary.read'],private_staff:['staff.private.read']}
  if (scope.requesterStaffId && !scope.audienceStaffIds.includes(scope.requesterStaffId)) reject()
  const people=await db.staff.findMany({where:{storeId:g.storeId,id:{in:scope.audienceStaffIds},status:'active'},select:{id:true,user:{select:{id:true,role:true,storeId:true}}}})
  if (!people.length || people.length!==scope.audienceStaffIds.length) reject()
  for (const person of people) {
    if (!person.user || person.user.storeId!==g.storeId) reject()
    const actor={role:person.user.role,storeId:g.storeId,staffId:person.id}
    const access=dataClass==='operational'?employeeAppAccess(actor.role):await userAccessV2(actor,db)
    if (required[dataClass].some(key=>dataClass==='operational'?access?.modes[key]!=='allow':actor.role!=='admin'&&access?.modes[key]!=='allow')) reject()
  }
  // This release intentionally opens no protected-data publication, even to an all-admin audience.
  if (dataClass!=='operational') reject()
}
export const textHash = (text:string) => createHash('sha256').update(text).digest('hex')
export const audienceHash = (channel:TeamChannel) => createHash('sha256').update(JSON.stringify(channel.members.map(m=>({staffId:m.staffId,fromSeq:m.fromSeq})).sort((a,b)=>a.staffId.localeCompare(b.staffId)))).digest('hex')
const sourceSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('conversation'),channelId:z.string().uuid(),messageId:z.string().uuid(),seq:z.number().int().positive()}).strict(),
 z.object({kind:z.literal('employee_task'),taskId:z.string().uuid(),version:z.number().int().positive()}).strict(),
 z.object({kind:z.literal('public_sop'),id:z.string().min(1),version:z.number().int().positive()}).strict(),
 z.object({kind:z.literal('memory'),compartmentKey:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 z.object({kind:z.literal('employee_exchange'),executionId:z.string().uuid(),questionMessageId:z.string().uuid()}).strict(),
 z.object({kind:z.literal('inventory_evidence'),query:z.string().trim().min(1).max(80),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 z.object({kind:z.literal('schedule_evidence'),query:z.string().trim().min(1).max(80),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 z.object({kind:z.literal('marketing_evidence'),action:z.string().trim().min(1).max(80),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 z.object({kind:z.literal('procurement_evidence'),action:z.string().trim().min(1).max(80),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 z.object({kind:z.literal('finance_evidence'),action:z.string().trim().min(1).max(80),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 z.object({kind:z.literal('operations_evidence'),action:z.string().trim().min(1).max(80),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 z.object({kind:z.literal('employee_request_evidence'),action:z.string().trim().min(1).max(80),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 z.object({kind:z.literal('product_evidence'),action:z.string().trim().min(1).max(80),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 z.object({kind:z.literal('training_evidence'),action:z.string().trim().min(1).max(80),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict()
])
const dataClassSchema=z.enum(['operational','revenue','profit','cost','salary','private_staff','unknown'])
const admissionSchema=z.object({decision:z.enum(['allow','deny','unknown']),executionId:z.string().min(1).max(128),compartmentKey:z.string(),audienceHash:z.string(),textHash:z.string(),requestId:z.string().uuid(),dataClasses:z.array(dataClassSchema).max(10),sources:z.array(sourceSchema).max(100)}).strict()
export interface OutputPlan {purpose:'message'|'title';requestId:string;expectedTextHash:string;replyToSeq?:number}
export async function checkOutput(db:any,deps:BridgeDependencies,g:BridgeGrant,task:TaskRef,channel:TeamChannel,plan:OutputPlan|undefined,input:{text:string;files:string[]}) {
 if(!plan || input.files.length || typeof input.text!=='string' || textHash(input.text)!==plan.expectedTextHash || !deps.communication) reject()
 let requesterStaffId:string|undefined
 if(plan.replyToSeq!==undefined){
  const source=await readTeam(db,g.storeId,`message.${channel.id}.${String(plan.replyToSeq).padStart(12,'0')}`)
  const member=source&&channel.members.find(m=>m.staffId===source.authorId)
  const person=source&&await db.staff.findFirst({where:{id:source.authorId,storeId:g.storeId,status:'active'},select:{id:true,userId:true}})
  if(!source||!member||!person?.userId||source.seq<member.fromSeq||channel.members.some(m=>m.fromSeq>source.seq)) reject()
  requesterStaffId=person.id
 }
 const target=plan.purpose==='title'?{...channel,id:undefined}:channel
 const scope=await communicationScope(db,deps,g,task,target,requesterStaffId)
 await assertDataAudience(db,g,scope,'operational')
 const request:OutputRequest={purpose:plan.purpose,requestId:plan.requestId,textHash:textHash(input.text)}
 const proof=admissionSchema.parse(await deps.communication.admitOutput(db,g,scope,request))
 if(proof.executionId!==scope.executionId||proof.compartmentKey!==scope.compartmentKey||proof.audienceHash!==audienceHash(channel)||proof.textHash!==request.textHash||proof.requestId!==request.requestId) reject()
 if(proof.decision==='unknown') throw new TeamError(409,'TEAM_AGENT_OUTPUT_NEEDS_REVIEW')
 if(proof.decision!=='allow') reject()
 for(const classification of proof.dataClasses) await assertDataAudience(db,g,scope,classification)
 for(const source of proof.sources){
  if(source.kind==='conversation'){
   if(source.channelId!==channel.id||plan.purpose==='title') reject()
   const message=await readTeam(db,g.storeId,`message.${channel.id}.${String(source.seq).padStart(12,'0')}`)
   if(!message||message.id!==source.messageId||channel.members.some(m=>m.fromSeq>source.seq)) reject()
  }else if(source.kind==='employee_task'){
   if(source.taskId!==task.taskId||source.version!==task.version) reject()
  }else if(source.kind==='memory'&&source.compartmentKey!==scope.compartmentKey) reject()
  // Every source is checked by its real backend ACL for the entire current audience.
  const sourcePolicy=z.object({dataClasses:z.array(dataClassSchema).min(1).max(10)}).strict().parse(await deps.communication.authorizeSource(db,g,scope,source as any))
  for(const classification of sourcePolicy.dataClasses) await assertDataAudience(db,g,scope,classification)
 }
}
