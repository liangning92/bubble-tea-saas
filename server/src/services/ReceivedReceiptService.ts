import { randomUUID, createHash } from 'crypto'
import prisma from '../config/database'
import { orderRequestFingerprint } from './OrderReplayService'

export const RECEIVED_RECEIPT_PREFIX = 'receipts.pos.'
export async function retainReceivedReceipt(storeId:string, actorId:string, receipt:Record<string, any>,staffName:string) {
  const key = RECEIVED_RECEIPT_PREFIX + receipt.orderNumber
  const fingerprint = createHash('sha256').update(JSON.stringify(receipt)).digest('hex')
  try { return await prisma.$transaction(async tx => {
    const id = randomUUID()
    const saved = await tx.config.upsert({where:{storeId_key:{storeId,key}},update:{},create:{id,storeId,key,category:'pos_receipt_pending',value:JSON.stringify({fingerprint,receipt,actorId,staffName,receivedAt:new Date().toISOString()})}})
    if (JSON.parse(saved.value).fingerprint !== fingerprint) throw new Error('RECEIVED_RECEIPT_CONFLICT')
    if (saved.id === id) await tx.pOSActionLog.create({data:{storeId,staffId:receipt.request.staffId,staffName,sessionId:'receipt:'+receipt.orderNumber,action:'received_receipt',entityId:receipt.orderNumber,description:`收银凭据已保存，待订单核对: ${receipt.orderNumber} · Rp ${receipt.grandTotal}`,metadata:JSON.stringify({orderNumber:receipt.orderNumber,totalAmount:receipt.grandTotal,paymentMethod:receipt.request.paymentMethod,occurredAt:receipt.occurredAt,outcome:'reported_local_sale_not_bank_confirmation'}),severity:'info'}})
    return {id:saved.id,orderNumber:receipt.orderNumber}
  }) } catch (error:any) {
    // A concurrent first upload can lose the unique-key race; its committed receipt is authoritative.
    if (error.code !== 'P2002') throw error
    const existing = await prisma.config.findUnique({where:{storeId_key:{storeId,key}}})
    if (!existing || JSON.parse(existing.value).fingerprint !== fingerprint) throw new Error('RECEIVED_RECEIPT_CONFLICT')
    return {id:existing.id,orderNumber:receipt.orderNumber}
  }
}
export async function listUnpostedReceipts(storeId:string) {
  const rows = await prisma.config.findMany({where:{storeId,category:'pos_receipt_pending',key:{startsWith:RECEIVED_RECEIPT_PREFIX}},orderBy:{createdAt:'desc'}})
  const receipts = rows.map(row=>({id:row.id,...JSON.parse(row.value).receipt,failureReason:JSON.parse(row.value).failureReason,staffName:JSON.parse(row.value).staffName,receivedAt:row.createdAt}))
  const posted = await prisma.order.findMany({where:{storeId,orderNumber:{in:receipts.map(r=>r.orderNumber)}},select:{orderNumber:true,requestFingerprint:true,finalAmount:true}})
  const orders = new Map(posted.map(row=>[row.orderNumber,row]))
  const matches = (receipt:any) => {const order=orders.get(receipt.orderNumber);return !!order && order.requestFingerprint===orderRequestFingerprint(receipt.request) && order.finalAmount===receipt.grandTotal}
  const resolvedIds = receipts.filter(matches).map(receipt=>receipt.id)
  if (resolvedIds.length) await prisma.config.updateMany({where:{storeId,category:'pos_receipt_pending',id:{in:resolvedIds}},data:{category:'pos_receipt_posted'}})
  return receipts.filter(receipt=>!matches(receipt)).map(({request,...receipt})=>({...receipt,paymentMethod:request.paymentMethod,staffId:request.staffId}))
}

export async function markReceivedReceiptFailure(storeId:string, orderNumber:string | undefined, reason:string) {
  if (!orderNumber) return
  const row = await prisma.config.findUnique({where:{storeId_key:{storeId,key:RECEIVED_RECEIPT_PREFIX+orderNumber}}})
  if (row) await prisma.config.update({where:{id:row.id},data:{value:JSON.stringify({...JSON.parse(row.value),failureReason:reason.slice(0,200),lastAttemptAt:new Date().toISOString()})}})
}
