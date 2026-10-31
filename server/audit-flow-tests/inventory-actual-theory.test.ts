import {inventoryReconciliation} from '../src/services/InventoryReconciliationService'
import {beforeAll,afterAll,test,expect} from '@jest/globals'
import {randomUUID} from 'crypto'
import prisma from '../src/config/database'
import {upgradeLocalSqlite} from '../src/utils/sqliteUpgrade'
import {upgradeInventoryFlow} from '../src/utils/inventoryFlowUpgrade'
import {pgLedgerDDL,assertLedgerInstalled} from '../src/utils/inventoryLedger'
import {ACTUAL_STOCK_KEY} from '../src/services/ActualInventoryPolicy'
import {UNIFIED_INVENTORY_KEY} from '../src/services/UnifiedInventoryService'
import {recordOrderConsumption,reverseOrderConsumption,FLOW_CUTOVER_KEY} from '../src/services/OrderConsumptionService'
import {stockOut,getInventory} from '../src/services/InventoryService'
import {employeeConsumption} from '../src/services/EmployeeConsumptionService'
import {createRecipe,executeRecipe} from '../src/services/ProcessRecipeService'
import {createInventoryCount,updateCountItem,submitInventoryCount,completeInventoryCount} from '../src/services/InventoryCountService'
import {physicalInventoryVariance} from '../src/services/InventoryVarianceService'
beforeAll(async()=>{if(process.env.DATABASE_URL!.startsWith('file:'))await upgradeLocalSqlite(prisma,process.env.DATABASE_URL!);else try{await assertLedgerInstalled(prisma,false)}catch{for(const sql of pgLedgerDDL)await prisma.$executeRawUnsafe(sql)}await upgradeInventoryFlow(prisma,process.env.DATABASE_URL!)})
afterAll(async()=>{await prisma.$disconnect()})
async function fixture(unit='pcs'){
 const tenant=await prisma.tenant.create({data:{name:'Synthetic actual stock'}}),store=await prisma.store.create({data:{tenantId:tenant.id,name:'Synthetic actual stock'}})
 for(const key of [ACTUAL_STOCK_KEY,UNIFIED_INVENTORY_KEY,FLOW_CUTOVER_KEY])await prisma.config.create({data:{storeId:store.id,key,value:'2026-01-01T00:00:00Z',category:'inventory'}})
 const material=await prisma.inventory.create({data:{storeId:store.id,name:'Synthetic '+unit,category:'ingredient',unit,currentStock:1000,avgCost:100}})
 const category=await prisma.category.create({data:{storeId:store.id,name:'Synthetic ice cream'}}),product=await prisma.product.create({data:{storeId:store.id,categoryId:category.id,name:'Synthetic sundae',code:randomUUID()}})
 await prisma.bOMItem.create({data:{productId:product.id,inventoryId:material.id,quantity:1,unit}})
 const balance=async()=>(await prisma.inventory.findUniqueOrThrow({where:{id:material.id}})).currentStock
 const issue=(quantity:number,operationId=randomUUID(),inputUnit=unit)=>stockOut({storeId:store.id,inventoryId:material.id,quantity,reason:'withdrawal',staffId:'counter',operationId,inputUnit})
 async function sale(quantity:number){const order=await prisma.order.create({data:{storeId:store.id,staffId:'counter',orderNumber:randomUUID(),totalAmount:100,finalAmount:100,paymentMethod:'cash',status:'completed'}});await prisma.$transaction(tx=>recordOrderConsumption(tx,store.id,order.id,[{productId:product.id,quantity}]));return order}
 async function observe(quantity:number){const c=await createInventoryCount({storeId:store.id,period:'ad_hoc',startDate:new Date('2026-01-01'),endDate:new Date('2027-01-01'),inventoryIds:[material.id]});const i=c.items[0];await updateCountItem(i.id,quantity,'counter',undefined,{countId:c.id,storeId:store.id,expectedStock:i.inventory.currentStock,observedVersion:i.inventory.updatedAt.toISOString()});await submitInventoryCount(c.id,store.id);await completeInventoryCount(c.id,'manager',store.id);return c}
 return{store,material,product,balance,issue,sale,observe}
}
test('10 sundaes freeze 10 cups of theory; only employee issues decrease physical cups and retries do not deduct twice',async()=>{
 const f=await fixture(),op=randomUUID();await f.issue(10,op);await f.issue(10,op);expect(await f.balance()).toBe(990)
 const order=await f.sale(10);expect(await f.balance()).toBe(990)
 const snapshot=await prisma.orderConsumptionSnapshot.findUniqueOrThrow({where:{orderId:order.id}});expect(JSON.parse(snapshot.materials)[0].quantity).toBe(10)
 await expect(prisma.$transaction(tx=>recordOrderConsumption(tx,f.store.id,order.id,[{productId:f.product.id,quantity:10}]))).rejects.toThrow();expect(await f.balance()).toBe(990)
 await prisma.$transaction(tx=>reverseOrderConsumption(tx,order.id));await prisma.$transaction(tx=>reverseOrderConsumption(tx,order.id));expect(await f.balance()).toBe(990)
 expect(await prisma.stockOutLog.count({where:{inventoryId:f.material.id,reason:{in:['sale_estimate','sale_estimate_reversal']}}})).toBe(0)
 await expect(f.issue(991)).rejects.toThrow('Insufficient stock');expect(await f.balance()).toBe(990)
})
test('1000g issued versus 100g theory shows 900g reference, excludes waste from issues, and does not claim production',async()=>{
 const f=await fixture('g');await f.issue(1000);await f.sale(100)
 const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'})
 const row=(await employeeConsumption({storeId:f.store.id,startDate:date,endDate:date})).list[0]
 expect(row.actualWithdrawal).toBe(1000);expect(row.theoreticalConsumption).toBe(100);expect(row.variance).toBe(900);expect(row.varianceStatus).toBe('not_compared');expect(row.production).toEqual([]);expect(await f.balance()).toBe(0)
})
test('three 1kg bags yield 10.5kg by recipe; registered processing is separate and never deducts issued material twice',async()=>{
 const f=await fixture('kg');await prisma.config.create({data:{storeId:f.store.id,key:'inventoryPackage:'+f.material.id,value:JSON.stringify({unit:'bag',quantity:1,baseUnit:'kg'}),category:'inventory'}})
 const recipe=await createRecipe({storeId:f.store.id,name:'Synthetic mix',outputUnit:'kg',inputs:[{inventoryId:f.material.id,quantity:1}],outputs:[{name:'Synthetic base',quantity:3.5}]})
 await f.issue(3,randomUUID(),'bag');expect(await f.balance()).toBe(997)
 const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'}),report=()=>employeeConsumption({storeId:f.store.id,startDate:date,endDate:date})
 let row=(await report()).list[0];expect(row.production[0].theoreticalOutput).toBeCloseTo(10.5);expect(row.production[0].registeredOutput).toBeNull()
 const op=randomUUID();await executeRecipe(recipe!.id,3,'counter',f.store.id,op);await executeRecipe(recipe!.id,3,'counter',f.store.id,op);expect(await f.balance()).toBe(997)
 row=(await report()).list[0];expect(row.actualWithdrawal).toBe(3);expect(row.production[0].registeredOutput).toBeCloseTo(10.5);expect(row.production[0].difference).toBeCloseTo(0)
})
test('latest two warehouse observations are used, not the first lifetime count; difference remains a reference',async()=>{
 const f=await fixture('g');await f.observe(1200);await f.observe(1000);await f.issue(1000);await f.sale(100);await f.observe(0)
 const row=(await physicalInventoryVariance({storeId:f.store.id,startDate:'2026-01-01',endDate:'2027-01-01',latest:true}))[0]
 expect(row.completedObservationCount).toBe(3);expect(row.usableObservationCount).toBe(2);expect(row.latestObservationAt).toBe(row.windowEnd);
 expect(row.openingPhysical).toBe(1000);expect(row.closingPhysical).toBe(0);expect(row.actualConsumption).toBe(1000);expect(row.theoreticalConsumption).toBe(100);expect(row.variance).toBe(900);expect(row.varianceStatus).toBe('not_compared')
})
test('historical estimates remain unchanged when reversed after physical policy cutover',async()=>{
 const f=await fixture();await prisma.config.delete({where:{storeId_key:{storeId:f.store.id,key:ACTUAL_STOCK_KEY}}})
 const order=await f.sale(10);expect(await f.balance()).toBe(990)
 await prisma.config.create({data:{storeId:f.store.id,key:ACTUAL_STOCK_KEY,value:new Date().toISOString(),category:'inventory'}})
 await prisma.$transaction(tx=>reverseOrderConsumption(tx,order.id));expect(await f.balance()).toBe(990)
 expect(await prisma.stockOutLog.count({where:{inventoryId:f.material.id,reason:'sale_estimate'}})).toBe(1)
})

test('inventory notices respect live store and employee access; reading does not handle an alert; resolved alerts disappear',async()=>{
 const {declareAccessRoutes}=await import('../src/middlewares/staffAccessV2')
 const {inventoryRouter}=await import('../src/routes/inventory')
 declareAccessRoutes('/api/inventory',inventoryRouter)
 const {projectInventoryAwareness}=await import('../src/services/NotificationApprovalService')
 const {notificationInbox}=await import('../src/services/NotificationInboxService')
 const f=await fixture(),user=await prisma.user.create({data:{storeId:f.store.id,phone:randomUUID(),password:'synthetic-disabled',role:'admin'}})
 const event={id:'inventoryAlert:synthetic',detail:{inventoryName:f.material.name},active:true,status:'open',firstSeen:new Date().toISOString(),severity:'warning'}
 const key=event.id;await prisma.config.create({data:{storeId:f.store.id,key,category:'inventory_alert_events',value:JSON.stringify(event)}})
 const actor={id:user.id,storeId:f.store.id,employeeApp:false}
 expect(await projectInventoryAwareness(prisma,{...actor,employeeApp:true})).toEqual([])
 expect(await projectInventoryAwareness(prisma,{...actor,storeId:'foreign'})).toEqual([])
 const inbox=notificationInbox(prisma,{inventory:projectInventoryAwareness,approvals:async()=>[],trainingRelevant:async()=>false})
 let result=await inbox.read(actor);expect(result.items).toHaveLength(1);expect(result.counts.unread).toBe(1);expect(result.items[0].title).toContain(f.material.name);expect(result.items[0].status).toBe('pending')
 await inbox.markRead(actor,result.items[0].id);result=await inbox.read(actor);expect(result.counts.unread).toBe(0);expect(result.items[0].pending).toBe(true)
 expect(JSON.parse((await prisma.config.findUniqueOrThrow({where:{storeId_key:{storeId:f.store.id,key}}})).value).status).toBe('open')
 await prisma.config.update({where:{storeId_key:{storeId:f.store.id,key}},data:{value:JSON.stringify({...event,active:false,status:'resolved'})}})
 expect((await inbox.read(actor)).items).toHaveLength(0)
})

test('existing employee and admin forms receive physical stock preview metadata',async()=>{const f=await fixture();const row=(await getInventory({storeId:f.store.id})).find((r:any)=>r.id===f.material.id);expect(row.actualStockPolicy).toBe(true);expect(row.unifiedStock).toBe(false);expect(row.currentStock).toBe(1000);await f.issue(10);expect((await getInventory({storeId:f.store.id}))[0].currentStock).toBe(990)});

test('audited historical theory correction is counted once, preserves original snapshots and stock, and follows reversals',async()=>{
 const {appendConsumptionCorrection,correctedConsumptionSnapshots}=await import('../src/services/ConsumptionEvidenceService')
 const f=await fixture(),order=await f.sale(3),source=await prisma.orderConsumptionSnapshot.findUniqueOrThrow({where:{orderId:order.id}}),delta=[{inventoryId:f.material.id,name:f.material.name,unit:'pcs',quantity:2}]
 await expect(prisma.$transaction(tx=>appendConsumptionCorrection(tx,f.store.id,source.id,[{...delta[0],quantity:-4}],'Invalid negative','synthetic-batch'))).rejects.toThrow('INVALID_THEORY_CORRECTION')
 await prisma.$transaction(tx=>appendConsumptionCorrection(tx,f.store.id,source.id,delta,'Synthetic verified missing cups','synthetic-batch'))
 await prisma.$transaction(tx=>appendConsumptionCorrection(tx,f.store.id,source.id,delta,'Synthetic verified missing cups','synthetic-batch'))
 let snapshots=await correctedConsumptionSnapshots(prisma,{storeId:f.store.id});expect(JSON.parse(snapshots[0].materials)[0].quantity).toBe(5)
 expect((await prisma.orderConsumptionSnapshot.findUniqueOrThrow({where:{id:source.id}})).materials).toBe(source.materials);expect(await f.balance()).toBe(1000)
 await expect(prisma.$transaction(tx=>appendConsumptionCorrection(tx,f.store.id,source.id,[{...delta[0],quantity:4}],'Changed correction','synthetic-batch'))).rejects.toThrow('THEORY_CORRECTION_CONFLICT')
 await expect(prisma.$transaction(tx=>appendConsumptionCorrection(tx,'foreign',source.id,delta,'Foreign','synthetic-batch'))).rejects.toThrow('CONSUMPTION_SOURCE_NOT_FOUND')
 await prisma.$transaction(tx=>reverseOrderConsumption(tx,order.id));snapshots=await correctedConsumptionSnapshots(prisma,{storeId:f.store.id});expect(snapshots[0].reversedAt).not.toBeNull();expect(JSON.parse(snapshots[0].materials)[0].quantity).toBe(3);expect(await f.balance()).toBe(1000)
})


test('expiry alerts ignore historical nanounit FIFO residue but retain real expired stock',async()=>{
 const {calculateInventoryAlerts}=await import('../src/services/InventoryAlertCenterService')
 const f=await fixture('g');await prisma.inventory.update({where:{id:f.material.id},data:{shelfLife:30}})
 const now=new Date(),past=new Date(now.getTime()-86400000),future=new Date(now.getTime()+365*86400000)
 const batch=(batchNumber:string,quantity:number,expiryDate:Date|null)=>prisma.batch.create({data:{inventoryId:f.material.id,batchNumber,quantity,unitCost:100,expiryDate}})
 await batch('known-future',1000-0.01-4.4e-9,future)
 const missing=await batch('floating-missing',1.4e-9,null),expired=await batch('floating-expired',3e-9,past),real=await batch('real-expired',0.01,past)
 const rows=(await calculateInventoryAlerts(f.store.id,now)).filter(a=>a.type==='expiry_missing'||a.type==='expiry_batch')
 expect(rows.some(a=>a.resourceId===missing.id||a.resourceId===expired.id)).toBe(false)
 expect(rows.some(a=>a.type==='expiry_missing'&&a.detail.inventoryId===f.material.id)).toBe(false)
 expect(rows.some(a=>a.type==='expiry_batch'&&a.resourceId===real.id)).toBe(true)
 expect(await f.balance()).toBe(1000)
 expect((await prisma.batch.findUniqueOrThrow({where:{id:missing.id}})).quantity).toBe(1.4e-9)
})

test('report missing baseline metadata distinguishes no counts from one count without fabricated zero usage',async()=>{
 const f=await fixture('g'),report=()=>physicalInventoryVariance({storeId:f.store.id,startDate:'2026-01-01',endDate:'2027-01-01',latest:true})
 let row=(await report())[0];expect(row.completedObservationCount).toBe(0);expect(row.latestObservationAt).toBeNull();expect(row.theoreticalConsumption).toBeNull();expect(row.receipts).toBeNull()
 await f.observe(1000);row=(await report())[0];expect(row.completedObservationCount).toBe(1);expect(row.usableObservationCount).toBe(1);expect(row.latestObservationAt).not.toBeNull();expect(row.theoreticalConsumption).toBeNull();expect(row.actualConsumption).toBeNull();expect(row.unavailableReason).toBe('TWO_PHYSICAL_OBSERVATIONS_REQUIRED')
})

test('registered report distinguishes no business activity from zero values while retaining materials',async()=>{
 const f=await fixture(),date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'}),report=()=>employeeConsumption({storeId:f.store.id,startDate:date,endDate:date})
 const empty=await report();expect(empty.hasBusinessActivity).toBe(false);expect(empty.list).toHaveLength(1)
 await f.issue(3);const active=await report();expect(active.hasBusinessActivity).toBe(true);expect(active.list[0].actualWithdrawal).toBe(3)
})

test('daily theory and actual stock out exist without any count',async()=>{
 const f=await fixture('kg');await f.issue(3);await f.sale(2)
 const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'}),daily=(await employeeConsumption({storeId:f.store.id,startDate:date,endDate:date})).list[0]
 expect(await prisma.inventoryCountItem.count({where:{inventoryId:f.material.id}})).toBe(0);expect(daily.actualWithdrawal).toBe(3);expect(daily.theoreticalConsumption).toBe(2);expect(daily.variance).toBe(1)
})
test('15kg baseline and 3kg physical out reconcile to 12kg regardless of sale recipe evidence',async()=>{
 const f=await fixture('kg');await f.observe(15);await f.issue(3000,randomUUID(),'g')
 const report=()=>inventoryReconciliation({storeId:f.store.id,startDate:'2026-01-01',endDate:'2027-01-01',latest:true})
 let row=(await report())[0];expect(row.openingPhysical).toBe(15);expect(row.actualOut).toBe(3);expect(row.expectedClosing).toBe(12);expect(row.closingPhysical).toBeNull();expect(row.varianceStatus).toBe('awaiting_count')
 await f.observe(12);row=(await report())[0];expect(row.expectedClosing).toBe(12);expect(row.closingPhysical).toBe(12);expect(row.variance).toBe(0);expect(row.varianceStatus).toBe('normal')
})
test('a pending mismatched count warns, survives approval, and resolves after the next matching count',async()=>{
 const {calculateInventoryAlerts,refreshInventoryAlerts}=await import('../src/services/InventoryAlertCenterService')
 const f=await fixture('kg');await f.observe(15);await f.issue(3)
 // Missing sales evidence must never block a physical stock reconciliation.
 await prisma.order.create({data:{storeId:f.store.id,staffId:'counter',orderNumber:randomUUID(),totalAmount:100,finalAmount:100,paymentMethod:'cash',status:'paid'}})
 const c=await createInventoryCount({storeId:f.store.id,period:'ad_hoc',startDate:new Date('2026-01-01'),endDate:new Date('2027-01-01'),inventoryIds:[f.material.id]}),i=c.items[0]
 await updateCountItem(i.id,11.99,'counter',undefined,{countId:c.id,storeId:f.store.id,expectedStock:i.inventory.currentStock,observedVersion:i.inventory.updatedAt.toISOString()});await submitInventoryCount(c.id,f.store.id)
 const report=()=>inventoryReconciliation({storeId:f.store.id,startDate:'2026-01-01',endDate:'2027-01-01',latest:true})
 let row=(await report())[0];expect(row.expectedClosing).toBe(12);expect(row.variance).toBe(-0.01);expect(row.closingStatus).toBe('pending_review');expect(row.varianceStatus).toBe('warning')
 let alerts=(await calculateInventoryAlerts(f.store.id)).filter(a=>a.type==='count_variance'&&a.resourceId===i.id);expect(alerts).toHaveLength(1);expect(alerts[0].detail.systemQty).toBe(12)
 await completeInventoryCount(c.id,'manager',f.store.id);row=(await report())[0];expect(row.variance).toBe(-0.01);expect(row.closingStatus).toBe('completed');expect(await f.balance()).toBeCloseTo(11.99)
 let events=await refreshInventoryAlerts(f.store.id);expect(events.list.some(a=>a.type==='count_variance'&&a.resourceId===i.id&&a.active)).toBe(true)
 await f.observe(11.99);events=await refreshInventoryAlerts(f.store.id);expect(events.list.find(a=>a.type==='count_variance'&&a.resourceId===i.id)?.active??false).toBe(false)
})

test('material ledger search precedes paging and preserves Jakarta midnight instants and fractional kg',async()=>{
 const {getStockOutLogs}=await import('../src/services/InventoryService')
 const f=await fixture('kg');await prisma.inventory.update({where:{id:f.material.id},data:{name:'{"zh":"香草冰淇淋粉","en":"Vanilla powder","id":"Bubuk vanila"}'}})
 const first=await f.issue(0.25),second=await f.issue(1)
 const logs=await prisma.stockOutLog.findMany({where:{inventoryId:f.material.id},orderBy:{createdAt:'asc'}})
 await prisma.stockOutLog.update({where:{id:logs[0].id},data:{createdAt:new Date('2026-10-29T18:00:00Z')}})
 await prisma.stockOutLog.update({where:{id:logs[1].id},data:{createdAt:new Date('2026-10-30T18:00:00Z')}})
 const filter={storeId:f.store.id,search:'  VANILLA  ',startDate:'2026-10-29T17:00:00Z',endDate:'2026-10-30T16:59:59.999Z',take:1}
 const results=await getStockOutLogs(filter);expect(results).toHaveLength(1);expect(results[0].quantity).toBe(0.25)
 expect(await getStockOutLogs({...filter,skip:1})).toHaveLength(0)
 expect(await getStockOutLogs({...filter,search:'no-such-material'})).toHaveLength(0)
})
