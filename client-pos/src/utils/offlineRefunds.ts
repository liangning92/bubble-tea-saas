import { db } from '../db/offline'
import { localIdentity } from './offlineSale'
import { readBackendAuth } from './backendIdentity'
import { createOfflineRefund } from './offlineOperations'

async function recordedOrder(id:string):Promise<any>{
 const auth=readBackendAuth(),storeId=auth.user?.storeId
 if(!storeId)throw Error('CHECKOUT_BACKEND_LOGIN_REQUIRED')
 const backend=localIdentity(storeId)
 const local=await db.orders.filter(o=>o.storeId===storeId&&o.backendUrl===backend&&(o.localId===id||o.serverId===id)).first()
 if(local){
  if(auth.user?.role==='cashier'&&local.staffId!==auth.user.staff?.id)throw Error('STAFF_ACCESS_PERMISSION_DENIED')
  return {...local,id:local.serverId||local.localId,items:local.cloudReceipt?.items||local.items.map((item:any,index:number)=>({...item,id:`${local.localId}:${index}`}))}
 }
 const prefix=`offline.read:${encodeURIComponent(backend)}:${encodeURIComponent(storeId)}:${encodeURIComponent(auth.user!.id!)}:/orders:`
 const caches=await db.config.where('key').startsWith(prefix).toArray()
 for(const row of caches){const order=row.value?.data?.list?.find((o:any)=>o.id===id);if(order)return order}
 throw Error('OFFLINE_REFUND_ORDER_UNAVAILABLE')
}
/** Quantity selection only: an offline request neither pays a refund nor restores stock. */
export async function offlineRefundQuote(id:string){
 const order=await recordedOrder(id)
 return {data:{code:200,data:{orderId:id,finalAmount:order.finalAmount,refundedAmount:null,provisional:true,items:order.items.map((item:any)=>({itemId:item.id,name:item.productName,quantity:item.quantity,remaining:item.quantity,allocatedAmount:0,refundedQuantity:0}))}}}
}
export async function queueRefund(data:any){
 const order=await recordedOrder(data.orderId)
 if(!['customer_dissatisfied','paid_unprepared'].includes(data.reasonCode)||!data.reason?.trim())throw Error('REFUND_CLASSIFICATION_REQUIRED')
 const selected=data.items||order.items.filter((item:any)=>data.selectedItemIds?.includes(item.id)).map((item:any)=>({itemId:item.id,quantity:item.quantity}))
 if(!selected.length)throw Error('INVALID_REFUND_ITEMS')
 const selection=selected.map((item:any)=>{
  const line=order.items.find((line:any)=>line.id===item.itemId)
  if(!line||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>line.quantity)throw Error('INVALID_REFUND_ITEMS')
  return {itemId:item.itemId,quantity:item.quantity,productId:line.productId,specId:line.specId,unitPrice:line.unitPrice,originalQuantity:line.quantity}
 })
 const result=await createOfflineRefund({requestId:data.requestId||crypto.randomUUID(),orderNumber:order.orderNumber,reason:data.reason.trim(),reasonCode:data.reasonCode,selection})
 return {data:{code:201,data:result,offline:true}}
}
