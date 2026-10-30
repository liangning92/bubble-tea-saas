import { readTeam } from '../TeamCommunicationService'
/** Independent native message journal. Survives trace CAS failure/restart; only
 * the normal send transaction writes it, together with the actual message. */
export async function employeeNativeReply(db:any,storeId:string,state:any){
 const executionId=state.ticket?.executionId
 if(!executionId)return null
 const receipt=await readTeam<any>(db,storeId,'employeeRuntime.nativeReply.'+executionId)
 if(!receipt)return null
 const message=await readTeam<any>(db,storeId,`message.${receipt.channelId}.${String(receipt.seq).padStart(12,'0')}`)
 if(receipt.executionId!==executionId||receipt.channelId!==state.scope?.channelId||message?.id!==receipt.messageId||message?.agent?.executionId!==executionId||message.agent.agentId!==state.grant?.agentId||(message.authorId!==receipt.authorStaffId&&(message.authorId!=='agent:'+state.grant?.agentId||message.actorStaffId!==receipt.authorStaffId))||receipt.authorStaffId!==state.scope?.requesterStaffId)throw Error('EMPLOYEE_NATIVE_REPLY_CHANGED')
 return receipt
}
