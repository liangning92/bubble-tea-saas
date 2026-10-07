import {createHash} from 'crypto'
import prisma from '../config/database'
import {canonical} from '../utils/orderSnapshot'
import {allocateRefundTotal,canonicalSelection,requireRefundEvidence,unitRangeAmount,RefundSelection} from '../utils/refundAllocation'
import {replicaKey} from './ReceiptSyncService'

type Selected={itemId:string;quantity:number;start:number;amount:number}
type RecordV2={version:2;fingerprint:string;items:Selected[];allItems:boolean}
export function itemRefundRecord(value:string):RecordV2|null{try{const r=JSON.parse(value);return r?.version===2&&Array.isArray(r.items)?r:null}catch{return null}}
const fingerprint=(p:{orderId:string;reason:string;reasonCode:string;requestedBy:string;items:RefundSelection[]})=>createHash('sha256').update(canonical(p)).digest('hex')
async function orderState(tx:any,orderId:string,storeId:string,lock=false){
 if(lock){const row=await tx.order.updateMany({where:{id:orderId,storeId},data:{updatedAt:new Date()}});if(row.count!==1)throw Error('REFUND_ORDER_NOT_FOUND')}
 const order=await tx.order.findFirst({where:{id:orderId,storeId},include:{items:true}})
 if(!order)throw Error('REFUND_ORDER_NOT_FOUND')
 if(await tx.config.findUnique({where:{storeId_key:{storeId,key:replicaKey(orderId)}}}))throw Error('REPLICA_FINANCIAL_ACTION_LOCAL_ONLY')
 const requests=await tx.refundRequest.findMany({where:{orderId,status:{in:['approved','paid']}}})
 const used=new Map<string,number>();let refunded=0
 for(const request of requests){
  const record=itemRefundRecord(request.selectedItemIds)
  if(!record)throw Error('REFUND_ALLOCATION_EVIDENCE_REQUIRED')
  if (!Number.isSafeInteger(request.amount) || request.amount < 0 || record.items.reduce((sum,row)=>sum+row.amount,0)!==request.amount) throw Error('REFUND_ALLOCATION_EVIDENCE_REQUIRED')
  canonicalSelection(record.items)
  for(const row of record.items)used.set(row.itemId,(used.get(row.itemId)||0)+row.quantity)
  refunded+=request.amount
 }
 return {order,used,refunded}
}
function plan(state:Awaited<ReturnType<typeof orderState>>,selection:RefundSelection[]){
 const {order,used,refunded}=state;requireRefundEvidence(order)
 if (!Number.isSafeInteger(refunded) || refunded < 0 || refunded > order.finalAmount || [...used].some(([id,n])=>!order.items.some((i:any)=>i.id===id && n<=i.quantity))) throw Error('REFUND_ALLOCATION_EVIDENCE_REQUIRED')
 const allocations=allocateRefundTotal(order,order.finalAmount)
 const items=selection.map(row=>{
  const item=order.items.find((i:any)=>i.id===row.itemId),start=used.get(row.itemId)||0
  if(!item||start+row.quantity>item.quantity)throw Error('REFUND_QUANTITY_EXCEEDED')
  return {...row,start,amount:unitRangeAmount(allocations.get(item.id)!,item.quantity,start,row.quantity)}
 })
 const amount=items.reduce((s,i)=>s+i.amount,0)
 if(refunded+amount>order.finalAmount)throw Error('REFUND_AMOUNT_EXCEEDED')
 const allItems=order.items.every((i:any)=>(used.get(i.id)||0)+(selection.find(s=>s.itemId===i.id)?.quantity||0)===i.quantity)
 return {items,amount,allItems}
}
export async function quoteItemRefund(orderId:string,storeId:string){
 return prisma.$transaction(async tx=>{
  const state=await orderState(tx,orderId,storeId);requireRefundEvidence(state.order)
  const totals=allocateRefundTotal(state.order,state.order.finalAmount)
  return {orderId,finalAmount:state.order.finalAmount,refundedAmount:state.refunded,items:state.order.items.map((i:any)=>({itemId:i.id,name:i.productName,quantity:i.quantity,remaining:i.quantity-(state.used.get(i.id)||0),allocatedAmount:totals.get(i.id),refundedQuantity:state.used.get(i.id)||0}))}
 },{isolationLevel:'Serializable'})
}
export async function requestItemRefund(params:{requestId:string;orderId:string;storeId:string;reason:string;requestedBy:string;reasonCode:string;items:unknown}){
 const items=canonicalSelection(params.items)
 if(!/^[A-Za-z0-9-]{16,100}$/.test(params.requestId))throw Error('REFUND_REQUEST_ID_REQUIRED')
 if(params.reasonCode!=='customer_dissatisfied')throw Error('UNPREPARED_FULL_REFUND_REQUIRED')
 const digest=fingerprint({orderId:params.orderId,reason:params.reason,reasonCode:params.reasonCode,requestedBy:params.requestedBy,items})
 return prisma.$transaction(async tx=>{
  // All create/approve paths serialize on the same existing order row.
  const locked=await tx.order.updateMany({where:{id:params.orderId,storeId:params.storeId},data:{updatedAt:new Date()}})
  if(locked.count!==1)throw Error('REFUND_ORDER_NOT_FOUND')
  const prior=await tx.refundRequest.findUnique({where:{id:params.requestId}})
  if(prior){if(prior.orderId!==params.orderId||itemRefundRecord(prior.selectedItemIds)?.fingerprint!==digest)throw Error('REFUND_IDEMPOTENCY_CONFLICT');return prior}
  const state=await orderState(tx,params.orderId,params.storeId)
  if(state.order.status!=='completed')throw Error('REFUND_ORDER_STATE_INVALID')
  if(await tx.refundRequest.findFirst({where:{orderId:params.orderId,status:'pending'}}))throw Error('REFUND_PENDING_REQUEST_EXISTS')
  const selected=plan(state,items)
  return tx.refundRequest.create({data:{id:params.requestId,orderId:params.orderId,reason:params.reason,reasonCode:params.reasonCode,requestedBy:params.requestedBy,amount:selected.amount,selectedItemIds:JSON.stringify({version:2,fingerprint:digest,items:selected.items,allItems:selected.allItems}),status:'pending'}})
 })
}
export async function approveItemRefund(requestId:string,actor:{storeId:string;id:string;role:string},verifiedPrepared:boolean,note?:string){
 if(!['admin','manager'].includes(actor.role))throw Error('REFUND_APPROVAL_FORBIDDEN')
 if(!verifiedPrepared)throw Error('REFUND_CLASSIFICATION_REQUIRED')
 return prisma.$transaction(async tx=>{
  const initial=await tx.refundRequest.findUnique({where:{id:requestId}})
  if(!initial)throw Error('REFUND_REQUEST_NOT_FOUND')
  // Lock before rereading approval or remaining quantities.
  const locked=await tx.order.updateMany({where:{id:initial.orderId,storeId:actor.storeId},data:{updatedAt:new Date()}})
  if(locked.count!==1)throw Error('REFUND_ORDER_NOT_FOUND')
  const request=await tx.refundRequest.findUniqueOrThrow({where:{id:requestId}})
  const stored=itemRefundRecord(request.selectedItemIds)
  if(!stored||request.reasonCode!=='customer_dissatisfied')throw Error('INVALID_REFUND_ITEMS')
  if(request.status==='approved')return request
  if(request.status!=='pending')throw Error('REFUND_REQUEST_ALREADY_PROCESSED')
  const state=await orderState(tx,request.orderId,actor.storeId)
  if(state.order.status!=='completed')throw Error('REFUND_ORDER_STATE_INVALID')
  const calculated=plan(state,canonicalSelection(stored.items))
  if(canonical(calculated.items)!==canonical(stored.items)||calculated.amount!==request.amount||calculated.allItems!==stored.allItems)throw Error('REFUND_ALLOCATION_CHANGED')
  const o=state.order
  if(o.memberId){
   const logs=await tx.pointLog.findMany({where:{memberId:o.memberId,orderId:o.id,type:{in:['earn','redeem']}}})
   const pointShare=(total:number)=>{const allocations=allocateRefundTotal(o,total);return stored.items.reduce((sum,row)=>sum+unitRangeAmount(allocations.get(row.itemId)!,o.items.find((i:any)=>i.id===row.itemId).quantity,row.start,row.quantity),0)}
   const earned=pointShare(logs.filter(l=>l.type==='earn').reduce((s,l)=>s+Math.max(0,l.points),0)),redeemed=pointShare(logs.filter(l=>l.type==='redeem').reduce((s,l)=>s+Math.abs(l.points),0))
   let applied=false
   for(let attempt=0;attempt<5;attempt++){
    const member=await tx.member.findUnique({where:{id:o.memberId}});if(!member)throw Error('REFUND_MEMBER_NOT_FOUND')
    const deducted=Math.min(earned,member.points+redeemed)
    const changed=await tx.member.updateMany({where:{id:member.id,points:member.points,totalSpent:member.totalSpent},data:{points:{increment:redeemed-deducted},totalSpent:{decrement:Math.min(request.amount,member.totalSpent)}}})
    if(changed.count!==1)continue
    if(deducted)await tx.pointLog.create({data:{memberId:member.id,orderId:o.id,type:'adjust',points:-deducted,note:`Refund ${request.id}: reverse earned`}})
    if(redeemed)await tx.pointLog.create({data:{memberId:member.id,orderId:o.id,type:'adjust',points:redeemed,note:`Refund ${request.id}: return redeemed`}})
    applied=true;break
   }
   if(!applied)throw Error('REFUND_MEMBER_CONFLICT')
  }
  if(calculated.allItems){
   await tx.order.update({where:{id:o.id},data:{status:'refunded'}})
   await tx.memberCoupon.updateMany({where:{orderId:{in:[o.id,o.orderNumber]},status:'used'},data:{status:'unused',usedAt:null}})
  }
  if(o.paymentMethod==='cash'&&request.amount>0)await tx.cashEvent.create({data:{storeId:o.storeId,staffId:actor.id,type:'cash_out',amount:request.amount,paymentMethod:'cash',orderId:o.orderNumber,note:`Item refund ${request.id}`}})
  const changed=await tx.refundRequest.updateMany({where:{id:request.id,status:'pending'},data:{status:'approved',approvedBy:actor.id,approvedAt:new Date(),note}})
  if(changed.count!==1)throw Error('REFUND_REQUEST_ALREADY_PROCESSED')
  return tx.refundRequest.findUniqueOrThrow({where:{id:request.id}})
 })
}
