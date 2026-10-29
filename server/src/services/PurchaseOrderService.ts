import { paymentFields, PaymentSource } from './ExpensePaymentService'
import { operationDate } from '../utils/operationDate'
import { parseBusinessDate } from '../utils/businessDate'
import {recalculateInventoryConsumers} from './InventoryQuantityService';
import {loadInventoryActors} from '../utils/inventoryActors';
import {alignInventoryBatches,receiptBatchDates} from './InventoryBatchService'
import prisma from '../config/database';

import { convertQuantity, validatePackage } from '../utils/inventoryUnits';
import { randomUUID, createHash } from 'crypto';
export interface PurchaseOrderFilter {
    storeId?: string;
    supplierId?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
}
export class PurchaseOrderError extends Error {
    constructor(message: string, public statusCode = 409) { super(message); }
}
const include = { supplier: { select: { id: true, name: true } }, items: true };
async function view(order: any, db: any = prisma, suppliedActors?: Awaited<ReturnType<typeof loadInventoryActors>>) {
    if (!order)
        return null;
    const inventory = await db.inventory.findMany({ where: { storeId: order.storeId, id: { in: order.items.map((i: any) => i.inventoryId) } }, select: { id: true, name: true, unit: true } });
    const actors = suppliedActors || await loadInventoryActors(db, order.storeId, [order.createdBy, order.receivedBy]);
    const refunded=!!(await db.expense.findFirst({where:{storeId:order.storeId,referenceType:'purchase_refund',referenceId:order.id},select:{id:true}}));
    const paymentExpense=await db.expense.findFirst({where:{storeId:order.storeId,referenceType:'purchase',referenceId:order.id},select:{id:true,paymentSource:true,cashSessionId:true,cashOccurredAt:true}});
    return { ...order, financeExpenseId:paymentExpense?.id||null,paymentSource:paymentExpense?.paymentSource||'unknown',cashSessionId:paymentExpense?.cashSessionId||null, refunded, createdByActor: actors.get(order.createdBy) || null, receivedByActor: actors.get(order.receivedBy) || null, items: order.items.map((i: any) => ({ ...i, lineAmount:i.lineAmount??Math.round((i.inputQuantity??i.quantity)*(i.inputUnitCost??i.unitCost)), inventory: inventory.find((m: any) => m.id === i.inventoryId) })) };
}
export async function getPurchaseOrders(filter: PurchaseOrderFilter) {
    const where: any = { storeId: filter.storeId };
    if (filter.supplierId)
        where.supplierId = filter.supplierId;
    if (filter.status === 'awaiting_receipt')
        where.status = { in: ['pending', 'approved', 'awaiting_receipt'] };
    else if (filter.status)
        where.status = filter.status;
    if (filter.startDate || filter.endDate)
        where.createdAt = { gte: filter.startDate, lte: filter.endDate };
    const orders = await prisma.purchaseOrder.findMany({ where, include, orderBy: { createdAt: 'desc' } });
    const byStore = new Map<string, Awaited<ReturnType<typeof loadInventoryActors>>>();
    for (const storeId of [...new Set(orders.map(o => o.storeId))]) byStore.set(storeId, await loadInventoryActors(prisma, storeId, orders.filter(o => o.storeId === storeId).flatMap(o => [o.createdBy, o.receivedBy])));
    return Promise.all(orders.map(o => view(o, prisma, byStore.get(o.storeId))));
}
export async function getPurchaseOrderById(orderId: string) { return view(await prisma.purchaseOrder.findUnique({ where: { id: orderId }, include })); }
export async function getPendingPurchaseOrders(storeId: string) { return getPurchaseOrders({ storeId, status: 'awaiting_receipt' }); }
export interface PurchaseInput {
 storeId:string; supplierId?:string; expectedDate?:Date; note?:string; source?:string;
 onlineOrderNumber?:string; createdBy?:string; requestId?:string;
 paymentSource?:PaymentSource; paidDate?:string; purchasedOn?:string;
 items:Array<{inventoryId:string;quantity:number;inputUnit?:string;unitCost?:number;paidAmount?:number}>;
}
async function prepareItems(tx:any,data:PurchaseInput){
 if(data.supplierId&&!await tx.supplier.findFirst({where:{id:data.supplierId,storeId:data.storeId,isActive:true}}))throw new PurchaseOrderError('SUPPLIER_STORE_MISMATCH',400);
 if(!data.items.length||new Set(data.items.map(i=>i.inventoryId)).size!==data.items.length)throw new PurchaseOrderError('DUPLICATE_PURCHASE_ITEMS',400);
 const items=[];let totalAmount=0;
 const paid=data.items.every(i=>i.paidAmount!==undefined);
 if(!paid&&data.items.some(i=>i.paidAmount!==undefined))throw new PurchaseOrderError('ALL_ITEMS_REQUIRE_PAID_AMOUNT',400);
 for(const item of data.items){
  const inv=await tx.inventory.findFirst({where:{id:item.inventoryId,storeId:data.storeId}});
  if(!inv)throw new PurchaseOrderError('INVENTORY_STORE_MISMATCH',400);
  if(inv.type==='semi_finished'&&inv.processRecipeId)throw new PurchaseOrderError('PROCESS_OUTPUT_IS_CONVERSION_ONLY',400);
  if(!Number.isFinite(item.quantity)||item.quantity<=0)throw new PurchaseOrderError('INVALID_QUANTITY',400);
  const saved=await tx.config.findUnique({where:{storeId_key:{storeId:data.storeId,key:`inventoryPackage:${inv.id}`}}});
  const pack=saved?validatePackage(JSON.parse(saved.value),inv.unit):null;
  const inputUnit=item.inputUnit||inv.unit;
  let quantity:number;try{quantity=convertQuantity(item.quantity,inputUnit,inv.unit,pack)}catch{throw new PurchaseOrderError('INCOMPATIBLE_INVENTORY_UNITS',400)}
  if(item.paidAmount===undefined&&(!Number.isFinite(item.unitCost)||item.unitCost!<0))throw new PurchaseOrderError('INVALID_PURCHASE_COST',400);
  const amount=item.paidAmount??Math.round(item.quantity*item.unitCost!);
  totalAmount+=amount;
  if(!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(amount/quantity)||!Number.isFinite(amount/item.quantity)||!Number.isSafeInteger(amount)||amount<0||!Number.isSafeInteger(totalAmount)||totalAmount>2147483647||(paid&&totalAmount>21474836))throw new PurchaseOrderError('INVALID_PURCHASE_AMOUNT',400);
  items.push({inventoryId:item.inventoryId,quantity,unitCost:amount/quantity,inputQuantity:item.quantity,inputUnit,inputUnitCost:paid?amount/item.quantity:item.unitCost!,lineAmount:amount,packageSnapshot:JSON.stringify(pack)});
 }
 return {items,totalAmount,paid};
}
async function audit(tx:any,order:any,actor:string,action:string,oldValue:any,newValue:any){
 await tx.financeAuditLog.create({data:{storeId:order.storeId,userId:actor,action,entityType:'purchase',entityId:order.id,description:action,oldValue:oldValue?JSON.stringify(oldValue):null,newValue:JSON.stringify(newValue)}});
}
async function syncExpense(tx:any,order:any,payment?:{paymentSource?:PaymentSource}){
 if(!order.paidAt)return;
 if(order.paidAt>new Date()||!Number.isFinite(order.paidAt.getTime()))throw new PurchaseOrderError('INVALID_PAYMENT_DATE',400);
 const materials=await tx.inventory.findMany({where:{storeId:order.storeId,id:{in:order.items.map((i:any)=>i.inventoryId)}},select:{id:true,name:true}});
 const description=order.items.map((i:any)=>`${materials.find((m:any)=>m.id===i.inventoryId)?.name||'Material'} · ${i.inputQuantity??i.quantity} ${i.inputUnit||''}`).join('; ');
 const value={amount:order.totalAmount*100,description,date:order.paidAt};
 const old=await tx.expense.findFirst({where:{storeId:order.storeId,referenceType:'purchase',referenceId:order.id}});
 if(old)await tx.expense.update({where:{id:old.id},data:value});
 else if(order.totalAmount>0)await tx.expense.create({data:{...value,...await paymentFields(tx,order.storeId,'online_payment',order.paidAt),storeId:order.storeId,type:'supplies',category:'supplies',referenceType:'purchase',referenceId:order.id}});
}
export async function createPurchaseOrder(data:PurchaseInput){
 const purchasedOn=operationDate(data.purchasedOn);
 const fingerprint=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 const replay=async(db:any)=>{if(!data.requestId)return null;const prior=await db.purchaseOrder.findUnique({where:{requestId:data.requestId},include});if(!prior)return null;if(prior.storeId!==data.storeId||prior.requestFingerprint!==fingerprint)throw new PurchaseOrderError('PURCHASE_IDEMPOTENCY_CONFLICT');return view(prior,db)};
 try{return await prisma.$transaction(async tx=>{
  const previous=await replay(tx);if(previous)return previous;
  const {items,totalAmount,paid}=await prepareItems(tx,data);
  const order=await tx.purchaseOrder.create({data:{purchasedOn,storeId:data.storeId,supplierId:data.supplierId||null,orderNumber:`PO-${randomUUID()}`,source:data.source||'admin',status:data.source==='online'?'awaiting_receipt':'pending',onlineOrderNumber:data.onlineOrderNumber,createdBy:data.createdBy,requestId:data.requestId,requestFingerprint:fingerprint,expectedDate:data.expectedDate,note:data.note,totalAmount,paidAt:paid?(data.paidDate?parseBusinessDate(data.paidDate):new Date()):null,items:{create:items}},include});
  await syncExpense(tx,order,data);await audit(tx,order,data.createdBy||'system','create',null,order);return view(order,tx);
 })}catch(e:any){if(e.code==='P2002'){const previous=await replay(prisma);if(previous)return previous}throw e}
}
export async function editPurchaseOrder(id:string,data:PurchaseInput,actor:string,expectedVersion:string,reason:string,ownerOnly=false){
 return prisma.$transaction(async tx=>{
  const old=await scopedOrder(tx,id,data.storeId);
  if(ownerOnly&&old.createdBy!==actor)throw new PurchaseOrderError('PURCHASE_OWNER_REQUIRED',403);
  if(!['pending','approved','awaiting_receipt'].includes(old.status))throw new PurchaseOrderError('REVERSE_RECEIPT_BEFORE_EDIT');
  if(!reason.trim())throw new PurchaseOrderError('CORRECTION_REASON_REQUIRED',400);
  const {items,totalAmount,paid}=await prepareItems(tx,data);
  const posted=await tx.expense.findFirst({where:{storeId:old.storeId,referenceType:'purchase',referenceId:id}});
  if(posted?.paymentSource==='drawer_cash'&&old.totalAmount!==totalAmount)throw new PurchaseOrderError('DRAWER_PAYMENT_AMOUNT_IMMUTABLE',400);
  if(old.paidAt&&!paid)throw new PurchaseOrderError('PAID_AMOUNT_REQUIRED',400);
  const changed=await tx.purchaseOrder.updateMany({where:{id,status:old.status,updatedAt:new Date(expectedVersion)},data:{...(data.purchasedOn?{purchasedOn:operationDate(data.purchasedOn)}:{}),supplierId:data.supplierId||null,expectedDate:data.expectedDate||null,note:data.note||'',onlineOrderNumber:data.onlineOrderNumber===undefined?old.onlineOrderNumber:data.onlineOrderNumber||null,totalAmount,paidAt:old.paidAt||(paid?new Date():null)}});
  if(changed.count!==1)throw new PurchaseOrderError('PURCHASE_CHANGED_REFRESH');
  await tx.purchaseOrderItem.deleteMany({where:{purchaseOrderId:id}});
  await tx.purchaseOrderItem.createMany({data:items.map(i=>({...i,purchaseOrderId:id}))});
  const order=await tx.purchaseOrder.findUniqueOrThrow({where:{id},include});
  await syncExpense(tx,order,data);await audit(tx,order,actor,'update',old,{...order,reason});return view(order,tx);
 });
}
// Confirm a historical payment without rewriting purchase items or touching inventory.
export async function confirmPurchasePayment(id:string,storeId:string|undefined,actor:string,expectedVersion:string,paidAt:Date,reason:string,paymentSource:PaymentSource='unknown'){
 return prisma.$transaction(async tx=>{
  const old=await scopedOrder(tx,id,storeId);
  if(old.status==='cancelled')throw new PurchaseOrderError('CANCELLED_PURCHASE_PAYMENT',400);
  if(old.paidAt)throw new PurchaseOrderError('PURCHASE_ALREADY_PAID');
  if(!reason.trim())throw new PurchaseOrderError('CORRECTION_REASON_REQUIRED',400);
  if(!Number.isFinite(paidAt.getTime())||paidAt.getTime()>Date.now())throw new PurchaseOrderError('INVALID_PAYMENT_DATE',400);
  if(!Number.isSafeInteger(old.totalAmount)||old.totalAmount<0||old.totalAmount>21474836)throw new PurchaseOrderError('INVALID_PURCHASE_AMOUNT',400);
  const changed=await tx.purchaseOrder.updateMany({where:{id,paidAt:null,status:old.status,updatedAt:new Date(expectedVersion)},data:{paidAt}});
  if(changed.count!==1)throw new PurchaseOrderError('PURCHASE_CHANGED_REFRESH');
  const order=await tx.purchaseOrder.findUniqueOrThrow({where:{id},include});
  await syncExpense(tx,order,{paymentSource});await audit(tx,order,actor,'confirm_payment',old,{...order,reason});return view(order,tx);
 });
}
async function scopedOrder(tx: any, orderId: string, storeId?: string) {
    const order = await tx.purchaseOrder.findFirst({ where: { id: orderId, ...(storeId !== undefined ? { storeId } : {}) }, include: { items: { orderBy: { inventoryId: 'asc' } } } });
    if (!order)
        throw new PurchaseOrderError('Purchase order not found', 404);
    return order;
}
export async function updatePurchaseOrderStatus(orderId: string, status: string, storeId?: string) {
    if (status !== 'approved')
        throw new PurchaseOrderError('Use receive or cancel to finish a purchase order', 400);
    return prisma.$transaction(async (tx) => { const order = await scopedOrder(tx, orderId, storeId); const changed = await tx.purchaseOrder.updateMany({ where: { id: order.id, status: 'pending' }, data: { status: 'approved' } }); if (!changed.count)
        throw new PurchaseOrderError('Only pending orders can be approved'); return tx.purchaseOrder.findUnique({ where: { id: order.id } }); });
}
export async function receivePurchaseOrder(orderId: string, staffId: string, storeId?: string, datesByItem:Array<{itemId:string;manufacturingDate?:string;expiryDate?:string}>=[], occurredOnInput?:string) {
    const occurredOn=operationDate(occurredOnInput);
    return prisma.$transaction(async (tx) => {
        const order = await scopedOrder(tx, orderId, storeId);
        if (order.status === 'received')
            return order;
        const claimed = await tx.purchaseOrder.updateMany({ where: { id: order.id, status: { in: ['pending', 'approved', 'awaiting_receipt'] } }, data: { status: 'received', receivedDate: new Date(), receivedBy: staffId } });
        if (!claimed.count)
            throw new PurchaseOrderError('Purchase order is already received or cancelled');
        if(datesByItem.some(row=>!order.items.some((item:any)=>item.id===row.itemId))||new Set(datesByItem.map(row=>row.itemId)).size!==datesByItem.length)throw new PurchaseOrderError('INVALID_RECEIPT_ITEMS',400)
        for (const item of order.items) {
            const inventory = await tx.inventory.findFirst({ where: { id: item.inventoryId, storeId: order.storeId } });
            if (!inventory)
                throw new PurchaseOrderError('Inventory does not belong to this store', 400);
            if(inventory.type==='semi_finished'&&inventory.processRecipeId)throw new PurchaseOrderError('PROCESS_OUTPUT_IS_CONVERSION_ONLY',400);
            const metadata=datesByItem.find(row=>row.itemId===item.id)
            const dates=receiptBatchDates(metadata?.manufacturingDate,metadata?.expiryDate)
            await alignInventoryBatches(tx,inventory)
            const quantity = item.quantity;
            if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(item.unitCost) || item.unitCost < 0)
                throw new PurchaseOrderError('Invalid purchase quantity or cost', 400);
            const totalAmount = item.lineAmount ?? (item.inputQuantity !== null && item.inputUnitCost !== null ? Math.round(item.inputQuantity * item.inputUnitCost) : Math.round(quantity * item.unitCost));
            const receiptUnitCost=totalAmount/quantity;
            const newStock = inventory.currentStock + quantity;
            const newAvgCost = (Math.max(0, inventory.currentStock) * Number(inventory.avgCost) + totalAmount) / (Math.max(0, inventory.currentStock) + quantity);
            if (!Number.isFinite(newStock) || !Number.isFinite(newAvgCost) || newAvgCost < 0 || newAvgCost > 2147483647)
                throw new PurchaseOrderError('Invalid inventory balance', 400);
            const changed = await tx.inventory.updateMany({ where: { id: inventory.id, storeId: order.storeId, currentStock: inventory.currentStock, avgCost: inventory.avgCost }, data: { currentStock: { increment: quantity }, avgCost: newAvgCost } });
            if (!changed.count)
                throw new PurchaseOrderError('Inventory changed during receiving; retry this order');
            await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { receivedQty: quantity, unitCost:receiptUnitCost } });
            const batch = await tx.batch.create({ data: { inventoryId: item.inventoryId, batchNumber: `PO-${order.id}-${item.id}-${randomUUID()}`, quantity, unitCost: receiptUnitCost, status: 'active',...dates } });
            await tx.stockInLog.create({ data: { occurredOn, inventoryId: item.inventoryId, purchaseOrderId: order.id, batchId: batch.id, quantity, unitCost: receiptUnitCost, totalAmount, supplierId: order.supplierId, staffId, note: JSON.stringify({ version: 1, kind: 'receipt', purchaseOrderId: order.id, orderNumber: order.orderNumber, ledgerUnit: inventory.unit, ledgerQuantity: quantity, inputQuantity: item.inputQuantity ?? quantity, inputUnit: item.inputUnit ?? inventory.unit, inputUnitCost: item.inputUnitCost ?? item.unitCost }) } });
        }
        await recalculateInventoryConsumers(tx,order.items.map((i:any)=>i.inventoryId));
        return tx.purchaseOrder.findUnique({ where: { id: order.id }, include });
    });
}
export async function cancelPurchaseOrder(orderId: string, reason: string, storeId?: string) { return prisma.$transaction(async (tx) => { const order = await scopedOrder(tx, orderId, storeId); const changed = await tx.purchaseOrder.updateMany({ where: { id: order.id, status: { in: ['pending', 'approved', 'awaiting_receipt'] } }, data: { status: 'cancelled', note: reason } }); if (!changed.count)
    throw new PurchaseOrderError('Received or cancelled orders cannot be cancelled'); return tx.purchaseOrder.findUnique({ where: { id: order.id } }); }); }

/** Reverse only intact receipts; preserve the original receipt logs and actual payment. */
export async function reversePurchaseReceipt(id:string,storeId:string,actor:string,reason:string){
 return prisma.$transaction(async tx=>{
  const order=await scopedOrder(tx,id,storeId);if(order.status!=='received')throw new PurchaseOrderError('PURCHASE_NOT_RECEIVED');
  const claimed=await tx.purchaseOrder.updateMany({where:{id,status:'received',updatedAt:order.updatedAt},data:{status:'awaiting_receipt',receivedDate:null}});if(claimed.count!==1)throw new PurchaseOrderError('PURCHASE_CHANGED_REFRESH');
  for(const item of order.items){
   const inv=await tx.inventory.findFirstOrThrow({where:{id:item.inventoryId,storeId}});
   await alignInventoryBatches(tx,inv);
   const batches=await tx.batch.findMany({where:{inventoryId:inv.id,batchNumber:{startsWith:`PO-${id}-${item.id}`},status:'active'}});
   const available=batches.reduce((n,b)=>n+b.quantity,0);
   if(Math.abs(available-item.quantity)>1e-7||inv.currentStock<item.quantity)throw new PurchaseOrderError('RECEIPT_ALREADY_CONSUMED_USE_INVENTORY_ADJUSTMENT');
   const nextStock=inv.currentStock-item.quantity,amount=item.lineAmount??Math.round((item.inputQuantity??item.quantity)*(item.inputUnitCost??item.unitCost));
   const nextValue=inv.currentStock*Number(inv.avgCost)-amount;
   if(nextStock>1e-7&&nextValue< -0.01)throw new PurchaseOrderError('RECEIPT_REVALUATION_REQUIRES_REVIEW');
   const updated=await tx.inventory.updateMany({where:{id:inv.id,currentStock:inv.currentStock,avgCost:inv.avgCost},data:{currentStock:nextStock,avgCost:nextStock>1e-7?Math.max(0,nextValue/nextStock):0}});if(updated.count!==1)throw new PurchaseOrderError('INVENTORY_CHANGED_RETRY');
   await tx.batch.updateMany({where:{id:{in:batches.map(b=>b.id)}},data:{quantity:0,status:'used'}});
   await tx.stockOutLog.create({data:{inventoryId:inv.id,quantity:item.quantity,reason:'adjust',staffId:actor,note:JSON.stringify({kind:'purchase-receipt-reversal',purchaseOrderId:id,reason})}});
   await tx.purchaseOrderItem.update({where:{id:item.id},data:{receivedQty:0}});
  }
  await recalculateInventoryConsumers(tx,order.items.map(i=>i.inventoryId));await audit(tx,order,actor,'update',order,{status:'awaiting_receipt',reason});return view(await tx.purchaseOrder.findUniqueOrThrow({where:{id},include}),tx);
 });
}
export async function refundPurchasePayment(id:string,storeId:string,actor:string,reason:string){
 return prisma.$transaction(async tx=>{
  const order=await scopedOrder(tx,id,storeId);if(order.status!=='cancelled'||!order.paidAt)throw new PurchaseOrderError('CANCEL_PURCHASE_BEFORE_REFUND');
  const claimed=await tx.purchaseOrder.updateMany({where:{id,updatedAt:order.updatedAt,status:'cancelled'},data:{updatedAt:new Date()}});if(claimed.count!==1)throw new PurchaseOrderError('PURCHASE_CHANGED_REFRESH');
  if(await tx.expense.findFirst({where:{storeId,referenceType:'purchase_refund',referenceId:id}}))throw new PurchaseOrderError('PURCHASE_ALREADY_REFUNDED');
  const materials=await tx.inventory.findMany({where:{id:{in:order.items.map(i=>i.inventoryId)},storeId},select:{name:true}});
  await tx.expense.create({data:{storeId,paymentSource:'online_payment',type:'supplies',category:'supplies',amount:-order.totalAmount*100,description:`Refund · ${materials.map(i=>i.name).join(' · ')}: ${reason}`,referenceType:'purchase_refund',referenceId:id}});
  await audit(tx,order,actor,'update',null,{refundAmount:order.totalAmount,reason});return {refunded:true};
 });
}
