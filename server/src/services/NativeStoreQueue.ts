import {backendQueryHints,backendNativeContracts} from './ManagementBackendRegistry'
import {storeBusinessTopic} from './StoreBusinessTopic'
import {createHash} from 'node:crypto'
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
export const nativeJobId=(storeId:string,channelId:string,messageId:string)=>hash([storeId,channelId,messageId])
export const nativeJobKey=(id:string)=>'nativeAgent.job.'+id
const bindingKey=(channelId:string)=>'team.communication.nativeAgent.channelBinding.'+channelId
const read=async(db:any,storeId:string,key:string)=>{const row=await db.config.findUnique({where:{storeId_key:{storeId,key}}});return row?JSON.parse(row.value):null}
/** Conversation enrollment only. No trial task, per-tool permission or expiry.
 * Existing direct delegations migrate with exactly their original members/floor. */
export async function nativeChannelAdmission(db:any,storeId:string,channel:any,agentId:string,migrate=false):Promise<{fromSeq:number}|null>{
 if(channel.archived)return null
 if(channel.members.some((m:any)=>m.staffId==='agent:'+agentId))return {fromSeq:Math.max(...channel.members.map((m:any)=>m.fromSeq))}
 const binding=await read(db,storeId,bindingKey(channel.id))
 if(binding){
  if(binding.agentId!==agentId||!binding.enabled)return null
  if(binding.audienceHash!==hash(channel.members)){
   if(!migrate)return null
   const next={...binding,audienceHash:hash(channel.members),fromSeq:Math.max(binding.fromSeq,...channel.members.map((m:any)=>m.fromSeq)),updatedAt:new Date().toISOString()}
   await db.config.update({where:{storeId_key:{storeId,key:bindingKey(channel.id)}},data:{value:JSON.stringify(next)}})
   return {fromSeq:next.fromSeq}
  }
  return {fromSeq:binding.fromSeq}
 }
 if(!migrate)return null
 const legacy=await read(db,storeId,'externalAgent.teamBridge.v1.channel.'+channel.id),direct=legacy?.delegatedDirect
 const normalized=channel.members.map((m:any)=>({staffId:m.staffId,fromSeq:m.fromSeq})).sort((a:any,b:any)=>a.staffId.localeCompare(b.staffId))
 const grant=await read(db,storeId,'externalAgent.teamBridge.v1.grant.'+agentId)
 if(legacy?.agentId!==agentId||!direct||grant?.revoked||channel.kind!=='direct'||channel.members.length!==2||direct.audienceHash!==hash(normalized)||!channel.members.some((m:any)=>m.staffId===direct.sourceStaffId)||!Number.isSafeInteger(direct.fromSeq)||direct.fromSeq<Math.max(...channel.members.map((m:any)=>m.fromSeq)))return null
 const value={agentId,channelId:channel.id,audienceHash:hash(channel.members),fromSeq:direct.fromSeq,enabled:true,origin:'existing_direct_conversation',createdAt:new Date().toISOString()}
 await db.config.upsert({where:{storeId_key:{storeId,key:bindingKey(channel.id)}},create:{storeId,key:bindingKey(channel.id),category:'native_agent',value:JSON.stringify(value)},update:{}})
 return {fromSeq:value.fromSeq}
}
/** Durable admission only, in the human message's existing transaction. */
export async function enqueueNativeStoreRequest(db:any,storeId:string,channel:any,message:any,agentId=process.env.EMPLOYEE_HERMES_AGENT_ID){
 if(process.env.EMPLOYEE_HERMES_ENABLED!=='1'||process.env.EMPLOYEE_HERMES_STORE_ID!==storeId||!agentId)return false
 const admission=await nativeChannelAdmission(db,storeId,channel,agentId,true)
 if(!admission)return false
 if(message.seq<admission.fromSeq)return true
 if(message.ai||message.agent||!channel.members.some((m:any)=>m.staffId===message.authorId))return true
 const id=nativeJobId(storeId,channel.id,message.id),key='team.communication.'+nativeJobKey(id)
 const legacyId=hash(['employee_work',channel.id,message.id])
 const legacy=await read(db,storeId,'externalAgent.teamBridge.v1.employeePending.'+legacyId)
 const uncertainLegacy=legacy&&!['pending','blocked'].includes(legacy.state)
 let topic=message.files?.length?undefined:storeBusinessTopic(message.text)
 const pending=!topic&&!message.files?.length&&/名称|名字|商品|价格|折扣|优惠|时间|草稿|发布|确认|name|product|price|discount|tanggal|nama|produk|harga|diskon/i.test(message.text)?await read(db,storeId,'team.communication.nativeAgent.activityQuestion.'+channel.id+'.'+message.authorId):null
 const activityContext=pending&&['needs_input','created'].includes(pending.state)&&pending.requesterStaffId===message.authorId&&pending.audienceHash===hash(channel.members)&&Date.now()-Date.parse(pending.createdAt)<1800000?pending:undefined
 // Prior activity context may clarify a follow-up; it never classifies a new
 // question or inserts a creation command into the current human request.
 const backendHints=topic&&topic!=='marketing_setup'&&topic!=='management_query'&&topic!=='revenue_scope'&&topic!=='stock_out_scope'?undefined:backendQueryHints(message.text)
 const backendContracts=!topic||topic==='marketing_setup'?backendNativeContracts():undefined
 const value={...(backendContracts?{backendContracts}:{}),...(activityContext?{activityContext}:{}),...(backendHints?{backendHints}:{}),budgetMs:/(?:深入|全面|详细|审计|多步|analisis mendalam|audit lengkap)/i.test(message.text)?600000:30000,...(topic?{businessTopic:topic,executor:'business_topic'}:{}),id,storeId,channelId:channel.id,sourceSeq:message.seq,messageId:message.id,requesterStaffId:message.authorId,sourceHash:hash({id:message.id,seq:message.seq,authorId:message.authorId,text:message.text,...(message.language?{language:message.language}:{}),files:message.files||[]}),audienceHash:hash(channel.members),state:uncertainLegacy?'blocked':'queued',...(uncertainLegacy?{fault:'NATIVE_LEGACY_RESULT_RECONCILIATION_REQUIRED'}:{}),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}
 await db.config.upsert({where:{storeId_key:{storeId,key}},create:{storeId,key,category:'native_agent',value:JSON.stringify(value)},update:{}})
 return true
}
