import {workOperationPayload} from './offlineWork'
import {refundDecisionPayload} from './offlineRefunds'
import {memberRegistrationPolicy,offlineMemberCreationKey,offlineMemberScope} from './offlineMembers'
import { db, type LocalOrder } from '../db/offline'
import { localIdentity, readServerSnapshot, readSnapshot } from './offlineSale'
import { readBackendAuth, currentBackendIdentity } from './backendIdentity'

export interface OfflineOperation {
 id:string;sessionId:string;occurredAt:string;authorization:string
 kind:'open'|'close'|'cash'|'expense'|'refund'|'member'|'refund-settle'|'task'|'attendance';data:Record<string,any>
 backendUrl:string;storeId:string;actorId:string;staffId:string
 status:'pending'|'review'|'synced';error?:string;result?:any
}
const scope=(storeId:string)=>`${encodeURIComponent(localIdentity(storeId))}:${encodeURIComponent(storeId)}:`
const operationKey=(op:OfflineOperation)=>`offline.operation:${encodeURIComponent(op.backendUrl)}:${encodeURIComponent(op.storeId)}:${op.id}`
const currentKey=(storeId:string)=>'offline.shift.current:'+scope(storeId)
const sessionKey=(storeId:string,id:string)=>'offline.shift.session:'+scope(storeId)+id
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value))
const accepted=(row:LocalOrder)=>!!row.locallyAcceptedAt&&!['rejected','discarded'].includes(row.checkoutResolution||'')
export async function offlineOperations(storeId:string):Promise<OfflineOperation[]> {
 const backend=localIdentity(storeId)
 return (await db.config.where('key').startsWith('offline.operation:').toArray()).map(r=>r.value as OfflineOperation).filter(o=>o.storeId===storeId&&o.backendUrl===backend).sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||({task:1,attendance:1,member:0,open:0,cash:1,expense:1,refund:1,'refund-settle':1,close:2}[a.kind]-{task:1,attendance:1,member:0,open:0,cash:1,expense:1,refund:1,'refund-settle':1,close:2}[b.kind]))
}
export async function hasOfflineOperations(storeId:string) {return (await offlineOperations(storeId)).some(o=>o.status!=='synced')}
export async function currentOfflineShift(storeId:string,server?:any):Promise<any> {
 const pointer=await db.config.get(currentKey(storeId))
 let baseline=server?.data
 if(pointer){
  if(pointer.value===null){
   if(server&&!await hasOfflineOperations(storeId)){await db.config.delete(currentKey(storeId));baseline=server.data}
   else return {code:200,data:{hasOpenShift:false,shift:null,offline:true}}
  }
  const session=pointer.value===null?null:await db.config.get(sessionKey(storeId,pointer.value))
  if(pointer.value!==null&&!session)throw Error('OFFLINE_SHIFT_LEDGER_MISSING')
  if(session)baseline=session.value.baseline
  // Fresh server aggregates include synced local UUIDs. Never add those UUIDs twice.
  if(session&&server?.data?.shift?.id===pointer.value){
   baseline=server.data
   await db.config.put({...session,value:{...session.value,baseline:clone(baseline)},updatedAt:new Date()})
  }
 }
 if(!baseline){try{baseline=(await readServerSnapshot('/pos-cash/shifts/current',storeId) as any).data}catch{throw Error('OFFLINE_INITIALIZATION_REQUIRED')}}
 if(!baseline?.hasOpenShift||!baseline.shift?.id)return {code:200,data:baseline}
 if(baseline.shift.storeId&&baseline.shift.storeId!==storeId)throw Error('CHECKOUT_BACKEND_CHANGED')
 const rows=await db.orders.where('[backendUrl+storeId+shiftSessionId]').equals([localIdentity(storeId),storeId,baseline.shift.id]).filter(accepted).toArray()
 const included=new Set<string>(baseline.includedOrderNumbers||[])
 // Old servers have no complete inclusion manifest: never guess which delivered rows overlap.
 const extra=rows.filter(row=>!included.has(row.orderNumber)&&(!row.syncedAt||Array.isArray(baseline.includedOrderNumbers)))
 const result=clone(baseline)
 const ops=(await offlineOperations(storeId)).filter(o=>o.sessionId===baseline.shift.id&&o.kind!=='open'&&o.kind!=='close')
 const boundary=baseline.summaryEvidence?.windowEnd ? Date.parse(baseline.summaryEvidence.windowEnd) : -Infinity
 const includedOps=new Set<string>(baseline.includedOfflineOperationIds||[])
 const extraOps=ops.filter(o=>!includedOps.has(o.id)&&(Array.isArray(baseline.includedOfflineOperationIds)||o.status!=='synced'||Date.parse(o.occurredAt)>=boundary))
 const paidRefunds=extraOps.filter(o=>o.kind==='refund-settle'&&o.data.decision==='approve')
 const refundAmount=paidRefunds.reduce((s,o)=>s+o.data.amount,0),refundCashOut=paidRefunds.filter(o=>o.data.payoutMethod==='cash').reduce((s,o)=>s+o.data.amount,0)
 const revenue=extra.reduce((sum,o)=>sum+o.finalAmount,0), qris=extra.filter(o=>o.paymentMethod==='qris').reduce((sum,o)=>sum+o.finalAmount,0)
 const otherNonCash=extra.filter(o=>!['cash','qris'].includes(o.paymentMethod)).reduce((sum,o)=>sum+o.finalAmount,0)
 const expenses=extraOps.filter(o=>o.kind==='expense'&&o.data.paymentSource==='drawer_cash').reduce((sum,o)=>sum+o.data.amount,0)
 const cashIns=extraOps.filter(o=>o.kind==='cash'&&o.data.type!=='cash_out').reduce((sum,o)=>sum+o.data.amount,0)
 const cashOuts=extraOps.filter(o=>o.kind==='cash'&&o.data.type==='cash_out').reduce((sum,o)=>sum+o.data.amount,0)
 if(!result.cashReconciliation)throw Error('OFFLINE_SHIFT_BASELINE_REQUIRED')
 const r=result.cashReconciliation
 r.revenue+=revenue-refundAmount;r.qris+=qris;r.expenses+=expenses;r.otherNonCash=(r.otherNonCash||0)+otherNonCash;r.cashFromRevenue+=revenue-qris-otherNonCash-expenses;r.cashIns=(r.cashIns||0)+cashIns;r.cashOuts=(r.cashOuts||0)+cashOuts+refundCashOut;r.expectedCash=r.openFloat+r.cashFromRevenue+r.cashIns-r.cashOuts
 const end=new Date().toISOString()
 r.windowEnd=end
 const evidence=result.summaryEvidence||{}
 Object.assign(evidence,{status:'local',windowEnd:end,windowStart:baseline.shift.openedAt,cashSales:(evidence.cashSales||0)+revenue-qris-otherNonCash,cashIns:(evidence.cashIns||0)+cashIns,cashOuts:(evidence.cashOuts||0)+cashOuts+refundCashOut,qrisReceipts:(evidence.qrisReceipts||0)+qris,orderCount:(evidence.orderCount||0)+extra.length,cupCount:(evidence.cupCount||0)+extra.reduce((sum,o)=>sum+o.items.reduce((n:number,i:any)=>n+i.quantity,0),0),orderReceipts:(evidence.orderReceipts||0)+revenue-refundAmount,localOrderNumbers:rows.map(o=>o.orderNumber)})
 result.summaryEvidence=evidence
 Object.assign(result,{offline:!!pointer||extra.length>0||extraOps.length>0,todayCashSales:evidence.cashSales,todayCashIns:evidence.cashIns,todayCashOuts:evidence.cashOuts,todayOrderCount:evidence.orderCount,todayOrderAmount:evidence.orderReceipts,currentBalance:r.expectedCash,expectedCash:r.expectedCash})
 result.purchaseExpenses=result.purchaseExpenses||{total:0,count:0,items:[],source:'pos_reimbursement',currency:'IDR',recordedOnly:true}
 const purchases=extraOps.filter(o=>o.kind==='expense'&&o.data.paymentSource==='drawer_cash').map(o=>({id:o.id,category:o.data.category,quantity:o.data.quantity,amount:o.data.amount,description:o.data.description}))
 result.purchaseExpenses.items.push(...purchases);result.purchaseExpenses.total+=purchases.reduce((s,p)=>s+p.amount,0);result.purchaseExpenses.count+=purchases.length
 result.shift.updatedAt=new Date(Math.max(Date.parse(result.shift.updatedAt||result.shift.openedAt),...rows.map(o=>new Date(o.occurredAt||o.createdAt).getTime()),...ops.map(o=>Date.parse(o.occurredAt)))).toISOString()
 return {code:200,data:result}
}
function assertMoney(value:any,positive=false,max=2147483647){if(!Number.isSafeInteger(value)||value<(positive?1:0)||value>max)throw Error('OFFLINE_AMOUNT_INVALID')}
async function grant(storeId:string,kind:OfflineOperation['kind']) {
 const auth=readBackendAuth() as any
 const backend=localIdentity(storeId)
 const cached=(await db.config.get(`offline.authorization:${encodeURIComponent(backend)}:${encodeURIComponent(storeId)}:${auth.user?.id}`))?.value
 const permission=kind==='task'?'personal.tasks':kind==='attendance'?'personal.attendance':kind==='refund-settle'?'orders.refund':kind==='member'?'members.write':kind==='refund'?'orders.refund.request':kind==='cash'?'pos.cash':kind==='expense'?'pos.expense':'pos.shift'
 if(!cached?.token||cached.actorId!==auth.user?.id||!Number.isFinite(Date.parse(cached.expiresAt))||!Number.isFinite(Date.parse(cached.issuedAt))||Date.parse(cached.expiresAt)<=Date.now()||Date.parse(cached.issuedAt)>Date.now()||!cached.permissions?.includes(permission))throw Error('OFFLINE_AUTHORIZATION_REQUIRED')
 return {auth,backend,cached}
}
async function queue(kind:OfflineOperation['kind'],data:Record<string,any>) {
 const storeId=readBackendAuth().user?.storeId
 if(!storeId)throw Error('CHECKOUT_BACKEND_LOGIN_REQUIRED')
 const {auth,backend,cached}=await grant(storeId,kind)
 let now=new Date().toISOString()
 const id=['expense','refund','member'].includes(kind)?data.requestId:crypto.randomUUID()
 const op=await db.transaction('rw',db.config,db.orders,async()=>{
  if(localIdentity(storeId)!==backend||readBackendAuth().user?.id!==auth.user.id)throw Error('CHECKOUT_AUTH_CHANGED')
  if(kind==='expense'||kind==='refund'||kind==='member'){
   const previous=await db.config.get(`offline.operation:${encodeURIComponent(backend)}:${encodeURIComponent(storeId)}:${id}`)
   if(previous){if(JSON.stringify(previous.value.data)!==JSON.stringify(['refund','member'].includes(kind)?Object.fromEntries(Object.entries(data).filter(([key])=>key!=='requestId')):data))throw Error('POS_EXPENSE_REQUEST_CONFLICT');return previous.value as OfflineOperation}
  }
  const previousOps=await offlineOperations(storeId)
  const clockKey=`offline.ledger.clock:${encodeURIComponent(backend)}:${encodeURIComponent(storeId)}`
  const clock=(await db.config.get(clockKey))?.value||0
  if(!Number.isSafeInteger(clock)||clock>Date.now()+60000)throw Error('OFFLINE_CLOCK_INVALID')
  now=new Date(Math.max(Date.now(),clock+1,...previousOps.map(o=>Date.parse(o.occurredAt)+1))).toISOString()
  if(Date.parse(cached.expiresAt)<=Date.parse(now))throw Error('OFFLINE_AUTHORIZATION_REQUIRED')
  const current=await currentOfflineShift(storeId)
  let sessionId=current.data?.shift?.id
  let payload=clone(data)
  if(kind==='task'||kind==='attendance'){
   payload=await workOperationPayload(kind,data)
   sessionId=kind==='task'?'TASK:'+payload.taskId:'ATTENDANCE:'+auth.user.staff?.id
  }else if(kind==='refund-settle'){
   const previous=previousOps.find(o=>o.kind==='refund-settle'&&o.data.requestId===data.requestId)
   if(previous){if(previous.data.decision!==data.decision)throw Error('REFUND_REQUEST_ALREADY_PROCESSED');return previous}
   payload=await refundDecisionPayload(data)
   if(payload.decision==='approve'&&(!sessionId||!current.data.hasOpenShift))throw Error('OPEN_SHIFT_REQUIRED')
   if(payload.decision==='reject')sessionId='REFUND:'+payload.localEvidence.orderNumber
  }else if(kind==='member'){
   const policy=await memberRegistrationPolicy()
   if(!data.name?.trim()||data.name.trim().length>50||!/^\+?[0-9]{10,15}$/.test(data.phone))throw Error('OFFLINE_MEMBER_INVALID')
   const entries=(await db.config.where('key').startsWith(offlineMemberScope()).toArray()).concat(await db.config.where('key').startsWith(offlineMemberCreationKey('')).toArray())
   const duplicate=previousOps.find(o=>o.kind==='member'&&o.data.phone===data.phone)
   if(duplicate){if(['name','phone','email','birthday','referredByPhone'].some(k=>(duplicate.data[k]||'')!==(data[k]||'')))throw Error('MEMBER_PHONE_ALREADY_REGISTERED');return duplicate}
   if(entries.some(r=>r.value.member?.phone===data.phone))throw Error('MEMBER_PHONE_ALREADY_REGISTERED')
   if(data.email&&(data.email.length>150||!/^(?!\.)(?!.*\.\.)([a-z0-9_'+\-\.]*)[a-z0-9_+-]@([a-z0-9][a-z0-9\-]*\.)+[a-z]{2,}$/i.test(data.email)))throw Error('OFFLINE_MEMBER_INVALID')
   if(data.birthday&&(!/^\d{4}-\d{2}-\d{2}$/.test(data.birthday)||!Number.isFinite(Date.parse(data.birthday))||new Date(data.birthday).toISOString().slice(0,10)!==data.birthday))throw Error('OFFLINE_MEMBER_INVALID')
   if((data.referredByPhone||'').length>100)throw Error('OFFLINE_MEMBER_INVALID')
   const memberId='POSMEMBER-'+id
   sessionId='MEMBER:'+memberId
   const member={id:memberId,storeId,name:data.name.trim(),phone:data.phone,email:data.email||null,birthday:data.birthday||null,level:'bronze',status:'active',points:policy.welcomePoints,balance:0,totalSpent:0,referralCode:id.replace(/-/g,'').toUpperCase(),createdAt:now,updatedAt:now}
   await db.config.put({key:offlineMemberCreationKey(memberId),value:{purpose:'pos-offline-member-registration',token:policy.token,member,rule:policy.rule,coupons:[],issuedAt:policy.issuedAt,expiresAt:policy.expiresAt,includedOrders:[]},updatedAt:new Date()})
   payload={name:member.name,phone:member.phone,email:data.email||'',birthday:data.birthday||'',referredByPhone:data.referredByPhone||'',registrationToken:policy.token}
  }else if(kind==='refund'){
   if(!data.orderNumber||!data.reason?.trim()||!Array.isArray(data.selection)||!data.selection.length)throw Error('OFFLINE_REFUND_INVALID')
   if(previousOps.some(o=>o.kind==='refund'&&o.data.orderNumber===data.orderNumber&&!previousOps.some(d=>d.kind==='refund-settle'&&d.data.requestId===o.id)))throw Error('REFUND_PENDING_REQUEST_EXISTS')
   sessionId='REFUND:'+data.orderNumber
   delete payload.requestId
  }else if(kind==='open'){
   assertMoney(data.openFloat,true)
   if(current.data?.hasOpenShift)throw Error('SHIFT_ALREADY_OPEN')
   const shifts=(await readSnapshot('/shifts',storeId) as any).data
   if(!Array.isArray(shifts)||!shifts.some(s=>s.key===data.shift&&s.key!=='off'&&s.isActive!==false))throw Error('SHIFT_DISABLED')
   sessionId='POSSHIFT-'+id
   const baseline={hasOpenShift:true,shift:{id:sessionId,storeId,staffId:auth.user.staff?.id,shift:data.shift,openFloat:data.openFloat,status:'open',openedAt:now,updatedAt:now},includedOrderNumbers:[],includedOfflineOperationIds:[],openFloat:data.openFloat,cashReconciliation:{version:1,source:'local_shift_ledger',windowStart:now,windowEnd:now,revenue:0,qris:0,expenses:0,cashFromRevenue:0,openFloat:data.openFloat,expectedCash:data.openFloat},summaryEvidence:{status:'local',windowStart:now,windowEnd:now,cashSales:0,cashIns:0,cashOuts:0,qrisReceipts:0,orderCount:0,cupCount:0,orderReceipts:0}}
   await db.config.put({key:sessionKey(storeId,sessionId),value:{baseline},updatedAt:new Date()})
   await db.config.put({key:currentKey(storeId),value:sessionId,updatedAt:new Date()})
  }else{
   if(!sessionId||!current.data?.hasOpenShift)throw Error('OPEN_SHIFT_REQUIRED')
   if(Date.parse(current.data.shift.openedAt)>Date.now())throw Error('OFFLINE_CLOCK_INVALID')
   if(kind==='close'){
    assertMoney(data.actualCash)
    const settings=(await readSnapshot('/config',storeId) as any).data?.shiftSettings||{}
    if(settings.requireSupervisorConfirm&&!['admin','manager'].includes(auth.user.role))throw Error('SUPERVISOR_REQUIRED')
    if(data.manualReceipts)for(const value of Object.values(data.manualReceipts))assertMoney(value)
    if(data.manualReceiptsCashBasis==='drawer_total'&&data.manualReceipts?.cash!==data.actualCash)throw Error('SHIFT_DRAWER_AMOUNT_MISMATCH')
    const reviewed=data.reviewedSnapshot,r=current.data.cashReconciliation
    if(reviewed&&(reviewed.sessionId!==sessionId||reviewed.updatedAt!==current.data.shift.updatedAt||reviewed.openFloat!==r.openFloat||reviewed.revenue!==r.revenue||reviewed.expenses!==r.expenses||reviewed.qris!==r.qris))throw Error('SHIFT_PREVIEW_CHANGED')
    const rows=await db.orders.where('[backendUrl+storeId+shiftSessionId]').equals([backend,storeId,sessionId]).filter(o=>!['rejected','discarded'].includes(o.checkoutResolution||'')).toArray()
    if(rows.some(o=>!accepted(o)&&o.status!=='synced'))throw Error('CHECKOUT_REVIEW_REQUIRED')
    now=new Date(Math.max(Date.parse(now),...rows.map(o=>new Date(o.occurredAt||o.createdAt).getTime()+1))).toISOString()
    const orders=rows.filter(accepted).map(o=>({orderNumber:o.orderNumber,finalAmount:o.finalAmount}))
    const receipts=data.manualReceipts
    if(receipts?.qris!==undefined){const recordedQris=r.qris,delta=receipts.qris-recordedQris;Object.assign(r,{recordedQris,qris:receipts.qris,qrisSource:'manual_handover',cashFromRevenue:r.cashFromRevenue-delta,expectedCash:r.expectedCash-delta})}
    const report={version:3,offline:true,offlineStatus:'pending',reportKind:'handover',sessionId,shiftType:current.data.shift.shift,cashierName:auth.user.staff?.name||null,openedAt:current.data.shift.openedAt,closedAt:now,openFloat:r.openFloat,actualCash:data.actualCash,manualReceipts:receipts||null,manualReceiptsCashBasis:data.manualReceiptsCashBasis||'cash_receipts',manualReceiptsSource:receipts?'manual_handover':null,cashReconciliation:r,handoverFinancials:{drawerTotal:data.actualCash,openFloat:r.openFloat,expenses:r.expenses,qris:receipts?.qris??null,shopeefood:receipts?.shopeefood||0,gofood:receipts?.gofood||0,orderRevenue:r.revenue,actualCashReceived:data.actualCash-r.openFloat,totalRevenue:r.revenue+(receipts?.shopeefood||0)+(receipts?.gofood||0),cashFormula:'drawerTotal-openFloat',revenueFormula:'orderRevenue+shopeefood+gofood'},summaryEvidence:current.data.summaryEvidence,purchaseExpenses:current.data.purchaseExpenses,expectedCash:r.expectedCash,recordedBalance:r.expectedCash,cashDifference:data.actualCash-r.expectedCash,summaryItems:settings.summaryItems||{},orderManifest:orders}
    payload={actualCash:data.actualCash,closeNote:data.closeNote,nextStaffId:data.nextStaffId,manualReceipts:data.manualReceipts,manualReceiptsCashBasis:data.manualReceiptsCashBasis,orders,localReport:report}
    const result={...current.data.shift,status:'closed',closedAt:now,actualCash:data.actualCash,expectedCash:r.expectedCash,cashDifference:report.cashDifference,purchaseExpenses:report.purchaseExpenses,report}
    await db.config.put({key:sessionKey(storeId,sessionId),value:{baseline:current.data,closed:result},updatedAt:new Date()})
    await db.config.put({key:currentKey(storeId),value:null,updatedAt:new Date()})
   }else{
    assertMoney(data.amount,true,kind==='expense'?21474836:2147483647)
    if(kind==='cash'&&!['cash_in','cash_out','float'].includes(data.type))throw Error('OFFLINE_CASH_TYPE_INVALID')
    if(kind==='expense'){
     assertMoney(data.quantity,true,1000000)
     if(!data.requestId||!data.description?.trim())throw Error('OFFLINE_EXPENSE_INVALID')
     const categories=(await readSnapshot('/expenses/categories',storeId) as any).data?.list
     if(!categories?.some((c:any)=>c.key===data.category&&c.posVisible!==false))throw Error('POS_EXPENSE_CATEGORY_INVALID')
    }
   }
   // Existing server sessions become local ledgers when any offline financial action occurs.
   if(!await db.config.get(currentKey(storeId))) {
    const baseline=(await readServerSnapshot('/pos-cash/shifts/current',storeId) as any).data
    await db.config.put({key:sessionKey(storeId,sessionId),value:{baseline:clone(baseline)},updatedAt:new Date()})
    await db.config.put({key:currentKey(storeId),value:sessionId,updatedAt:new Date()})
   }
  }
  if(kind==='task'&&payload.photoUrl?.startsWith('data:')){
   const key=`offline.work.photo:${encodeURIComponent(backend)}:${storeId}:${id}`
   await db.config.put({key,value:{url:payload.photoUrl},updatedAt:new Date()})
   payload.photoUrl='offline-photo:'+id
  }
  const op:OfflineOperation={id,sessionId,occurredAt:now,authorization:cached.token,kind,data:clone(payload),backendUrl:backend,storeId,actorId:auth.user.id,staffId:auth.user.staff?.id||'',status:'pending'}
  await db.config.put({key:operationKey(op),value:op,updatedAt:new Date()})
  await db.config.put({key:clockKey,value:Date.parse(now),updatedAt:new Date()})
  return op
 })
 window.dispatchEvent(new Event('pos-offline-changed'))
 // Delivery is independent of local financial acceptance and printing.
 const {syncManager}=await import('../db/offline');void syncManager.syncPendingOrders()
 return operationResult(op)
}
export async function operationResult(op:OfflineOperation):Promise<any> {
 if(op.result)return op.result
 if(op.kind==='close')return (await db.config.get(sessionKey(op.storeId,op.sessionId)))?.value.closed
 if(op.kind==='member')return (await db.config.get(offlineMemberCreationKey('POSMEMBER-'+op.id)))?.value.member
 if(op.kind==='open')return (await db.config.get(sessionKey(op.storeId,op.sessionId)))?.value.baseline.shift
 return {id:op.id,...op.data,createdAt:op.occurredAt,shiftSessionId:op.sessionId,offline:true,...(op.kind==='refund'?{status:'pending_offline'}:{})}
}
export const openOfflineShift=(data:{openFloat:number;shift:string})=>queue('open',data)
export const closeOfflineShift=(data:Record<string,any>)=>queue('close',data)
export const createOfflineCashEvent=(data:Record<string,any>)=>queue('cash',data)
export async function createOfflineMember(data:Record<string,any>){
 const storeId=readBackendAuth().user?.storeId;if(!storeId||data.storeId&&data.storeId!==storeId)throw Error('CHECKOUT_BACKEND_CHANGED')
 const normalized={name:data.name?.trim(),phone:data.phone?.trim(),email:data.email||'',birthday:data.birthday||'',referredByPhone:data.referredByPhone||''}
 const previous=(await offlineOperations(storeId)).find(o=>o.kind==='member'&&o.data.phone===normalized.phone)
 if(previous){if(Object.entries(normalized).some(([k,v])=>previous.data[k]!==v))throw Error('MEMBER_PHONE_ALREADY_REGISTERED');return operationResult(previous)}
 return queue('member',{...normalized,requestId:crypto.randomUUID()})
}
export const createOfflineWorkOperation=(kind:'task'|'attendance',data:Record<string,any>)=>queue(kind,data)
export const createOfflineRefundDecision=(data:Record<string,any>)=>queue('refund-settle',data)
export const createOfflineRefund=(data:Record<string,any>)=>queue('refund',data)
export const createOfflineExpense=(data:Record<string,any>)=>queue('expense',data)
export async function offlineHandover(storeId:string,id:string){const session=(await db.config.get(sessionKey(storeId,id)))?.value;return session?.serverClosed||session?.closed||null}
export async function localClosedShifts(storeId:string){return (await db.config.where('key').startsWith('offline.shift.session:'+scope(storeId)).toArray()).map(r=>r.value.serverClosed||r.value.closed).filter(Boolean)}

/** Serialized under the checkout delivery lock. A failed dependency stops later shifts. */
export async function syncOperationsBefore(auth:any,before=Infinity,review=false):Promise<boolean> {
 for(const op of await offlineOperations(auth.user.storeId)){
  if(op.status==='synced'||Date.parse(op.occurredAt)>before||(op.kind==='close'&&Date.parse(op.occurredAt)===before))continue
  if(op.status==='review'&&!review){if(['refund','task','attendance'].includes(op.kind))continue;return false}
  if(op.kind==='refund'){const order=await db.orders.filter(o=>o.backendUrl===op.backendUrl&&o.storeId===op.storeId&&o.orderNumber===op.data.orderNumber).first();if(order&&order.status!=='synced')continue}
  if(op.kind==='refund-settle'&&!(await offlineOperations(op.storeId)).some(parent=>parent.id===op.data.requestId&&parent.status==='synced'))return false
  if(op.kind==='close'){
   const rows=await db.orders.filter(o=>o.backendUrl===op.backendUrl&&o.storeId===op.storeId&&op.data.orders.some((item:any)=>item.orderNumber===o.orderNumber)).toArray()
   if(rows.length!==op.data.orders.length||rows.some(o=>o.status!=='synced'))return false
  }
  try{
   const current=readBackendAuth()
   if(current.token!==auth.token||current.user?.storeId!==op.storeId||currentBackendIdentity()!==op.backendUrl)throw Error('CHECKOUT_AUTH_CHANGED')
   const {id,sessionId,occurredAt,authorization,kind}=op
   let data=op.data
   if(kind==='task'&&data.photoUrl?.startsWith('offline-photo:')){const photo=await db.config.get(`offline.work.photo:${encodeURIComponent(op.backendUrl)}:${op.storeId}:${op.id}`);if(data.photoUrl!=='offline-photo:'+op.id||!photo?.value?.url)throw Error('OFFLINE_TASK_PHOTO_UNAVAILABLE');data={...data,photoUrl:photo.value.url}}
   const response=await fetch(op.backendUrl+'/pos-cash/shifts/offline-operations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth.token}`},signal:AbortSignal.timeout(15000),body:JSON.stringify({id,sessionId,occurredAt,authorization,kind,data})})
   const body=await response.json().catch(()=>null)
   if(response.status!==200||!body?.data){
    if(response.status===401){const {useAuthStore}=await import('../stores/auth');if(readBackendAuth().token===auth.token)useAuthStore.getState().expireCloudSession()}
    op.error=body?.message||`HTTP ${response.status}`;op.status=[400,403,404,409,422].includes(response.status)?'review':'pending'
    await db.config.put({key:operationKey(op),value:op,updatedAt:new Date()});window.dispatchEvent(new Event('pos-offline-changed'));if(['refund','task','attendance'].includes(op.kind)&&op.status==='review')continue;return false
   }
   op.status='synced';op.result=body.data;delete op.error
   await db.transaction('rw',db.config,async()=>{
    await db.config.put({key:operationKey(op),value:op,updatedAt:new Date()})
    if(op.kind==='close'){
     const session=await db.config.get(sessionKey(op.storeId,op.sessionId))
     if(session)await db.config.put({...session,value:{...session.value,serverClosed:body.data},updatedAt:new Date()})
    }
   })
   window.dispatchEvent(new Event('pos-offline-changed'))
  }catch(error){op.error=String(error);await db.config.put({key:operationKey(op),value:op,updatedAt:new Date()});return false}
 }
 return true
}
