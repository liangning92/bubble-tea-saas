import { createHash, randomUUID } from 'crypto'
import { z } from 'zod'
import { TeamActor, TeamError, readTeam, writeTeam, lockTeam, auditTeam } from './TeamCommunicationService'
import { readAuthorizedBridgeChannel } from './teamAgentBridge/directDelegation'
import { audienceAllows } from './teamAgentBridge/employeeAccess'
import type { BridgeGrant, CommunicationScope } from './teamAgentBridge/contract'

const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const prefix=(agentId:string)=>`agentMemory.${agentId}.entry.`
const experiencePrefix=(agentId:string)=>`agentMemory.${agentId}.experience.`
const revisionKey=(agentId:string)=>`externalAgent.memory.v1.revision.${agentId}`
export interface AgentMemory {
 id:string;agentId:string;version:number;kind:'fact'|'preference'|'lesson';text:string;
 scope:'personal'|'channel'|'store';channelId:string;audienceStaffIds:string[];policyHash:string;
 status:'active'|'archived';confirmed:boolean;createdAt:string;updatedAt:string;archiveReason?:'operator'|'superseded';supersededBy?:string;
 source:{executionId?:string;messageIds:string[];toolCallIds:string[];actorId?:string}
}
const memoryInput=z.object({kind:z.enum(['fact','preference','lesson']),text:z.string().trim().min(1).max(2000),supersedesId:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict()
export const memoryMutation=z.object({expectedVersion:z.number().int().positive(),text:z.string().trim().min(1).max(2000).optional(),status:z.enum(['active','archived']).optional(),confirmed:z.boolean().optional(),scope:z.enum(['personal','channel','store']).optional()}).strict()

/** Stable across model processes and grant renewals, but not across audience/role-policy changes. */
async function privacyHash(db:any,g:BridgeGrant,scope:CommunicationScope) {
 const access=await readAuthorizedBridgeChannel(db,g,scope.task,scope.channelId!)
 const audience=access.channel.members.filter(m=>m.staffId!=='agent:'+g.agentId).map(m=>m.staffId).sort()
 if(JSON.stringify(audience)!==JSON.stringify([...scope.audienceStaffIds].sort()))throw new TeamError(403,'AGENT_MEMORY_SCOPE_DENIED')
 const people=await db.staff.findMany({where:{storeId:g.storeId,id:{in:scope.audienceStaffIds},status:'active'},select:{id:true,user:{select:{id:true,role:true,storeId:true}}},orderBy:{id:'asc'}})
 const policies=await db.config.findMany({where:{storeId:g.storeId,key:{in:['staff.access.policy','staff.access.policy.v2']}},select:{key:true,value:true},orderBy:{key:'asc'}})
 if(people.length!==scope.audienceStaffIds.length)throw new TeamError(403,'AGENT_MEMORY_SCOPE_DENIED')
 return hash([g.storeId,g.agentId,[...scope.audienceStaffIds].sort(),people,policies])
}
async function enabled(db:any,g:BridgeGrant,write=false) {
 const s=await readTeam<any>(db,g.storeId,'ai.agent.settings')
 return !g.revoked&&Date.parse(g.expiresAt)>Date.now()&&s?.enabled!==false&&(g.actions as string[]).includes(write?'memory.write':'memory.read')&&s?.memoryEnabled!==false&&(!write||s?.learningEnabled!==false)
}
export async function readAgentMemories(db:any,g:BridgeGrant,scope:CommunicationScope,query='',take=20):Promise<AgentMemory[]> {
 if(!await enabled(db,g))return []
 const fingerprint=await privacyHash(db,g,scope)
 const scopes:any[]=[{AND:[{value:{contains:'"scope":"store"'}},{value:{contains:'"confirmed":true'}}]},{AND:[{value:{contains:'"scope":"channel"'}},{value:{contains:'"channelId":'+JSON.stringify(scope.channelId)}}]}]
 if(scope.audienceStaffIds.length===1)scopes.push({AND:[{value:{contains:'"scope":"personal"'}},{value:{contains:'"audienceStaffIds":'+JSON.stringify(scope.audienceStaffIds)}}]})
 const rows=await db.config.findMany({where:{storeId:g.storeId,key:{startsWith:'team.communication.'+prefix(g.agentId)},OR:scopes,...(query?{value:{contains:query,mode:'insensitive'}}:{})},orderBy:{updatedAt:'desc'},take:500})
 return rows.map((r:any)=>JSON.parse(r.value) as AgentMemory).filter(m=>m.status==='active'&&m.agentId===g.agentId&&
  (m.scope==='store'&&m.confirmed||m.policyHash===fingerprint&&(m.scope==='personal'&&scope.audienceStaffIds.length===1&&m.audienceStaffIds[0]===scope.audienceStaffIds[0]||m.scope==='channel'&&m.channelId===scope.channelId))&&
  (!query||m.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()))).sort((a,b)=>(Number(b.confirmed)*20+(b.kind==='preference'?10:0))-(Number(a.confirmed)*20+(a.kind==='preference'?10:0))||b.updatedAt.localeCompare(a.updatedAt)).slice(0,take)
}
export async function storeAgentMemory(db:any,g:BridgeGrant,scope:CommunicationScope,execution:any,input:unknown) {
 if(!await enabled(db,g,true))return {ok:false,code:'AGENT_MEMORY_LEARNING_DISABLED'}
 const v=memoryInput.parse(input),textHash=hash({kind:v.kind,text:v.text}),scopeKey=scope.audienceStaffIds.length===1?'personal:'+scope.audienceStaffIds[0]:scope.channelId,key=prefix(g.agentId)+hash([scopeKey,scope.audienceStaffIds,textHash])
 for(const k of [...new Set([key,...(v.supersedesId?[prefix(g.agentId)+v.supersedesId]:[])])].sort())await lockTeam(db,g.storeId,k)
 const priorVisible=v.supersedesId?(await readAgentMemories(db,g,scope,'',500)).find(m=>m.id===v.supersedesId):undefined
 if(v.supersedesId&&(!priorVisible||priorVisible.scope==='store'))return {ok:false,code:'AGENT_MEMORY_CORRECTION_NOT_AUTHORIZED'}
 if(priorVisible?.confirmed&&!await audienceAllows(db,g,{...scope,audienceStaffIds:[scope.requesterStaffId!]},'team.manage'))return {ok:false,code:'AGENT_MEMORY_CONFIRMED_NOTE_REQUIRES_REVIEW'}
 const old=await readTeam<AgentMemory>(db,g.storeId,key)
 if(old?.status==='archived'&&old.archiveReason!=='superseded')return {ok:false,code:'AGENT_MEMORY_ARCHIVED_BY_OPERATOR'}
 if(old?.status==='active')return {ok:true,memoryId:old.id,version:old.version,duplicate:true}
 const now=new Date().toISOString(),id=key.slice(prefix(g.agentId).length)
 const memory:AgentMemory={id,agentId:g.agentId,version:(old?.version||0)+1,kind:v.kind,text:v.text,scope:scope.audienceStaffIds.length===1?'personal':'channel',channelId:scope.channelId!,audienceStaffIds:[...scope.audienceStaffIds].sort(),policyHash:await privacyHash(db,g,scope),status:'active',confirmed:false,createdAt:old?.createdAt||now,updatedAt:now,
  source:{executionId:execution.ticket.executionId,messageIds:execution.sources.filter((s:any)=>s.source.kind==='conversation').map((s:any)=>s.source.messageId),toolCallIds:execution.tools.filter((t:any)=>!t.name.includes('memory')).map((t:any)=>t.toolCallId)}}
 await writeMemory(db,g.storeId,memory)
 if(priorVisible&&priorVisible.id!==id){await writeMemory(db,g.storeId,{...priorVisible,status:'archived',archiveReason:'superseded',supersededBy:id,version:priorVisible.version+1,updatedAt:now});execution.sources=execution.sources.filter((x:any)=>x.source.kind!=='agent_memory'||x.source.id!==priorVisible.id)}
 return {ok:true,memoryId:id,version:memory.version,confirmed:false,note:'Persistent, source-linked memory. A learned note is guidance, not a current inventory observation or a new permission.'}
}
async function writeMemory(db:any,storeId:string,memory:AgentMemory){
 const key=prefix(memory.agentId)+memory.id
 await writeTeam(db,storeId,key,memory)
 await db.config.create({data:{storeId,key:'team.communication.agentMemory.'+memory.agentId+'.history.'+memory.id+'.'+String(memory.version).padStart(12,'0'),category:'ai',value:JSON.stringify(memory)}})
}
/** Learn from actual receipts, not a model's assertion of success. No raw business payload is copied into the store-wide experience index. */
export async function recordAgentExperience(db:any,g:BridgeGrant,scope:CommunicationScope,name:string,args:any,value:any) {
 if(value===undefined||value===null||!await enabled(db,g,true)||name.includes('memory')||name==='employee_remember_rule'||name==='employee_send_message'||name.startsWith('employee_read_'))return
 const action=typeof args?.action==='string'?args.action:'execute',outcome=value?.ok===false||value?.success===false?'blocked':'succeeded'
 const code=typeof value?.code==='string'&&/^[A-Z0-9_]{1,100}$/.test(value.code)?value.code:undefined
 const id=hash([name,action,outcome,code]),key=experiencePrefix(g.agentId)+id
 await lockTeam(db,g.storeId,key)
 const prior=await readTeam<any>(db,g.storeId,key),now=new Date().toISOString()
 await writeTeam(db,g.storeId,key,{id,tool:name,action,outcome,...(code?{code}:{}),count:(prior?.count||0)+1,firstAt:prior?.firstAt||now,lastAt:now})
}
export async function readAgentExperiences(db:any,g:BridgeGrant,scope:CommunicationScope) {
 if(!await enabled(db,g))return []
 const rows=await db.config.findMany({where:{storeId:g.storeId,key:{startsWith:'team.communication.'+experiencePrefix(g.agentId)}},orderBy:{updatedAt:'desc'},take:30})
 const allowed=[]
 for(const row of rows){const e=JSON.parse(row.value)
  const permission=/inventory|procurement/.test(e.tool)?'inventory.read':/hygiene/.test(e.tool)?'hygiene.read':/marketing/.test(e.tool)?'marketing.read':/finance/.test(e.tool)?'finance.read':/staff|operations|training/.test(e.tool)?'staff.read':'personal.messages'
  if(await audienceAllows(db,g,scope,permission))allowed.push(e)
 }
 return allowed
}
export const agentMemoryFingerprint=(m:AgentMemory)=>hash({id:m.id,version:m.version,text:m.text,scope:m.scope,status:m.status,confirmed:m.confirmed})

/** Operator-facing management. Publishing a note makes its exact text store-wide; it is never automatic. */
export function agentMemoryService(db:any) {
 const assertAdmin=(a:TeamActor)=>{if(a.role!=='admin'||a.employeeApp)throw new TeamError(403,'TEAM_AI_ADMIN_REQUIRED')}
 const agent=async(a:TeamActor)=>{
  assertAdmin(a);await db.staff.findFirstOrThrow({where:{id:a.staffId,userId:a.id,storeId:a.storeId,status:'active'},select:{id:true}})
  const rows=await db.config.findMany({where:{storeId:a.storeId,key:{startsWith:'externalAgent.teamBridge.v1.grant.'}}})
  const grants=rows.map((r:any)=>JSON.parse(r.value));const g=grants.find((g:any)=>g.agentId===process.env.EMPLOYEE_HERMES_AGENT_ID)||grants[0]
  if(!g)throw new TeamError(409,'AGENT_MEMORY_AGENT_NOT_CONFIGURED');return g as BridgeGrant
 }
 return {
  async list(a:TeamActor,query:unknown=''){const q=z.string().trim().max(80).parse(query),g=await agent(a);const [rows,experiences]=await Promise.all([
   db.config.findMany({where:{storeId:a.storeId,key:{startsWith:'team.communication.'+prefix(g.agentId)},...(q?{value:{contains:q,mode:'insensitive'}}:{})},orderBy:{updatedAt:'desc'},take:200}),
   db.config.findMany({where:{storeId:a.storeId,key:{startsWith:'team.communication.'+experiencePrefix(g.agentId)}},orderBy:{updatedAt:'desc'},take:30})])
   return {agentId:g.agentId,memories:rows.map((r:any)=>JSON.parse(r.value)),experiences:experiences.map((r:any)=>JSON.parse(r.value))}
  },
  async history(a:TeamActor,id:string){const g=await agent(a);if(!/^[a-f0-9]{64}$/.test(id))throw new TeamError(400,'AGENT_MEMORY_INVALID_ID');const rows=await db.config.findMany({where:{storeId:a.storeId,key:{startsWith:'team.communication.agentMemory.'+g.agentId+'.history.'+id+'.'}},orderBy:{key:'desc'},take:50});return rows.map((r:any)=>JSON.parse(r.value))},
  async update(a:TeamActor,id:string,input:unknown){const g=await agent(a),v=memoryMutation.parse(input)
   if(!/^[a-f0-9]{64}$/.test(id))throw new TeamError(400,'AGENT_MEMORY_INVALID_ID')
   return db.$transaction(async(tx:any)=>{const key=prefix(g.agentId)+id;await lockTeam(tx,a.storeId,key)
    const old=await readTeam<AgentMemory>(tx,a.storeId,key)
    if(!old||old.version!==v.expectedVersion)throw new TeamError(409,'AGENT_MEMORY_VERSION_CONFLICT')
    if(v.scope==='store'&&v.confirmed!==true&&!old.confirmed)throw new TeamError(400,'AGENT_MEMORY_PUBLIC_CONFIRMATION_REQUIRED')
    const {expectedVersion,...patch}=v,next={...old,...patch,version:old.version+1,updatedAt:new Date().toISOString(),source:{...old.source,actorId:a.id},...(v.status==='archived'?{archiveReason:'operator' as const}:{})}
    await writeMemory(tx,a.storeId,next)
    // An operator correction invalidates in-flight context before its next action.
    const rk=revisionKey(g.agentId);await lockTeam(tx,a.storeId,rk);const row=await tx.config.findUnique({where:{storeId_key:{storeId:a.storeId,key:rk}}}),revision=(row?JSON.parse(row.value).revision:0)+1
    await tx.config.upsert({where:{storeId_key:{storeId:a.storeId,key:rk}},create:{storeId:a.storeId,key:rk,category:'ai',value:JSON.stringify({revision})},update:{value:JSON.stringify({revision})}})
    await auditTeam(tx,a,id,'update',{action:'agent_memory_update',agentId:g.agentId,version:next.version,status:next.status,scope:next.scope,confirmed:next.confirmed})
    return next
   })
  }
 }
}
