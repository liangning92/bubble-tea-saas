import { createHash } from 'crypto'
import { z } from 'zod'
import { TeamChannel, TeamError, readTeam } from '../TeamCommunicationService'
import type { BridgeGrant, TaskRef } from './contract'
import { TEAM_AGENT_PREFIX } from './events'

const deny = (): never => { throw new TeamError(403, 'TEAM_AGENT_ACCESS_DENIED') }
const directSchema = z.object({ sourceStaffId:z.string().min(1).max(128),fromSeq:z.number().int().positive().max(999999999999),
  audienceHash:z.string().regex(/^[a-f0-9]{64}$/),grantVersion:z.number().int().positive(),clientRevision:z.number().int().positive(),expiresAt:z.string().datetime() }).strict()
export const directDelegationAudienceHash = (c:TeamChannel) => createHash('sha256').update(JSON.stringify(c.members.map(m=>({staffId:m.staffId,fromSeq:m.fromSeq})).sort((a,b)=>a.staffId.localeCompare(b.staffId)))).digest('hex')
export interface BridgeChannelAuthorization { channel:TeamChannel; fromSeq:number; delegatedDirect:boolean; sourceStaffId?:string }

/** Server-side binding only. No enrollment API or model/body delegation flag.
 * The caller must separately re-resolve the current grant/action and task ACL.
 * Runtime source projection must also enforce the returned fromSeq. */
export async function readAuthorizedBridgeChannel(db:any,g:BridgeGrant,task:TaskRef,channelId:string,currentChannel?:TeamChannel,nowMs=Date.now()):Promise<BridgeChannelAuthorization> {
  if(g.revoked||Date.parse(g.expiresAt)<=nowMs)deny()
  const row=await db.config.findUnique({where:{storeId_key:{storeId:g.storeId,key:TEAM_AGENT_PREFIX+'channel.'+channelId}}})
  let binding:any
  try{binding=row&&JSON.parse(row.value)}catch{deny()}
  if(binding?.agentId!==g.agentId||!task||binding.task?.taskId!==task.taskId)deny()
  const c=currentChannel||await readTeam<TeamChannel>(db,g.storeId,'channel.'+channelId)
  if(!c||c.id!==channelId||c.archived||!c.members.length||new Set(c.members.map(m=>m.staffId)).size!==c.members.length)deny()
  const agent='agent:'+g.agentId,member=c.members.find(m=>m.staffId===agent)
  if(c.members.some(m=>m.staffId!==agent&&!g.staffIds.includes(m.staffId)))deny()
  const humans=c.members.filter(m=>m.staffId!==agent).map(m=>m.staffId)
  const people=await db.staff.findMany({where:{storeId:g.storeId,id:{in:humans},status:'active'},select:{id:true,userId:true,user:{select:{id:true,storeId:true}}}})
  if(people.length!==humans.length)deny()
  if(member){
    if(binding.delegatedDirect)deny() // A direct delegation never becomes a membership shortcut.
    return {channel:c,fromSeq:Math.max(...c.members.map(m=>m.fromSeq)),delegatedDirect:false}
  }
  const parsed=directSchema.safeParse(binding.delegatedDirect)
  if(!parsed.success)deny()
  const d=parsed.data
  if(c.kind!=='direct'||c.members.length!==2||!g.channelIds.includes(c.id)||binding.task.version!==task.version||
    d.grantVersion!==g.version||d.clientRevision!==g.clientRevision||d.expiresAt!==g.expiresAt||Date.parse(d.expiresAt)<=nowMs||
    d.audienceHash!==directDelegationAudienceHash(c)||!humans.includes(d.sourceStaffId)||d.fromSeq<Math.max(...c.members.map(m=>m.fromSeq))||d.fromSeq>c.lastSeq+1)deny()
  if(people.some((s:any)=>!s.userId||s.user?.id!==s.userId||s.user?.storeId!==g.storeId))deny()
  const sponsor=await db.user.findFirst({where:{id:g.sponsorUserId,storeId:g.storeId,role:{in:['admin','manager']}},select:{id:true,staff:{select:{id:true,storeId:true,status:true}}}})
  if(!sponsor?.staff||sponsor.staff.status!=='active'||sponsor.staff.storeId!==g.storeId||sponsor.staff.id!==c.ownerId||!humans.includes(sponsor.staff.id)||sponsor.staff.id===d.sourceStaffId)deny()
  return {channel:c,fromSeq:d.fromSeq,delegatedDirect:true,sourceStaffId:d.sourceStaffId}
}
