import { POS_OFFLINE_TTL_MS, POS_OFFLINE_DAYS } from '../../../shared/utils/offlinePolicy'
import { db } from '../db/offline'
import { localIdentity } from './offlineSale'
import { readBackendAuth } from './backendIdentity'
import { serverUnavailable } from './serverUnavailable'
import { offlineOperations, localClosedShifts } from './offlineOperations'

/** Exact-query, actor/store/backend scoped read cache. Authorization errors never fall back. */
export async function offlineRead(path:string,params:any,request:()=>Promise<any>):Promise<any>{
 const allowed=['/announcement/active','/announcement/hygiene/pending','/orders','/pos-cash/events','/pos-cash/shifts','/pos-cash/today','/pos-cash/summary','/expenses/pos']
 if(!allowed.includes(path))throw Error('OFFLINE_READ_NOT_ALLOWED')
 const auth=readBackendAuth(),storeId=auth.user?.storeId
 if(!storeId||!auth.user?.id)throw Error('CHECKOUT_BACKEND_LOGIN_REQUIRED')
 if(params?.storeId&&params.storeId!==storeId)throw Error('CHECKOUT_BACKEND_LOGIN_REQUIRED')
 const backend=localIdentity(storeId)
 const key='offline.read:'+encodeURIComponent(backend)+':'+encodeURIComponent(storeId)+':'+encodeURIComponent(auth.user.id)+':'+path+':'+JSON.stringify(Object.entries(params||{}).sort())
 let response:any,local=false
 try{
  if(!navigator.onLine||!auth.token)throw Error('OFFLINE')
  response=await request()
  if(localIdentity(storeId)!==backend||readBackendAuth().user?.id!==auth.user.id)throw Error('CHECKOUT_AUTH_CHANGED')
  await db.config.put({key,value:response.data,updatedAt:new Date()})
 }catch(error){
  if(!serverUnavailable(error)||readBackendAuth().user?.id!==auth.user.id||localIdentity(storeId)!==backend)throw error
  const cached=await db.config.get(key)
  if(cached&&Date.now()-new Date(cached.updatedAt).getTime()<POS_OFFLINE_TTL_MS)response={data:structuredClone(cached.value)}
  else response={data:{code:200,data:path.startsWith('/announcement/')?[]:{list:[],total:0},offline:true,historyIncomplete:true}}
  local=true
 }
 response.data.offline=local
 if(path==='/orders'){
  const rows=await db.orders.where('[backendUrl+storeId]').equals([backend,storeId]).filter(o=>!!o.locallyAcceptedAt&&!['rejected','discarded'].includes(o.checkoutResolution||'')&&(auth.user?.role!=='cashier'||o.staffId===auth.user.staff?.id)).toArray()
  const dateOf=(value:any)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))
  const matching=rows.filter(o=>(!params?.date||dateOf(o.occurredAt||o.createdAt)===params.date)&&(!params?.shiftSessionId||o.shiftSessionId===params.shiftSessionId)&&(!params?.paymentMethod||o.paymentMethod===params.paymentMethod)&&(!params?.channelId||o.channelId===params.channelId)&&(!params?.status||params.status==='completed')&&(!params?.search||o.orderNumber.includes(params.search))&&(!params?.startDate||new Date(o.occurredAt||o.createdAt)>=new Date(params.startDate))&&(!params?.endDate||new Date(o.occurredAt||o.createdAt)<=new Date(params.endDate)))
  const list=response.data.data.list||[]
  const included=new Set(list.map((o:any)=>o.orderNumber))
  const extra=matching.filter(o=>!included.has(o.orderNumber)&&(local||o.status!=='synced')).map(o=>({...o,id:o.serverId||o.localId,status:'completed',offline:o.status!=='synced',createdAt:o.occurredAt||o.createdAt,finalAmount:o.finalAmount,items:o.items.map((item:any,index:number)=>({...item,id:item.offlineItemId||`${o.localId}:${index}`}))}))
  const decisions=(await offlineOperations(storeId)).filter(o=>o.kind==='refund-settle'&&o.data.decision==='approve')
  for(const order of [...extra,...list]){const approved=decisions.filter(d=>d.data.localEvidence.orderNumber===order.orderNumber);if(approved.some(d=>d.data.localEvidence.allItems))order.status='refunded'}
  response.data.data={...response.data.data,list:[...extra,...list].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()),total:(response.data.data.total||list.length)+extra.length}
 }
 if(path==='/pos-cash/events'){
  const ops=await offlineOperations(storeId),list=response.data.data.list||[]
  const extras=ops.filter(o=>(local||o.status!=='synced')&&!list.some((e:any)=>e.id===o.id)&&(['open','close','cash'].includes(o.kind)||o.kind==='refund-settle'&&o.data.decision==='approve'&&o.data.payoutMethod==='cash')).map(o=>({id:o.id,type:o.kind==='open'?'float':o.kind==='close'?'close_shift':o.kind==='refund-settle'?'cash_out':o.data.type,amount:o.data.amount??o.data.openFloat??o.data.actualCash,note:o.data.note,createdAt:o.occurredAt,offline:o.status!=='synced'}))
  response.data.data.list=[...extras,...list].filter((o:any)=>(!params?.type||params.type===o.type)&&(!params?.startDate||new Date(o.createdAt)>=new Date(params.startDate))&&(!params?.endDate||new Date(o.createdAt)<=new Date(params.endDate))).sort((a:any,b:any)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))
 }
 if(path==='/expenses/pos'){
  const list=Array.isArray(response.data.data)?response.data.data:Array.isArray(response.data.data?.list)?response.data.data.list:[]
  const extra=(await offlineOperations(storeId)).filter(o=>o.kind==='expense'&&o.actorId===auth.user?.id&&(local||o.status!=='synced')&&!list.some((e:any)=>e.id===o.id)).map(o=>({id:o.id,...o.data,createdAt:o.occurredAt,offline:o.status!=='synced'}))
  response.data.data=Array.isArray(response.data.data)?[...extra,...list]:{...response.data.data,list:[...extra,...list]}
 }
 if(path==='/pos-cash/shifts'){
  const list=response.data.data.list||[],closed=await localClosedShifts(storeId)
  response.data.data.list=[...closed,...list.filter((s:any)=>!closed.some(l=>l.id===s.id))].filter(s=>(!params?.startDate||Date.parse(s.openedAt)>=Date.parse(params.startDate))&&(!params?.endDate||Date.parse(s.openedAt)<=Date.parse(params.endDate)))
 }
 return response
}
