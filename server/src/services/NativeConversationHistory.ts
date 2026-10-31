import {createHash} from 'node:crypto'
import {nativeJobId} from './NativeStoreQueue'
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
/** A bounded view of authorized chat, not the SDK's accumulated API payloads.
 * Native persistence is untouched. History is reference material, never a grant. */
export function nativeConversationHistory(messages:any[],sourceSeq:number,fromSeq:number,storeId:string,channelId:string,agentId:string){
 const originals=new Map(messages.map(m=>[m.seq,m]))
 const history:Array<{role:'user'|'assistant';content:string}>=[]
 let bytes=0
 for(const message of [...messages].sort((a,b)=>b.seq-a.seq)){
  if(message.seq>=sourceSeq||message.seq<fromSeq||message.accessWithheld||message.outputQuality||typeof message.text!=='string'||!message.text.trim())continue
  // Personal-record ownership is not encoded in a plain chat excerpt. Re-read
  // these records under the current native personal/resource scope instead.
  if(message.agent?.dataPermissions?.some((permission:any)=>typeof permission==='string'&&permission.startsWith('personal.')))continue
  const original=originals.get(message.agent?.replyToSeq)
  if(original&&message.agent?.executionId===hash([nativeJobId(storeId,channelId,original.id),'status']))continue
  const text=Array.from(message.text as string).slice(0,1000).join(''),content=JSON.stringify({previousVisibleMessage:{seq:message.seq,text,excerpt:text.length<message.text.length},referenceOnly:true})
  const size=Buffer.byteLength(content);if(bytes+size>6000)continue
  history.unshift({role:message.authorId==='agent:'+agentId?'assistant':'user',content});bytes+=size
  if(history.length===6)break
 }
 // An explicit nonempty history uses the original SDK's supported override;
 // an empty list would cause it to reload the entire stored session instead.
 return history.length?history:[{role:'assistant' as const,content:'{"historyWindow":"empty","referenceOnly":true}'}]
}
