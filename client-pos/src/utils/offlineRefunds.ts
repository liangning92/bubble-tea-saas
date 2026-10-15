import {db} from '../db/offline'
import {localIdentity} from './offlineSale'
import {readBackendAuth} from './backendIdentity'
import {createOfflineRefund,createOfflineRefundDecision,offlineOperations} from './offlineOperations'
import {allocateRefundTotal,unitRangeAmount,canonicalSelection} from '../../../shared/utils/refundAllocation'
const orderKey=(id:string)=>{const a=readBackendAuth();return `offline.refund.order:${encodeURIComponent(localIdentity(a.user!.storeId!))}:${encodeURIComponent(a.user!.storeId!)}:${id}`}
export async function cacheRefundOrder(order:any,quote:any){
 if(order.storeId!==readBackendAuth().user?.storeId)throw Error('CHECKOUT_BACKEND_CHANGED')
 await db.config.put({key:orderKey(order.id),value:{order,quote},updatedAt:new Date()})
}
export async function recordedOrder(id:string):Promise<any>{
 const auth=readBackendAuth(),storeId=auth.user?.storeId;if(!storeId)throw Error('CHECKOUT_BACKEND_LOGIN_REQUIRED')
 const backend=localIdentity(storeId),local=await db.orders.where('[backendUrl+storeId]').equals([backend,storeId]).filter(o=>o.localId===id||o.serverId===id||o.orderNumber===id).first()
 if(local){
  if(auth.user?.role==='cashier'&&local.staffId!==auth.user.staff?.id)throw Error('STAFF_ACCESS_PERMISSION_DENIED')
  const cached=local.serverId?await db.config.get(orderKey(local.serverId)):null
  return {...local,id:local.serverId||local.localId,items:local.cloudReceipt?.items||local.items.map((item:any,index:number)=>({...item,id:item.offlineItemId||`${local.localId}:${index}`})),refundBaseline:cached?.value.quote,memberEffects:cached?.value.quote?.memberEffects||local.cloudReceipt?.memberEffects||{memberId:local.memberId,pointsEarned:local.checkoutRequest?.offlineMemberPointsEarned||0,pointsRedeemed:local.pointsRedeemed,couponId:local.checkoutRequest?.offlineMemberCouponId,couponTemplateId:local.checkoutRequest?.offlineMemberCouponTemplateId},preciseRefund:!!local.cloudReceipt||local.items.every(i=>!!i.offlineItemId)}
 }
 const saved=await db.config.get(orderKey(id));if(saved)return {...saved.value.order,memberEffects:saved.value.quote?.memberEffects,refundBaseline:saved.value.quote,preciseRefund:true}
 const prefix=`offline.read:${encodeURIComponent(backend)}:${encodeURIComponent(storeId)}:${encodeURIComponent(auth.user!.id!)}:/orders:`
 for(const row of await db.config.where('key').startsWith(prefix).toArray()){const order=row.value?.data?.list?.find((o:any)=>o.id===id||o.orderNumber===id);if(order)return order}
 throw Error('OFFLINE_REFUND_ORDER_UNAVAILABLE')
}
export async function offlineRefundQuote(id:string){
 const order=await recordedOrder(id),ops=await offlineOperations(readBackendAuth().user!.storeId!),baseline=order.refundBaseline,included=new Set(baseline?.refundRequestIds||[])
 const decisions=ops.filter(o=>o.kind==='refund-settle'&&o.data.decision==='approve'&&o.data.localEvidence.orderNumber===order.orderNumber&&!included.has(o.data.requestId))
 if(!order.preciseRefund&&!baseline)return {data:{code:200,data:{orderId:id,finalAmount:order.finalAmount,refundedAmount:null,provisional:true,items:order.items.map((i:any)=>({itemId:i.id,name:i.productName,quantity:i.quantity,remaining:i.quantity,allocatedAmount:0,refundedQuantity:0}))}}}
 const total=order.totalAmount??order.subtotal,allocations=allocateRefundTotal({...order,totalAmount:total},order.finalAmount)
 const items=order.items.map((i:any)=>{const initial=baseline?.items.find((b:any)=>b.itemId===i.id),used=(initial?.refundedQuantity||0)+decisions.reduce((sum,o)=>sum+(o.data.localEvidence.selection.find((r:any)=>r.itemId===i.id)?.quantity||0),0);if(used>i.quantity)throw Error('REFUND_QUANTITY_EXCEEDED');return {itemId:i.id,name:i.productName,quantity:i.quantity,remaining:i.quantity-used,allocatedAmount:initial?.allocatedAmount??allocations.get(i.id),refundedQuantity:used}})
 return {data:{code:200,data:{orderId:id,finalAmount:order.finalAmount,refundedAmount:(baseline?.refundedAmount||0)+decisions.reduce((s,o)=>s+o.data.amount,0),provisional:false,items}}}
}
export async function queueRefund(data:any){
 const order=await recordedOrder(data.orderId),ops=await offlineOperations(readBackendAuth().user!.storeId!)
 if(!['customer_dissatisfied','paid_unprepared'].includes(data.reasonCode)||!data.reason?.trim())throw Error('REFUND_CLASSIFICATION_REQUIRED')
 const prior=ops.find(o=>o.kind==='refund'&&o.data.orderNumber===order.orderNumber&&!ops.some(d=>d.kind==='refund-settle'&&d.data.requestId===o.id))
 if(prior&&prior.id!==data.requestId)throw Error('REFUND_PENDING_REQUEST_EXISTS')
 const quote=(await offlineRefundQuote(data.orderId)).data.data
 if(data.reasonCode==='paid_unprepared'&&quote.refundedAmount)throw Error('UNPREPARED_FULL_REFUND_REQUIRED')
 const selected=data.items||order.items.filter((i:any)=>data.selectedItemIds?.includes(i.id)).map((i:any)=>({itemId:i.id,quantity:i.quantity}))
 const selection=canonicalSelection(selected).map(row=>{const line=order.items.find((i:any)=>i.id===row.itemId),remaining=quote.items.find((i:any)=>i.itemId===row.itemId)?.remaining;if(!line||row.quantity>remaining!)throw Error('INVALID_REFUND_ITEMS');return {...row,productId:line.productId,specId:line.specId,unitPrice:line.unitPrice,originalQuantity:line.quantity}})
 const result=await createOfflineRefund({requestId:data.requestId||crypto.randomUUID(),orderNumber:order.orderNumber,reason:data.reason.trim(),reasonCode:data.reasonCode,selection})
 return {data:{code:201,data:result,offline:true}}
}
export async function refundDecisionPayload(data:any){
 const auth=readBackendAuth(),storeId=auth.user!.storeId!,ops=await offlineOperations(storeId),request=ops.find(o=>o.kind==='refund'&&o.id===data.requestId)
 if(!request)throw Error('OFFLINE_REFUND_REQUEST_PENDING')
 const grant=(await db.config.get(`offline.authorization:${encodeURIComponent(localIdentity(storeId))}:${encodeURIComponent(storeId)}:${auth.user!.id}`))?.value
 if(!grant?.permissions?.includes('orders.refund')||!grant.permissions.includes('approvals.approve'))throw Error('STAFF_ACCESS_PERMISSION_DENIED')
 if(grant?.independentRefundApproval&&request.actorId===auth.user!.id)throw Error('STAFF_ACCESS_SELF_APPROVAL')
 if(data.decision==='reject')return {requestId:request.id,decision:'reject',amount:0,payoutMethod:'cash',verifiedPrepared:false,verifiedUnprepared:false,note:data.note||request.data.reason,localEvidence:{orderNumber:request.data.orderNumber}}
 const order=await recordedOrder(request.data.orderNumber),quote=(await offlineRefundQuote(request.data.orderNumber)).data.data
 if(quote.provisional)throw Error('REFUND_ALLOCATION_EVIDENCE_REQUIRED')
 if(request.data.reasonCode==='paid_unprepared'&&(auth.user?.role!=='admin'||quote.refundedAmount))throw Error('ADMIN_APPROVAL_REQUIRED')
 const selection=request.data.selection.map((r:any)=>{const line=quote.items.find((i:any)=>i.itemId===r.itemId);if(!line||r.quantity>line.remaining)throw Error('REFUND_QUANTITY_EXCEEDED');return {itemId:r.itemId,quantity:r.quantity,start:line.refundedQuantity,amount:unitRangeAmount(line.allocatedAmount!,line.quantity,line.refundedQuantity,r.quantity)}})
 const amount=selection.reduce((s:number,i:any)=>s+i.amount,0),allItems=quote.items.every((i:any)=>i.refundedQuantity+(selection.find((s:any)=>s.itemId===i.itemId)?.quantity||0)===i.quantity)
 if(amount<=0||!data.confirmed||!['cash','external'].includes(data.payoutMethod))throw Error('REFUND_PAYOUT_CONFIRMATION_REQUIRED')
 const allocation=(total:number)=>allocateRefundTotal({...order,totalAmount:order.totalAmount??order.subtotal},total),share=(total:number)=>{const parts=allocation(total);return selection.reduce((s:number,row:any)=>s+unitRangeAmount(parts.get(row.itemId)!,order.items.find((i:any)=>i.id===row.itemId).quantity,row.start,row.quantity),0)}
 const effects=order.memberEffects
 if(order.memberId&&!effects)throw Error('REFUND_ALLOCATION_EVIDENCE_REQUIRED')
 return {requestId:request.id,decision:'approve',amount,payoutMethod:data.payoutMethod,verifiedPrepared:request.data.reasonCode==='customer_dissatisfied',verifiedUnprepared:request.data.reasonCode==='paid_unprepared',note:data.note||request.data.reason,localEvidence:{orderNumber:order.orderNumber,originalPaymentMethod:order.paymentMethod,selection,allItems,memberId:order.memberId,pointsReturned:effects?share(effects.pointsRedeemed||0):0,pointsReversed:effects?share(effects.pointsEarned||0):0,couponId:allItems?effects?.couponId:undefined,couponTemplateId:allItems?effects?.couponTemplateId:undefined}}
}
export const settleOfflineRefund=(data:any)=>createOfflineRefundDecision(data)
