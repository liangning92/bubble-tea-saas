import {declareAccessRoutes} from '../src/middlewares/staffAccessV2'
import {beforeAll,afterAll,test,expect} from '@jest/globals'
import {randomUUID} from 'crypto'
import express from 'express'
import http from 'http'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../src/config/database'
import {upgradeLocalSqlite} from '../src/utils/sqliteUpgrade'
import {upgradeInventoryFlow} from '../src/utils/inventoryFlowUpgrade'
import {pgLedgerDDL,assertLedgerInstalled} from '../src/utils/inventoryLedger'
import {createPurchaseOrder,receivePurchaseOrder,getPurchaseOrderById} from '../src/services/PurchaseOrderService'
import {stockOut,stockIn,updateInventory} from '../src/services/InventoryService'
import {updateCountItems,createInventoryCount,updateCountItem,submitInventoryCount,completeInventoryCount} from '../src/services/InventoryCountService'
import {createOrder,refundOrder,deductInventory} from '../src/services/OrderService'
import {ensureInventoryFlow,FLOW_CUTOVER_KEY,reverseOrderConsumption} from '../src/services/OrderConsumptionService'
import {employeeConsumption,checkConsumptionDay,getConsumptionAlerts,classifyEmployeeConsumption,checkClosedConsumptionDays} from '../src/services/EmployeeConsumptionService'
import {saveInventoryAlertConfig} from '../src/services/InventoryAlertConfigService'
import {receiptFor,receiveReceipt} from '../src/services/ReceiptSyncService'
import {inventoryRouter} from '../src/routes/inventory'
import {purchaseOrderRouter} from '../src/routes/purchaseOrder'
import {inventoryCountRouter} from '../src/routes/inventoryCount'
import {config} from '../src/config/env'

beforeAll(async()=>{
 if(process.env.DATABASE_URL!.startsWith('file:'))await upgradeLocalSqlite(prisma,process.env.DATABASE_URL!)
 else {try{await assertLedgerInstalled(prisma,false)}catch{for(const sql of pgLedgerDDL)await prisma.$executeRawUnsafe(sql)}}
 await upgradeInventoryFlow(prisma,process.env.DATABASE_URL!)
})
afterAll(async()=>{if(httpServer?.listening)await new Promise<void>(resolve=>httpServer.close(()=>resolve()));await prisma.$disconnect()})
async function fixture(){
 const tenant=await prisma.tenant.create({data:{name:'Synthetic inventory flow'}}),store=await prisma.store.create({data:{tenantId:tenant.id,name:'Synthetic inventory flow'}})
 const inventory=await prisma.inventory.create({data:{storeId:store.id,name:'Tea',category:'tea',unit:'kg',currentStock:100,avgCost:10000}})
 const category=await prisma.category.create({data:{storeId:store.id,name:'Tea'}}),product=await prisma.product.create({data:{storeId:store.id,categoryId:category.id,name:'Tea drink',code:randomUUID()}}),spec=await prisma.spec.create({data:{productId:product.id,name:'Regular',price:20000}})
 await prisma.bOMItem.create({data:{productId:product.id,inventoryId:inventory.id,quantity:25,unit:'g'}})
 const sale={storeId:store.id,staffId:'synthetic',orderNumber:randomUUID(),paymentMethod:'cash',taxEnabled:false,items:[{productId:product.id,productName:product.name,specId:spec.id,specName:spec.name,quantity:1,unitPrice:20000}]}
 return {tenant,store,inventory,product,spec,sale}
}
async function cutoff(storeId:string,date='2026-10-01T00:00:00+07:00'){await ensureInventoryFlow(storeId);await prisma.config.update({where:{storeId_key:{storeId,key:FLOW_CUTOVER_KEY}},data:{value:new Date(date).toISOString()}})}
const balance=async(id:string)=>(await prisma.inventory.findUniqueOrThrow({where:{id}})).currentStock

test('supplier optional, packaging is frozen, register does not receive, receipt retries apply once',async()=>{
 const f=await fixture();await updateInventory(f.inventory.id,{packaging:{unit:'bag',quantity:2,baseUnit:'kg'}})
 const input={storeId:f.store.id,source:'online',createdBy:'employee',requestId:randomUUID(),items:[{inventoryId:f.inventory.id,quantity:2,unitCost:20000,inputUnit:'bag'}]}
 const order=await createPurchaseOrder(input)
 expect(order.supplierId).toBeNull();expect(order.status).toBe('awaiting_receipt');expect(order.items[0].quantity).toBe(4);expect(order.totalAmount).toBe(40000);expect(await balance(f.inventory.id)).toBe(100)
 expect((await createPurchaseOrder(input)).id).toBe(order.id)
 await expect(createPurchaseOrder({...input,note:'different'})).rejects.toThrow('IDEMPOTENCY')
 await updateInventory(f.inventory.id,{packaging:{unit:'bag',quantity:5,baseUnit:'kg'}})
 await receivePurchaseOrder(order.id,'receiver',f.store.id);await receivePurchaseOrder(order.id,'receiver',f.store.id)
 expect(await balance(f.inventory.id)).toBe(104)
 const logs=await prisma.stockInLog.findMany({where:{purchaseOrderId:order.id}});expect(logs).toHaveLength(1);expect(logs[0].staffId).toBe('receiver');expect(logs[0].totalAmount).toBe(40000)
 expect((await getPurchaseOrderById(order.id)).receivedBy).toBe('receiver')
 const other=await fixture();await expect(receivePurchaseOrder(order.id,'staff',other.store.id)).rejects.toThrow('not found')
})
test('physical stock out validates purpose, store and balance; retry and concurrent requests do not double deduct',async()=>{
 const f=await fixture(),operationId=randomUUID(),input={storeId:f.store.id,inventoryId:f.inventory.id,quantity:2,reason:'withdrawal',operationId,staffId:'employee'}
 const result=await Promise.allSettled([stockOut(input),stockOut(input)]);expect(result.some(r=>r.status==='fulfilled')).toBe(true)
 await stockOut(input);expect(await balance(f.inventory.id)).toBe(98);expect(await prisma.stockOutLog.count({where:{operationId}})).toBe(1)
 await expect(stockOut({...input,quantity:3})).rejects.toThrow('IDEMPOTENCY')
 await expect(stockOut({...input,operationId:randomUUID(),reason:'other'})).rejects.toThrow('OUT_REASON_REQUIRED')
 await expect(stockOut({...input,operationId:randomUUID(),quantity:1000})).rejects.toThrow('Insufficient stock')
 const other=await fixture();await expect(stockOut({...input,operationId:randomUUID(),storeId:other.store.id})).rejects.toThrow('not found')
 const receipt={storeId:f.store.id,inventoryId:f.inventory.id,quantity:2,reason:'purchase',unitCost:10000,operationId:randomUUID(),staffId:'employee'}
 await stockIn(receipt);await stockIn(receipt);expect(await balance(f.inventory.id)).toBe(100)
})
test('sale freezes recipe consumption without deducting stock; unprepared refund reverses theory only',async()=>{
 const f=await fixture();await cutoff(f.store.id)
 const sale=await createOrder(f.sale);expect(await balance(f.inventory.id)).toBe(100);expect(await prisma.stockOutLog.count({where:{orderId:sale.id}})).toBe(0)
 const snapshot=await prisma.orderConsumptionSnapshot.findUniqueOrThrow({where:{orderId:sale.id}});expect(JSON.parse(snapshot.materials)[0].quantity).toBe(0.025)
 await prisma.bOMItem.updateMany({where:{productId:f.product.id},data:{quantity:500}})
 expect(JSON.parse((await prisma.orderConsumptionSnapshot.findUniqueOrThrow({where:{orderId:sale.id}})).materials)[0].quantity).toBe(0.025)
 const refund=await prisma.refundRequest.create({data:{orderId:sale.id,reason:'unprepared',reasonCode:'paid_unprepared',requestedBy:'employee'}})
 await refundOrder(sale.id,'verified',undefined,undefined,{requestId:refund.id,approvedBy:'admin',restoreUnprepared:true})
 expect(await balance(f.inventory.id)).toBe(100);expect((await prisma.orderConsumptionSnapshot.findUniqueOrThrow({where:{orderId:sale.id}})).reversedAt).not.toBeNull()
})
test('prepared refunds preserve consumption; suspended sales do not record consumption; cancellation reverses theory',async()=>{
 const f=await fixture();const sale=await createOrder(f.sale);await refundOrder(sale.id,'prepared')
 expect((await prisma.orderConsumptionSnapshot.findUniqueOrThrow({where:{orderId:sale.id}})).reversedAt).toBeNull()
 const held=await createOrder({...f.sale,orderNumber:randomUUID(),status:'suspended'});expect(await prisma.orderConsumptionSnapshot.count({where:{orderId:held.id}})).toBe(0)
 const normal=await createOrder({...f.sale,orderNumber:randomUUID()});await prisma.$transaction(async tx=>{await tx.order.update({where:{id:normal.id},data:{status:'cancelled'}});await reverseOrderConsumption(tx,normal.id)});expect((await prisma.orderConsumptionSnapshot.findUniqueOrThrow({where:{orderId:normal.id}})).reversedAt).not.toBeNull()
})
test('employee count selection, submit freeze, manager approval and subsequent stock movement are safe',async()=>{
 const f=await fixture(),other=await fixture(),data={storeId:f.store.id,period:'ad_hoc' as const,startDate:new Date(),endDate:new Date(),inventoryIds:[f.inventory.id]}
 await expect(createInventoryCount({...data,inventoryIds:[other.inventory.id]})).rejects.toThrow('INVALID_COUNT_SELECTION')
 const count=await createInventoryCount(data)
 await expect(submitInventoryCount(count.id,f.store.id)).rejects.toThrow('COUNT_INCOMPLETE')
 await updateCountItem(count.items[0].id,99,'employee','',{countId:count.id,storeId:f.store.id,expectedStock:100,observedVersion:f.inventory.updatedAt.toISOString()})
 expect(await balance(f.inventory.id)).toBe(100)
 await expect(completeInventoryCount(count.id,'manager',f.store.id)).rejects.toThrow('COUNT_SUBMIT_REQUIRED')
 await submitInventoryCount(count.id,f.store.id);await submitInventoryCount(count.id,f.store.id)
 await expect(createInventoryCount(data)).rejects.toThrow('COUNT_ALREADY_ACTIVE')
 await expect(updateCountItem(count.items[0].id,98,'employee','edit',{countId:count.id,storeId:f.store.id,expectedStock:100,observedVersion:f.inventory.updatedAt.toISOString()})).rejects.toThrow('COUNT_NOT_ACTIVE')
 await stockOut({storeId:f.store.id,inventoryId:f.inventory.id,quantity:2,reason:'loss'})
 await completeInventoryCount(count.id,'manager',f.store.id);expect(await balance(f.inventory.id)).toBe(97)
 await expect(completeInventoryCount(count.id,'manager',f.store.id)).rejects.toThrow('COUNT_NOT_ACTIVE')
})
test('daily consumption uses WIB boundaries, includes all actual purposes, persists one alert and respects thresholds',async()=>{
 const f=await fixture();await cutoff(f.store.id)
 const day='2026-10-05',createdAt=new Date('2026-10-05T12:00:00+07:00')
 await prisma.orderConsumptionSnapshot.create({data:{storeId:f.store.id,orderId:randomUUID(),createdAt,materials:JSON.stringify([{inventoryId:f.inventory.id,name:'Tea',unit:'kg',quantity:10}]),issues:'[]'}})
 for(const [reason,quantity] of [['withdrawal',8],['loss',2],['expired',1],['other',1],['process',1]] as const)await prisma.stockOutLog.create({data:{inventoryId:f.inventory.id,reason,quantity,createdAt}})
 await prisma.stockOutLog.create({data:{inventoryId:f.inventory.id,reason:'withdrawal',quantity:50,createdAt:new Date('2026-10-06T00:00:00+07:00')}})
 const result=await employeeConsumption({storeId:f.store.id,startDate:day,endDate:day});expect(result.list[0].actualConsumption).toBe(13);expect(result.list[0].theoreticalConsumption).toBe(10);expect(result.list[0].varianceStatus).toBe('critical');expect(result.list[0].breakdown.loss).toBe(2)
 await checkConsumptionDay(f.store.id,day,new Date('2026-10-07'));await checkConsumptionDay(f.store.id,day,new Date('2026-10-07'));expect((await getConsumptionAlerts(f.store.id))).toHaveLength(1)
 await expect(checkConsumptionDay(f.store.id,'2026-10-07',new Date('2026-10-07T13:00:00+07:00'))).rejects.toThrow('NOT_CLOSED')
 await saveInventoryAlertConfig(f.store.id,{enableConsumptionAlert:false});expect(await getConsumptionAlerts(f.store.id)).toEqual([])
 expect(classifyEmployeeConsumption(3,3.3,10,20).varianceStatus).toBe('warning');expect(classifyEmployeeConsumption(3,3.6,10,20).varianceStatus).toBe('critical')
 expect(classifyEmployeeConsumption(10,11,10,20).varianceStatus).toBe('warning');expect(classifyEmployeeConsumption(10,12,10,20).varianceStatus).toBe('critical');expect(classifyEmployeeConsumption(0,1,10,20)).toMatchObject({varianceStatus:'warning',variancePercent:null});expect(classifyEmployeeConsumption(0,0,10,20).varianceStatus).toBe('normal')
})
test('missing recipes, transition dates and legacy-only ranges never produce a false normal result',async()=>{
 const f=await fixture();await cutoff(f.store.id,'2026-10-05T12:00:00+07:00')
 expect((await employeeConsumption({storeId:f.store.id,startDate:'2026-10-01',endDate:'2026-10-04'})).legacyOnly).toBe(true)
 await prisma.orderConsumptionSnapshot.create({data:{storeId:f.store.id,orderId:randomUUID(),createdAt:new Date('2026-10-05T13:00:00+07:00'),materials:'[]',issues:JSON.stringify([{productId:f.product.id,code:'BOM_MISSING'}])}})
 const result=await checkConsumptionDay(f.store.id,'2026-10-05',new Date('2026-10-06T12:00:00+07:00'));expect(result.list[0]).toMatchObject({varianceStatus:'unavailable',partialPeriod:true});expect((await getConsumptionAlerts(f.store.id))).toEqual([])
 await prisma.bOMItem.deleteMany({where:{productId:f.product.id}});const sale=await createOrder(f.sale)
 expect(JSON.parse((await prisma.orderConsumptionSnapshot.findUniqueOrThrow({where:{orderId:sale.id}})).issues)).toHaveLength(1)
})
test('scheduler catches up closed days and handles repeated runs without duplicate alerts',async()=>{
 const f=await fixture();await cutoff(f.store.id,'2026-10-04T00:00:00+07:00')
 await prisma.stockOutLog.create({data:{inventoryId:f.inventory.id,reason:'withdrawal',quantity:1,createdAt:new Date('2026-10-05T10:00:00+07:00')}})
 await checkClosedConsumptionDays(new Date('2026-10-06T01:00:00+07:00'));await checkClosedConsumptionDays(new Date('2026-10-06T02:00:00+07:00'))
 expect(await prisma.consumptionAlert.count({where:{storeId:f.store.id,businessDate:'2026-10-05',status:'warning'}})).toBe(1)
})
test('receipt synchronization carries original consumption without recalculating or changing physical inventory',async()=>{
 const f=await fixture(),sale=await createOrder(f.sale)
 const order=await prisma.order.findUniqueOrThrow({where:{id:sale.id},include:{items:true,paymentEvidence:true}}),snapshot=await prisma.orderConsumptionSnapshot.findUniqueOrThrow({where:{orderId:sale.id}})
 const wire=receiptFor(randomUUID(),f.tenant.id,order,snapshot)
 expect(wire.consumption!.materials[0].quantity).toBe(0.025)
 const replica={...wire,order:{...wire.order,id:randomUUID(),orderNumber:randomUUID(),items:wire.order.items.map(i=>({...i,id:randomUUID()}))}}
 await receiveReceipt(prisma,replica,f.store.id,'admin');await receiveReceipt(prisma,replica,f.store.id,'admin')
 expect((await prisma.orderConsumptionSnapshot.findUniqueOrThrow({where:{orderId:replica.order.id}})).materials).toBe(snapshot.materials)
 const reversal={...replica,order:{...replica.order,status:'refunded',updatedAt:new Date(Date.now()+1000).toISOString()},consumption:{...replica.consumption!,reversedAt:new Date().toISOString()}}
 await receiveReceipt(prisma,reversal,f.store.id,'admin')
 expect((await prisma.orderConsumptionSnapshot.findUniqueOrThrow({where:{orderId:replica.order.id}})).reversedAt).not.toBeNull()
 const cancelled={...wire,order:{...wire.order,id:randomUUID(),orderNumber:randomUUID(),status:'cancelled',items:wire.order.items.map(i=>({...i,id:randomUUID()}))}}
 await receiveReceipt(prisma,cancelled,f.store.id,'admin');await receiveReceipt(prisma,cancelled,f.store.id,'admin')
 expect((await prisma.orderConsumptionSnapshot.findUniqueOrThrow({where:{orderId:cancelled.order.id}})).reversedAt).not.toBeNull()
 expect(await balance(f.inventory.id)).toBe(100)
 const invalid={...wire,order:{...wire.order,storeId:'other'}};await expect(receiveReceipt(prisma,invalid,f.store.id,'admin')).rejects.toThrow('STORE_MISMATCH')
})
let httpServer:http.Server
const app=express();app.use(express.json());app.use('/api/inventory',declareAccessRoutes('/api/inventory',inventoryRouter));app.use('/api/purchase-orders',declareAccessRoutes('/api/purchase-orders',purchaseOrderRouter));app.use('/api/inventory-counts',declareAccessRoutes('/api/inventory-counts',inventoryCountRouter))
async function token(f:Awaited<ReturnType<typeof fixture>>,role='staff'){
 const user=await prisma.user.create({data:{storeId:f.store.id,phone:randomUUID(),password:'synthetic',role}})
 return jwt.sign({id:user.id,phone:user.phone,role,storeId:f.store.id,staffId:'',issuedAtMs:Date.now()+1000},config.jwt.secret)
}
test('HTTP employee routes enforce store isolation, allow supplier-free purchases and counts, deny management approval and cancellation of another owner',async()=>{
 httpServer=http.createServer(app);await new Promise<void>(resolve=>httpServer.listen(0,'127.0.0.1',resolve))
 const f=await fixture(),foreign=await fixture(),authorization='Bearer '+await token(f)
 expect((await request(httpServer).get('/api/inventory').query({storeId:foreign.store.id}).set('Authorization',authorization)).status).toBe(403)
 const list=await request(httpServer).get('/api/inventory').set('Authorization',authorization);expect(list.status).toBe(200);expect(list.body.data.list.map((i:any)=>i.id)).toEqual([f.inventory.id])
 expect((await request(httpServer).post('/api/purchase-orders').set('Authorization',authorization).send({storeId:foreign.store.id,items:[{inventoryId:f.inventory.id,quantity:1,unitCost:1000}]})).status).toBe(403)
 const created=await request(httpServer).post('/api/purchase-orders').set('Authorization',authorization).send({storeId:f.store.id,items:[{inventoryId:f.inventory.id,quantity:1,unitCost:1000}]});expect(created.status).toBe(201);expect(created.body.data.storeId).toBe(f.store.id);expect(created.body.data.status).toBe('awaiting_receipt')
 const id=created.body.data.id;await prisma.purchaseOrder.update({where:{id},data:{createdBy:'another-owner'}});expect((await request(httpServer).delete(`/api/purchase-orders/${id}`).set('Authorization',authorization)).status).toBe(404)
 expect((await request(httpServer).post(`/api/purchase-orders/${id}/receive`).set('Authorization',authorization)).status).toBe(200)
 const foreignPurchase=await createPurchaseOrder({storeId:foreign.store.id,items:[{inventoryId:foreign.inventory.id,quantity:1,unitCost:1}]})
 expect((await request(httpServer).get(`/api/purchase-orders/${foreignPurchase.id}`).set('Authorization',authorization)).status).toBe(404)
 expect((await request(httpServer).post('/api/inventory/stock-out').set('Authorization',authorization).send({inventoryId:foreign.inventory.id,quantity:1,reason:'withdrawal'})).status).not.toBe(200)
 const out={inventoryId:f.inventory.id,quantity:1,reason:'withdrawal',operationId:randomUUID()}
 const success=await request(httpServer).post('/api/inventory/stock-out').set('Authorization',authorization).send(out)
 expect(success.status).toBe(200);expect(success.body.data.currentStock).toBe(100);expect(typeof success.body.data.updatedAt).toBe('string')
 expect((await request(httpServer).post('/api/inventory/stock-out').set('Authorization',authorization).send(out)).status).toBe(200)
 const count=await request(httpServer).post('/api/inventory-counts').set('Authorization',authorization).send({storeId:f.store.id,period:'ad_hoc',startDate:'2026-10-13',endDate:'2026-10-13',inventoryIds:[f.inventory.id]});expect(count.status).toBe(201)
 expect((await request(httpServer).post(`/api/inventory-counts/${count.body.data.id}/complete`).set('Authorization',authorization)).status).toBe(403)
 expect((await request(httpServer).post('/api/inventory/stock-out').set('Authorization',authorization).send({inventoryId:f.inventory.id,quantity:1,reason:'other',note:''})).status).toBe(400)
})

test('receipt failure rolls back stock, average cost and order status as one transaction',async()=>{
 const f=await fixture(),order=await createPurchaseOrder({storeId:f.store.id,source:'online',items:[{inventoryId:f.inventory.id,quantity:1,unitCost:20000}]})
 const sqlite=process.env.DATABASE_URL!.startsWith('file:')
 if(sqlite)await prisma.$executeRawUnsafe(`CREATE TRIGGER inventory_flow_fail_receipt BEFORE INSERT ON "StockInLog" WHEN NEW."purchaseOrderId"='${order.id}' BEGIN SELECT RAISE(ABORT,'synthetic receipt failure'); END`)
 else{await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION inventory_flow_fail_receipt_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."purchaseOrderId"='${order.id}' THEN RAISE EXCEPTION 'synthetic receipt failure'; END IF; RETURN NEW; END $$`);await prisma.$executeRawUnsafe('CREATE TRIGGER inventory_flow_fail_receipt BEFORE INSERT ON "StockInLog" FOR EACH ROW EXECUTE FUNCTION inventory_flow_fail_receipt_fn()')}
 try{await expect(receivePurchaseOrder(order.id,'employee',f.store.id)).rejects.toThrow();expect(await balance(f.inventory.id)).toBe(100);expect((await prisma.purchaseOrder.findUniqueOrThrow({where:{id:order.id}})).status).toBe('awaiting_receipt');expect(await prisma.batch.count({where:{inventoryId:f.inventory.id}})).toBe(0)}finally{await prisma.$executeRawUnsafe(sqlite?'DROP TRIGGER inventory_flow_fail_receipt':'DROP TRIGGER inventory_flow_fail_receipt ON "StockInLog"')}
 await receivePurchaseOrder(order.id,'employee',f.store.id);expect(await balance(f.inventory.id)).toBe(101)
})
test('late theoretical reversals survive downtime through durable dirty-day markers',async()=>{
 const f=await fixture();await cutoff(f.store.id,'2026-10-01T00:00:00+07:00')
 const orderId=randomUUID(),createdAt=new Date('2026-10-05T12:00:00+07:00')
 await prisma.orderConsumptionSnapshot.create({data:{storeId:f.store.id,orderId,createdAt,materials:JSON.stringify([{inventoryId:f.inventory.id,name:'Tea',unit:'kg',quantity:10}]),issues:'[]'}})
 await prisma.stockOutLog.create({data:{inventoryId:f.inventory.id,quantity:10,reason:'withdrawal',createdAt}})
 await checkConsumptionDay(f.store.id,'2026-10-05',new Date('2026-10-10'))
 await prisma.config.create({data:{storeId:f.store.id,key:'employee_consumption_checkpoint',value:'2026-10-09',category:'inventory'}})
 await prisma.$transaction(tx=>reverseOrderConsumption(tx,orderId))
 await prisma.orderConsumptionSnapshot.update({where:{orderId},data:{reversedAt:new Date('2026-10-06')}})
 await checkClosedConsumptionDays(new Date('2026-10-10T12:00:00+07:00'))
 expect((await getConsumptionAlerts(f.store.id)).find(a=>a.businessDate==='2026-10-05')?.status).toBe('warning')
 expect(await prisma.config.count({where:{storeId:f.store.id,key:'employee_consumption_dirty:2026-10-05'}})).toBe(0)
})
test('old sales without new snapshots still reverse their certified original physical deductions',async()=>{
 const f=await fixture(),sale=await createOrder(f.sale)
 await prisma.orderConsumptionSnapshot.delete({where:{orderId:sale.id}})
 await prisma.inventory.update({where:{id:f.inventory.id},data:{currentStock:{decrement:0.025}}})
 await prisma.stockOutLog.create({data:{inventoryId:f.inventory.id,orderId:sale.id,quantity:0.025,reason:'sold',note:JSON.stringify({version:1,ledgerUnit:'kg',ledgerQuantity:0.025})}})
 const refund=await prisma.refundRequest.create({data:{orderId:sale.id,reason:'unprepared',reasonCode:'paid_unprepared',requestedBy:'employee'}})
 await refundOrder(sale.id,'verified',undefined,undefined,{requestId:refund.id,approvedBy:'admin',restoreUnprepared:true})
 expect(await balance(f.inventory.id)).toBe(100);expect((await prisma.stockOutLog.findFirstOrThrow({where:{orderId:sale.id,reason:'refund_unprepared'}})).quantity).toBe(-0.025)
})
test('HTTP alert acknowledgement and expiry edits are manager-only and reject foreign resources',async()=>{
 const f=await fixture(),foreign=await fixture(),staff='Bearer '+await token(f),manager='Bearer '+await token(f,'manager')
 expect((await request(httpServer).get('/api/inventory/alert-center').set('Authorization',staff)).status).toBe(403)
 const loaded=await request(httpServer).get('/api/inventory/alert-center').set('Authorization',manager);expect(loaded.status).toBe(200);expect(loaded.body.data.list.every((a:any)=>!a.detail.inventoryId||a.detail.inventoryId===f.inventory.id)).toBe(true)
 expect((await request(httpServer).get('/api/inventory/alert-center').query({storeId:foreign.store.id}).set('Authorization',manager)).status).not.toBe(200)
 expect((await request(httpServer).put('/api/inventory/alert-center/expiry').set('Authorization',manager).send({inventoryId:foreign.inventory.id,expiryDate:'2026-10-20'})).status).toBe(409)
 const event=loaded.body.data.list[0];expect(event).toBeDefined();expect((await request(httpServer).post(`/api/inventory/alert-center/${event.id}/handle`).set('Authorization',staff).send({note:'staff'})).status).toBe(403);expect((await request(httpServer).post(`/api/inventory/alert-center/${event.id}/handle`).set('Authorization',manager).send({note:'Manager checked'})).status).toBe(200)
})

test('declared employee-channel inventory operations work while management actions remain blocked',async()=>{
 const f=await fixture(),foreign=await fixture(),authorization='Bearer '+await token(f,'admin'),client=request(httpServer)
 const count=await client.post('/api/inventory-counts').set('Authorization',authorization).set('X-Client-App','employee').send({storeId:f.store.id,period:'ad_hoc',startDate:'2026-10-15',endDate:'2026-10-15',inventoryIds:[f.inventory.id]});expect(count.status).toBe(201)
 const inv=await prisma.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})
 const batch=await client.put(`/api/inventory-counts/${count.body.data.id}/items`).set('Authorization',authorization).set('X-Client-App','employee').send({items:[{itemId:count.body.data.items[0].id,countedQty:20,note:'',expectedStock:inv.currentStock,observedVersion:inv.updatedAt.toISOString()}]});expect(batch.status).toBe(200)
 expect(await balance(f.inventory.id)).toBe(100)
 expect((await client.post(`/api/inventory-counts/${count.body.data.id}/complete`).set('Authorization',authorization).set('X-Client-App','employee')).status).toBe(403)
 const listing=await client.get('/api/inventory').set('Authorization',authorization).set('X-Client-App','employee');expect(listing.status).toBe(200)
 const created=await client.post('/api/purchase-orders').set('Authorization',authorization).set('X-Client-App','employee').send({storeId:f.store.id,items:[{inventoryId:f.inventory.id,quantity:2,unitCost:1000}]});expect(created.status).toBe(201)
 expect((await client.post(`/api/purchase-orders/${created.body.data.id}/receive`).set('Authorization',authorization).set('X-Client-App','employee')).status).toBe(200)
 expect((await client.get('/api/purchase-orders').query({storeId:foreign.store.id}).set('Authorization',authorization).set('X-Client-App','employee')).status).toBe(403)
 expect((await client.get('/api/inventory/alert-center').set('Authorization',authorization).set('X-Client-App','employee')).status).toBe(403)
 expect((await client.delete(`/api/purchase-orders/${created.body.data.id}`).set('Authorization',authorization).set('X-Client-App','employee')).status).toBe(409)
})

test('fulfilled promotion gift has its own frozen theory without duplicating the paid sale or physical deductions',async()=>{
 const f=await fixture(),sale=await createOrder(f.sale);await prisma.$transaction(tx=>deductInventory(f.store.id,sale.id,[{productId:f.product.id,quantity:1}],tx,{allowNegative:false,consumptionKey:sale.id+':grant:gift',consumedAt:new Date()}))
 const rows=await prisma.orderConsumptionSnapshot.findMany({where:{storeId:f.store.id}});expect(rows).toHaveLength(2);expect(rows.every(row=>JSON.parse(row.materials)[0].quantity===0.025)).toBe(true);expect(await balance(f.inventory.id)).toBe(100);expect(await prisma.stockOutLog.count({where:{orderId:sale.id}})).toBe(0)
})

 test('batch count draft is atomic, rejects duplicates/stale/foreign items and keeps blank rows uncounted',async()=>{
  const f=await fixture(),other=await fixture();const second=await prisma.inventory.create({data:{storeId:f.store.id,name:'Second batch material',category:'tea',unit:'kg',currentStock:10,avgCost:100}})
  const count=await createInventoryCount({storeId:f.store.id,period:'ad_hoc',startDate:new Date(),endDate:new Date()})
  const first=count.items.find((i:any)=>i.inventoryId===f.inventory.id)!,next=count.items.find((i:any)=>i.inventoryId===second.id)!
  const row={itemId:first.id,countedQty:0,note:'',expectedStock:100,observedVersion:f.inventory.updatedAt.toISOString()}
  const row2={itemId:next.id,countedQty:8,note:'',expectedStock:10,observedVersion:second.updatedAt.toISOString()}
  await expect(updateCountItems(count.id,f.store.id,'employee',[row,row])).rejects.toThrow('INVALID_COUNT_SELECTION')
  await expect(updateCountItems(count.id,other.store.id,'employee',[row])).rejects.toThrow('COUNT_NOT_ACTIVE')
  await expect(updateCountItems(count.id,f.store.id,'employee',[row,{...row2,observedVersion:'2000-01-01T00:00:00.000Z'}])).rejects.toThrow('COUNT_REFRESH_REQUIRED')
  expect((await prisma.inventoryCountItem.findUniqueOrThrow({where:{id:first.id}})).countedAt).toBeNull()
  const saved=await updateCountItems(count.id,f.store.id,'employee',[row]);expect(saved[0].countedQty).toBe(0);expect(saved[0].note).toBeNull()
  expect((await prisma.inventoryCountItem.findUniqueOrThrow({where:{id:next.id}})).countedAt).toBeNull()
  expect(await balance(f.inventory.id)).toBe(100)
  await updateCountItems(count.id,f.store.id,'employee',[row2]);await submitInventoryCount(count.id,f.store.id)
  await expect(updateCountItems(count.id,f.store.id,'employee',[row])).rejects.toThrow('COUNT_NOT_ACTIVE')
  await completeInventoryCount(count.id,'manager',f.store.id);expect(await balance(f.inventory.id)).toBe(0);expect(await balance(second.id)).toBe(8)
 })

test('single submission atomically saves a partial count, lists blanks, and approval adjusts only counted rows',async()=>{
 const f=await fixture(),other=await fixture();const second=await prisma.inventory.create({data:{storeId:f.store.id,name:'Uncounted material',category:'tea',unit:'kg',currentStock:10,avgCost:100}})
 const count=await createInventoryCount({storeId:f.store.id,period:'ad_hoc',startDate:new Date(),endDate:new Date()})
 const first=count.items.find((i:any)=>i.inventoryId===f.inventory.id)!,next=count.items.find((i:any)=>i.inventoryId===second.id)!
 const row={itemId:first.id,countedQty:0,note:'',expectedStock:100,observedVersion:f.inventory.updatedAt.toISOString()}
 const row2={itemId:next.id,countedQty:8,note:'',expectedStock:10,observedVersion:second.updatedAt.toISOString()}
 await expect(submitInventoryCount(count.id,other.store.id,'employee',[row])).rejects.toThrow('COUNT_NOT_ACTIVE')
 await expect(submitInventoryCount(count.id,f.store.id,'employee',[row,row])).rejects.toThrow('INVALID_COUNT_SELECTION')
 await expect(submitInventoryCount(count.id,f.store.id,'employee',[row,{...row2,observedVersion:'2000-01-01T00:00:00.000Z'}])).rejects.toThrow('COUNT_REFRESH_REQUIRED')
 expect((await prisma.inventoryCountItem.findUniqueOrThrow({where:{id:first.id}})).countedAt).toBeNull()
 expect((await prisma.inventoryCount.findUniqueOrThrow({where:{id:count.id}})).status).toBe('in_progress')
 const submitted=await submitInventoryCount(count.id,f.store.id,'employee',[row])
 expect(submitted.status).toBe('pending_review');expect(submitted.items.find((i:any)=>i.id===first.id).countedQty).toBe(0)
 expect(submitted.items.find((i:any)=>i.id===next.id).countedQty).toBeNull()
 expect(await balance(f.inventory.id)).toBe(100);expect(await balance(second.id)).toBe(10)
 expect((await submitInventoryCount(count.id,f.store.id,'employee',[row])).status).toBe('pending_review')
 await completeInventoryCount(count.id,'manager',f.store.id)
 expect(await balance(f.inventory.id)).toBe(0);expect(await balance(second.id)).toBe(10)
 expect(await prisma.stockOutLog.count({where:{inventoryId:second.id,reason:'count_adjustment'}})).toBe(0)
 expect((await prisma.inventoryCountItem.findUniqueOrThrow({where:{id:next.id}})).countedAt).toBeNull()
})
