import { createHash } from 'crypto'
import { z } from 'zod'
import { TeamChannel, TeamError, TeamTask, readTeam } from '../TeamCommunicationService'
import { grantSchema, taskRefSchema } from './contract'
import { readAuthorizedBridgeChannel } from './directDelegation'

const prefix = 'externalAgent.teamBridge.v1.'
const uuid = z.string().uuid()
export const employeeRouteKey = (channelId:string) => prefix+'employeeRoute.'+channelId
export const employeeGrantKey = (agentId:string) => prefix+'grant.'+agentId
export const employeeRouteSchema = z.object({version:z.number().int().positive(),agentId:uuid,task:taskRefSchema,
  sourceStaffId:z.string().min(1).max(128),fromSeq:z.number().int().positive(),enabled:z.boolean(),paused:z.boolean(),expiresAt:z.string().datetime()}).strict()
export type EmployeeRoute = z.infer<typeof employeeRouteSchema>
const eventId = (channelId:string,messageId:string) => createHash('sha256').update(JSON.stringify(['employee_work',channelId,messageId])).digest('hex')
export const employeeIntakeKey = (id:string) => prefix+'employeePending.'+id
const readRoute = (db:any,storeId:string,channelId:string) => db.config.findUnique({where:{storeId_key:{storeId,key:employeeRouteKey(channelId)}}})

/** Established cutover owns the whole channel until explicit reviewed rollback.
 * Even an expired/disabled/malformed route cannot silently restart the old AI.
 * Call before legacy claim/model and again in its native send transaction. */
export async function assertLegacyConsumer(db:any,storeId:string,channelId:string,_sourceSeq?:number):Promise<void> {
  if(await readRoute(db,storeId,channelId)) throw new TeamError(409,'TEAM_LEGACY_CONSUMER_REPLACED')
}

/** Under native send's channel lock and outer transaction. Only writes a durable
 * fact; no child/model/timer/network. Presence returns true and excludes legacy. */
export async function enqueueEmployeeIntake(db:any,storeId:string,c:TeamChannel,message:any,nowMs=Date.now()):Promise<boolean> {
  const row=await readRoute(db,storeId,c.id)
  if(!row)return false
  if(message.ai||message.agent)return true
  let route:EmployeeRoute|undefined,reason:string|undefined
  try{route=employeeRouteSchema.parse(JSON.parse(row.value))}catch{reason='EMPLOYEE_ROUTE_INVALID'}
  // The cutover floor protects prior messages from replay, not just model reads.
  if(route&&message.seq<route.fromSeq)return true
  const isDirectSender = route && message.authorId === route.sourceStaffId
  const isChannelMember = c.members.some(m => m.staffId === message.authorId)
  if(!isDirectSender && !isChannelMember)return true
  try{
    if(!route)throw Error('EMPLOYEE_ROUTE_INVALID')
    if(!route.enabled||route.paused)throw Error('EMPLOYEE_ROUTE_PAUSED')
    const policy=await readTeam<any>(db,storeId,'workflow.policy.'+c.id)
    if(policy?.paused||policy?.enabled===false)throw Error('EMPLOYEE_ROUTE_PAUSED')
    if(Date.parse(route.expiresAt)<=nowMs)throw Error('EMPLOYEE_ROUTE_EXPIRED')
    const grantRow=await db.config.findUnique({where:{storeId_key:{storeId,key:employeeGrantKey(route.agentId)}}})
    const grant=grantSchema.parse(grantRow&&JSON.parse(grantRow.value))
    if(grant.storeId!==storeId||grant.agentId!==route.agentId||!grant.actions.includes('messages.read')||!grant.actions.includes('messages.send')||
      Date.parse(route.expiresAt)>Date.parse(grant.expiresAt)||grant.revoked)throw Error('EMPLOYEE_ROUTE_GRANT_UNAVAILABLE')
    const access=await readAuthorizedBridgeChannel(db,grant,route.task,c.id,c,nowMs)
    if(route.fromSeq!==access.fromSeq||access.delegatedDirect&&access.sourceStaffId!==route.sourceStaffId)throw Error('EMPLOYEE_ROUTE_BINDING_CHANGED')
    const task=await readTeam<TeamTask>(db,storeId,`task.${c.id}.${route.task.taskId}`)
    if(!task||task.channelId!==c.id||task.version!==route.task.version||!['assigned','accepted','submitted','changes_requested'].includes(task.status)||task.agentTask?.state==='accepted')throw Error('EMPLOYEE_ROUTE_TASK_UNAVAILABLE')
    if(typeof message.text!=='string'||(!message.text.trim()&&!message.files?.length))throw Error('EMPLOYEE_ROUTE_TEXT_REQUIRED')
  }catch(error:any){
    // Stable non-sensitive categories only. No grant, source text, stack or secret.
    reason=reason||(/^(EMPLOYEE_ROUTE_[A-Z_]+)$/.test(error?.message||'')?error.message:'EMPLOYEE_ROUTE_AUTHORIZATION_FAILED')
  }
  const id=eventId(c.id,message.id),key=employeeIntakeKey(id)
  const value={eventId:id,channelId:c.id,messageId:message.id,sourceSeq:message.seq,sourceStaffId:message.authorId,
    ...(route?{agentId:route.agentId,task:route.task,routeVersion:route.version}:{}),
    state:reason?'blocked':'pending',...(reason?{reason}:{}),createdAt:message.createdAt,updatedAt:new Date(nowMs).toISOString()}
  await db.config.upsert({where:{storeId_key:{storeId,key}},create:{storeId,key,category:'staff',value:JSON.stringify(value)},update:{}})
  return true
}
