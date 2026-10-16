import {z} from 'zod'
import {canonical} from '../utils/orderSnapshot'
import {allocateRefundTotal,unitRangeAmount} from '../utils/refundAllocation'
import {approveItemRefund,itemRefundRecord} from './ItemRefundService'
import {refundOrder} from './OrderService'
import {validateRefundApproval} from '../utils/refundPolicy'
import {blocksSelfApproval} from '../utils/refundApprovalAccess'
export const offlineRefundDecisionSchema=z.object({requestId:z.string().uuid(),decision:z.enum(['approve','reject']),amount:z.number().int().nonnegative().max(2147483647),payoutMethod:z.enum(['cash','external']),verifiedPrepared:z.boolean(),verifiedUnprepared:z.boolean(),note:z.string().trim().min(1).max(2000),localEvidence:z.record(z.unknown())}).strict()
export async function applyOfflineRefundDecision(tx:any,storeId:string,input:any,actor:any,_authorization:any){
 const parent=await tx.config.findUnique({where:{storeId_key:{storeId,key:'pos.offline.operation:'+input.data.requestId}}})
 const saved=parent?JSON.parse(parent.value):null
 if(saved?.kind!=='refund'||saved.result?.id!==input.data.requestId)throw Error('OFFLINE_REFUND_REQUEST_PENDING')
 const request=await tx.refundRequest.findUnique({where:{id:input.data.requestId},include:{order:{include:{items:true}}}})
 if(!request||request.order.storeId!==storeId||request.status!=='pending')throw Error('REFUND_REQUEST_ALREADY_PROCESSED')
 if(blocksSelfApproval(actor,request.requestedBy,'orders.refund'))throw Error('STAFF_ACCESS_SELF_APPROVAL')
 if(input.data.decision==='reject'){
  if(input.data.amount!==0)throw Error('OFFLINE_REFUND_AMOUNT_CHANGED')
  return tx.refundRequest.update({where:{id:request.id},data:{status:'rejected',note:input.data.note}})
 }
 const shift=await tx.shiftSession.findFirst({where:{id:input.sessionId,storeId,status:'open'}}),at=new Date(input.occurredAt)
 if(!shift||at<shift.openedAt)throw Error('OFFLINE_SHIFT_CONFLICT')
 if(request.amount!==input.data.amount||request.amount<=0)throw Error('OFFLINE_REFUND_AMOUNT_CHANGED')
 const record=itemRefundRecord(request.selectedItemIds),evidence=input.data.localEvidence
 if(evidence.orderNumber!==request.order.orderNumber||evidence.originalPaymentMethod!==request.order.paymentMethod||evidence.memberId!==(request.order.memberId||undefined))throw Error('OFFLINE_REFUND_EVIDENCE_CHANGED')
 const selection=record?.items||request.order.items.map((i:any)=>({itemId:i.id,quantity:i.quantity,start:0,amount:allocateRefundTotal(request.order,request.order.finalAmount).get(i.id)!})).sort((a:any,b:any)=>a.itemId.localeCompare(b.itemId))
 if(canonical(evidence.selection)!==canonical(selection)||evidence.allItems!==(record?.allItems??true))throw Error('OFFLINE_REFUND_EVIDENCE_CHANGED')
 const logs=request.order.memberId?await tx.pointLog.findMany({where:{orderId:request.orderId,memberId:request.order.memberId,type:{in:['earn','redeem']}}}):[]
 const share=(total:number)=>{const parts=allocateRefundTotal(request.order,total);return selection.reduce((s:number,row:any)=>s+unitRangeAmount(parts.get(row.itemId)!,request.order.items.find((i:any)=>i.id===row.itemId).quantity,row.start,row.quantity),0)}
 if(evidence.pointsReturned!==share(logs.filter((l:any)=>l.type==='redeem').reduce((s:number,l:any)=>s+Math.abs(l.points),0))||evidence.pointsReversed!==share(logs.filter((l:any)=>l.type==='earn').reduce((s:number,l:any)=>s+Math.max(0,l.points),0)))throw Error('OFFLINE_REFUND_MEMBER_EVIDENCE_CHANGED')
 const coupons=evidence.allItems?await tx.memberCoupon.findMany({where:{orderId:{in:[request.order.id,request.order.orderNumber]},status:'used'}}):[]
 if(evidence.couponId!==(coupons[0]?.id)||evidence.couponTemplateId!==(coupons[0]?.couponId))throw Error('OFFLINE_REFUND_MEMBER_EVIDENCE_CHANGED')
 const execution={cashEventId:input.id,occurredAt:at,payoutMethod:input.data.payoutMethod,shift:shift.shift}
 const approvalRole=actor.role==='admin'?'admin':actor.accessRole?.version===2?'manager':actor.role
 if(itemRefundRecord(request.selectedItemIds))await approveItemRefund(request.id,{storeId,id:actor.staffId||actor.id,role:approvalRole},input.data.verifiedPrepared,input.data.note,tx,execution)
 else{
  validateRefundApproval(request,request.order,approvalRole,input.data.verifiedPrepared,input.data.verifiedUnprepared)
  await refundOrder(request.orderId,request.reason,actor.staffId,request.amount,{requestId:request.id,approvedBy:actor.staffId||actor.id,restoreUnprepared:request.reasonCode==='paid_unprepared',note:input.data.note},tx,undefined,execution)
 }
 for(const coupon of coupons)await tx.coupon.updateMany({where:{id:coupon.couponId,usedCount:{gt:0}},data:{usedCount:{decrement:1}}})
 await tx.financeAuditLog.create({data:{storeId,userId:actor.id,action:'update',entityType:'offline_refund',entityId:request.id,description:'Original offline refund payout confirmed by approver',newValue:JSON.stringify({...input.data,occurredAt:input.occurredAt,sessionId:input.sessionId})}})
 return tx.refundRequest.findUniqueOrThrow({where:{id:request.id}})
}
