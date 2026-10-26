import { randomUUID } from 'crypto'
import { z } from 'zod'
import { TeamChannel, TeamTask, TeamError, readTeam, writeTeam, lockTeam } from '../TeamCommunicationService'
import { userAccessV2 } from '../StaffPermissionV2Service'
import { directDelegationAudienceHash } from './directDelegation'
import { employeeRouteKey, employeeGrantKey } from './employeeIntake'
import { grantSchema } from './contract'
const fail=(code:string):never=>{throw new TeamError(409,code)}
const input=z.object({storeId:z.string().min(1),channelId:z.string().uuid(),sourceStaffId:z.string().min(1),sponsorUserId:z.string().min(1),
  agentId:z.string().uuid(),expectedLastSeq:z.number().int().nonnegative(),expectedChannelVersion:z.number().int().positive(),expiresAt:z.string().datetime()}).strict()
/** Private deployment operation, never mounted as an enrollment endpoint/tool.
 * The operator must already be authorized to install this precise delegation.
 * Native owner/permissions are resolved here; no manufactured admin actor or
 * employee login is used to seed the service-owned coordination task. */
export async function installEmployeeCutover(db:any,raw:z.infer<typeof input>) {
  // The operator supplies authorization expiry. Runtime settings own renewals;
  // an obsolete trial date is not a product authorization rule.
  const v=input.parse(raw),now=Date.now()
  if(Date.parse(v.expiresAt)<=now)fail('EMPLOYEE_CUTOVER_DEADLINE_INVALID')
  return db.$transaction(async(tx:any)=>{
    await lockTeam(tx,v.storeId,'channel.'+v.channelId)
    if(Date.parse(v.expiresAt)<=Date.now())fail('EMPLOYEE_CUTOVER_DEADLINE_INVALID')
    if(await tx.config.findUnique({where:{storeId_key:{storeId:v.storeId,key:employeeRouteKey(v.channelId)}}}))fail('EMPLOYEE_CUTOVER_ALREADY_CONFIGURED')
    const c=await readTeam<TeamChannel>(tx,v.storeId,'channel.'+v.channelId)
    if(!c||c.archived||c.kind!=='direct'||c.members.length!==2||c.lastSeq!==v.expectedLastSeq||c.version!==v.expectedChannelVersion||!c.members.some(m=>m.staffId===v.sourceStaffId))fail('EMPLOYEE_CUTOVER_CHANNEL_CHANGED')
    const sponsor=await tx.user.findFirst({where:{id:v.sponsorUserId,storeId:v.storeId,role:{in:['admin','manager']}},include:{staff:true}})
    if(!sponsor?.staff||sponsor.staff.status!=='active'||sponsor.staff.storeId!==v.storeId||sponsor.staff.id!==c.ownerId||sponsor.staff.id===v.sourceStaffId||!c.members.some(m=>m.staffId===sponsor.staff.id))fail('EMPLOYEE_CUTOVER_OWNER_UNAVAILABLE')
    const acl=await userAccessV2({staffId:sponsor.staff.id,storeId:v.storeId,role:sponsor.role},tx)
    if(sponsor.role!=='admin'&&acl?.modes['team.manage']!=='allow')fail('EMPLOYEE_CUTOVER_OWNER_DENIED')
    const person=await tx.staff.findFirst({where:{id:v.sourceStaffId,storeId:v.storeId,status:'active'},select:{id:true,userId:true,user:{select:{id:true,storeId:true}}}})
    if(!person?.userId||person.user?.id!==person.userId||person.user?.storeId!==v.storeId)fail('EMPLOYEE_CUTOVER_STAFF_UNAVAILABLE')
    const inflight=await tx.config.findFirst({where:{storeId:v.storeId,key:{startsWith:'team.communication.workflow.job.'+c.id+'.'},value:{contains:'"status":"processing"'}}})
    if(inflight)fail('EMPLOYEE_CUTOVER_LEGACY_INFLIGHT')
    if(await tx.config.findUnique({where:{storeId_key:{storeId:v.storeId,key:employeeGrantKey(v.agentId)}}}))fail('EMPLOYEE_CUTOVER_AGENT_ALREADY_BOUND')
    const taskId=randomUUID(),time=new Date(now).toISOString(),fromSeq=c.lastSeq+1,task={taskId,version:1}
    const grant=grantSchema.parse({agentId:v.agentId,displayName:'Hermes AI',storeId:v.storeId,sponsorUserId:v.sponsorUserId,version:1,clientRevision:1,expiresAt:v.expiresAt,revoked:false,
      actions:['messages.read','messages.send','tasks.read','inventory.read'],staffIds:c.members.map(m=>m.staffId),channelIds:[c.id]})
    // The employee runtime withholds any task text that trips the confidential-text
    // tripwire, so this backend-authored text must stay clear of those words even when
    // it states a restriction. Naming a restricted class here would make the assigned
    // task unreadable to its own executor.
    const native:TeamTask={id:taskId,channelId:c.id,roundId:taskId,minuteVersion:1,actionIndex:0,text:'Hermes: answer new operational questions in this conversation using current backend authorization and actual evidence. Never invent completion.',ownerId:'agent:'+v.agentId,reviewerId:c.ownerId,dueDate:v.expiresAt.slice(0,10),deadlineAt:v.expiresAt,sourceSeq:[],fromSeq,status:'assigned',version:1,createdAt:time,updatedAt:time,audienceIds:c.members.map(m=>m.staffId),evidenceRequired:'Actual message/tool/provider receipts and explicit unresolved facts; no invented completion.',acceptanceCriteria:'Manager checks evidence. A report or acknowledgement is not acceptance.',events:[{action:'service_agent_delegate',by:'service:employee-cutover',at:time,note:'Dedicated AI executor; no human impersonation.',sourceSeq:[]}]}
    await writeTeam(tx,v.storeId,'task.'+c.id+'.'+taskId,native)
    await tx.config.create({data:{storeId:v.storeId,key:employeeGrantKey(v.agentId),category:'staff',value:JSON.stringify(grant)}})
    await tx.config.create({data:{storeId:v.storeId,key:'externalAgent.teamBridge.v1.channel.'+c.id,category:'staff',value:JSON.stringify({agentId:v.agentId,task,delegatedDirect:{sourceStaffId:v.sourceStaffId,fromSeq,audienceHash:directDelegationAudienceHash(c),grantVersion:1,clientRevision:1,expiresAt:v.expiresAt}})}})
    const route={version:1,agentId:v.agentId,task,sourceStaffId:v.sourceStaffId,fromSeq,enabled:true,paused:false,expiresAt:v.expiresAt}
    await tx.config.create({data:{storeId:v.storeId,key:employeeRouteKey(c.id),category:'staff',value:JSON.stringify(route)}})
    await tx.financeAuditLog.create({data:{storeId:v.storeId,userId:'service:employee-cutover',action:'create',entityType:'employee_agent_delegation',entityId:c.id,description:'Install authorized exclusive employee Hermes route',newValue:JSON.stringify({actorType:'service',sponsorUserId:v.sponsorUserId,agentId:v.agentId,taskId,fromSeq,expiresAt:v.expiresAt})}})
    return {channelId:c.id,agentId:v.agentId,task,fromSeq,expiresAt:v.expiresAt}
  })
}
