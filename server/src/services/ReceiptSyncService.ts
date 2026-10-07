import { Prisma, PrismaClient } from '@prisma/client'
import { createHash, randomUUID } from 'crypto'
import { z } from 'zod'
import { canonical } from '../utils/orderSnapshot'
import { paymentImageType } from './PaymentEvidenceService'

export const RECEIPT_SYNC_PREFIX = 'receiptSync.'
export const replicaKey = (id:string) => `${RECEIPT_SYNC_PREFIX}replica:${id}`
const money=z.number().int().min(0).max(1000000000)
const id=z.string().min(1).max(128)
const nullable=id.nullable()
const time=z.string().datetime()
const line=z.object({id,productId:id,specId:id,productName:z.string().max(500),specName:z.string().max(500),quantity:z.number().int().positive().max(10000),unitPrice:money,addons:z.string().max(10000),bomCost:money,createdAt:time}).strict()
const proof=z.object({id,storeId:id,orderId:id,amount:money,uploadedBy:id,confirmedBy:id,createdAt:time,confirmedAt:time,verification:z.literal('staff_confirmed'),sha256:z.string().regex(/^[a-f0-9]{64}$/),mimeType:z.enum(['image/png','image/jpeg','image/webp']),image:z.string().max(7*1024*1024)}).strict()
export const receiptEnvelope=z.object({version:z.literal(1),sourceId:z.string().uuid(),tenantId:id,order:z.object({
 id,storeId:id,staffId:id,memberId:nullable,channelId:nullable,orderNumber:id,pickupNumber:nullable,
 totalAmount:money,discountAmount:money,finalAmount:money,checkoutTaxAmount:money.nullable(),requestFingerprint:z.string().regex(/^v1:[a-f0-9]{64}$/).nullable(),
 paymentMethod:z.string().min(1).max(30),status:z.enum(['completed','paid','refunded','cancelled']),customerCount:z.number().int().min(1).max(10000),
 taxCategory:z.string().max(100).nullable(),platformOrderId:nullable,tableNumber:z.string().max(100).nullable(),callerPhone:z.string().max(100).nullable(),driverPickupTime:time.nullable(),purchaseOrderNo:nullable,socialRef:z.string().max(500).nullable(),note:z.string().max(10000).nullable(),createdAt:time,updatedAt:time,items:z.array(line).min(1).max(200)
}).strict(),evidence:proof.nullable()}).strict()
type ParsedReceipt=z.infer<typeof receiptEnvelope>
// Project disables strictNullChecks; Zod infers optional keys although parse requires them.
export type ReceiptEnvelope={version:1;sourceId:string;tenantId:string;order:Required<Omit<ParsedReceipt['order'],'items'>>&{items:Array<Required<z.infer<typeof line>>>};evidence:Required<z.infer<typeof proof>>|null}
type LoadedOrder=Prisma.OrderGetPayload<{include:{items:true,paymentEvidence:true}}>
const date=(value:Date|null)=>value?.toISOString()??null
export function receiptFor(sourceId:string,tenantId:string,order:LoadedOrder):ReceiptEnvelope {
 const evidence=order.paymentEvidence
 return receiptEnvelope.parse({version:1,sourceId,tenantId,order:{
  id:order.id,storeId:order.storeId,staffId:order.staffId,memberId:order.memberId,channelId:order.channelId,orderNumber:order.orderNumber,pickupNumber:order.pickupNumber,
  totalAmount:order.totalAmount,discountAmount:order.discountAmount,finalAmount:order.finalAmount,checkoutTaxAmount:order.checkoutTaxAmount,requestFingerprint:order.requestFingerprint,
  paymentMethod:order.paymentMethod,status:order.status,customerCount:order.customerCount,taxCategory:order.taxCategory,platformOrderId:order.platformOrderId,tableNumber:order.tableNumber,callerPhone:order.callerPhone,driverPickupTime:date(order.driverPickupTime),purchaseOrderNo:order.purchaseOrderNo,socialRef:order.socialRef,note:order.note,createdAt:date(order.createdAt),updatedAt:date(order.updatedAt),
  items:order.items.map(i=>({id:i.id,productId:i.productId,specId:i.specId,productName:i.productName,specName:i.specName,quantity:i.quantity,unitPrice:i.unitPrice,addons:i.addons,bomCost:i.bomCost,createdAt:date(i.createdAt)})).sort((a,b)=>a.id.localeCompare(b.id))
 },evidence:evidence?{...evidence,createdAt:date(evidence.createdAt),confirmedAt:date(evidence.confirmedAt),image:evidence.image.toString('base64')}:null}) as ReceiptEnvelope
}
const hash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex')
export const receiptDigest=(receipt:ReceiptEnvelope)=>hash(receipt)
function immutableDigest(receipt:ReceiptEnvelope){const {status,updatedAt,...order}=receipt.order;return hash({...receipt,order:{...order,items:[...order.items].sort((a,b)=>a.id.localeCompare(b.id))}})}
function conflict():never{throw new Error('RECEIPT_SYNC_CONFLICT')}

export async function receiveReceipt(db:PrismaClient,input:unknown,storeId:string,actorId:string){
 const receipt=receiptEnvelope.parse(input) as ReceiptEnvelope;const o=receipt.order;const digest=receiptDigest(receipt)
 if(!storeId||o.storeId!==storeId||receipt.evidence?.storeId&&receipt.evidence.storeId!==storeId)throw new Error('RECEIPT_STORE_MISMATCH')
 let image:Buffer|undefined
 if(receipt.evidence){
  const p=receipt.evidence;image=Buffer.from(p.image,'base64')
  if(image.toString('base64')!==p.image||paymentImageType(image)!==p.mimeType||createHash('sha256').update(image).digest('hex')!==p.sha256||p.orderId!==o.id||p.amount!==o.finalAmount||p.uploadedBy!==p.confirmedBy||new Date(p.confirmedAt)<new Date(p.createdAt))throw new Error('INVALID_RECEIPT_EVIDENCE')
 }
 return db.$transaction(async tx=>{
  const store=await tx.store.findUnique({where:{id:storeId},select:{tenantId:true}})
  if(!store||store.tenantId!==receipt.tenantId)throw new Error('RECEIPT_STORE_MISMATCH')
  const existing=await tx.order.findUnique({where:{id:o.id},include:{items:true,paymentEvidence:true}})
  const record=await tx.config.findUnique({where:{storeId_key:{storeId,key:replicaKey(o.id)}}})
  const immutable=immutableDigest(receipt)
  if(existing||record){
   if(!existing||!record||existing.storeId!==storeId)conflict()
   const marker=JSON.parse(record.value)
   if(marker.sourceId!==receipt.sourceId||marker.immutable!==immutable||immutableDigest(receiptFor(receipt.sourceId,receipt.tenantId,existing))!==immutable||existing.status!==marker.status)conflict()
   if(o.updatedAt===marker.sourceUpdatedAt&&o.status!==marker.status)conflict()
   if(o.updatedAt<=marker.sourceUpdatedAt)return {digest,orderId:o.id,replayed:true}
   if(o.status!==marker.status&&!(['paid','completed'].includes(marker.status)&&['completed','refunded','cancelled'].includes(o.status)))conflict()
   const changed=await tx.order.updateMany({where:{id:o.id,storeId,status:existing.status,updatedAt:existing.updatedAt},data:{status:o.status,updatedAt:new Date(o.updatedAt)}})
   if(changed.count!==1)conflict()
  }else{
   const productIds=[...new Set(o.items.map(i=>i.productId))]
   if(await tx.product.count({where:{id:{in:productIds},storeId}})!==productIds.length)throw new Error('RECEIPT_REFERENCES_MISSING')
   for(const item of o.items)if(!await tx.spec.findFirst({where:{id:item.specId,productId:item.productId}}))throw new Error('RECEIPT_REFERENCES_MISSING')
   if(o.memberId&&!await tx.member.findFirst({where:{id:o.memberId,storeId}}))throw new Error('RECEIPT_REFERENCES_MISSING')
   if(o.channelId&&!await tx.channel.findFirst({where:{id:o.channelId,storeId}}))throw new Error('RECEIPT_REFERENCES_MISSING')
   const {items,createdAt,updatedAt,driverPickupTime,...fields}=o
   await tx.order.create({data:{...fields,createdAt:new Date(createdAt),updatedAt:new Date(updatedAt),driverPickupTime:driverPickupTime?new Date(driverPickupTime):null,items:{create:items.map(i=>({...i,createdAt:new Date(i.createdAt)}))}}})
   if(receipt.evidence){const {image:encoded,createdAt,confirmedAt,...fields}=receipt.evidence;await tx.paymentEvidence.create({data:{...fields,image:image!,createdAt:new Date(createdAt),confirmedAt:new Date(confirmedAt)}})}
  }
  const value=JSON.stringify({version:1,sourceId:receipt.sourceId,immutable,status:o.status,sourceUpdatedAt:o.updatedAt,receivedBy:actorId})
  await tx.config.upsert({where:{storeId_key:{storeId,key:replicaKey(o.id)}},create:{storeId,key:replicaKey(o.id),value,category:'store'},update:{value}})
  return {digest,orderId:o.id,replayed:false}
 })
}
/** Existing receipt + protected acknowledgement = durable outbox; credentials never persisted. */
export async function sendReceipts(db:PrismaClient,storeId:string,cloudToken:string,cloudApi:string,cursor?:string){
 const store=await db.store.findUniqueOrThrow({where:{id:storeId}})
 const source=await db.config.upsert({where:{storeId_key:{storeId,key:RECEIPT_SYNC_PREFIX+'source'}},create:{storeId,key:RECEIPT_SYNC_PREFIX+'source',value:JSON.stringify(randomUUID()),category:'store'},update:{}})
 const sourceId=JSON.parse(source.value) as string
 const orders=await db.order.findMany({where:{storeId,status:{in:['paid','completed','refunded','cancelled']},...(cursor?{id:{gt:cursor}}:{})},orderBy:{id:'asc'},take:10,select:{id:true}})
 const results:Array<{id:string;status:'synced'|'unchanged'|'failed'|'replica';error?:string}>=[]
 for(const item of orders){
  try{
   if(await db.config.findUnique({where:{storeId_key:{storeId,key:replicaKey(item.id)}}})){results.push({id:item.id,status:'replica'});continue}
   const order=await db.order.findUniqueOrThrow({where:{id:item.id},include:{items:true,paymentEvidence:true}})
   if(order.storeId!==storeId)throw new Error('RECEIPT_STORE_MISMATCH')
   const receipt=receiptFor(sourceId,store.tenantId,order);const digest=receiptDigest(receipt)
   const key=RECEIPT_SYNC_PREFIX+'ack:'+item.id
   const ack=await db.config.findUnique({where:{storeId_key:{storeId,key}}})
   if(ack&&JSON.parse(ack.value).digest===digest){results.push({id:item.id,status:'unchanged'});continue}
   const response=await fetch(`${cloudApi}/api/sync/receipts`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${cloudToken}`},body:JSON.stringify(receipt),signal:AbortSignal.timeout(20000)})
   if(!response.ok)throw new Error(`REMOTE_HTTP_${response.status}`)
   const body=await response.json() as {data?:{digest?:string;orderId?:string}}
   if(body.data?.digest!==digest||body.data?.orderId!==item.id)throw new Error('RECEIPT_ACK_MISMATCH')
   const value=JSON.stringify({digest,syncedAt:new Date().toISOString()})
   await db.config.upsert({where:{storeId_key:{storeId,key}},create:{storeId,key,value,category:'store'},update:{value}})
   results.push({id:item.id,status:'synced'})
  }catch(error){results.push({id:item.id,status:'failed',error:error instanceof Error&&/^(REMOTE_HTTP_\d+|RECEIPT_[A-Z_]+)$/.test(error.message)?error.message:'RECEIPT_SEND_FAILED'})}
 }
 return {results,nextCursor:orders.length===10?orders[orders.length-1].id:null}
}
