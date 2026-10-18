import {beforeAll,afterAll,test,expect} from '@jest/globals'
import {randomUUID} from 'crypto'
import prisma from '../src/config/database'
import {upgradeLocalSqlite} from '../src/utils/sqliteUpgrade'
import {upgradeInventoryFlow} from '../src/utils/inventoryFlowUpgrade'
import {pgLedgerDDL,assertLedgerInstalled} from '../src/utils/inventoryLedger'
import {UNIFIED_INVENTORY_KEY,CALIBRATED_PREFIX} from '../src/services/UnifiedInventoryService'
import {recordOrderConsumption,reverseOrderConsumption} from '../src/services/OrderConsumptionService'
import {stockOut,stockIn} from '../src/services/InventoryService'
import {createRecipe,executeRecipe} from '../src/services/ProcessRecipeService'
import {createInventoryCount,updateCountItem,submitInventoryCount,completeInventoryCount,getInventoryCountById} from '../src/services/InventoryCountService'
import {physicalInventoryVariance} from '../src/services/InventoryVarianceService'
import {getLowStockAlerts} from '../src/services/BomService'
import {inventoryForecast} from '../src/services/InventoryForecastService'
beforeAll(async()=>{if(process.env.DATABASE_URL!.startsWith('file:'))await upgradeLocalSqlite(prisma,process.env.DATABASE_URL!);else try{await assertLedgerInstalled(prisma,false)}catch{for(const sql of pgLedgerDDL)await prisma.$executeRawUnsafe(sql)}await upgradeInventoryFlow(prisma,process.env.DATABASE_URL!)})
afterAll(async()=>{await prisma.$disconnect()})
async function fixture(){
 const tenant=await prisma.tenant.create({data:{name:'Synthetic unified stock'}}),store=await prisma.store.create({data:{tenantId:tenant.id,name:'Synthetic unified stock'}})
 for(const [key,value] of [[UNIFIED_INVENTORY_KEY,'2026-01-01T00:00:00Z'],['employee_inventory_flow_started_at','2026-01-01T00:00:00Z']])await prisma.config.create({data:{storeId:store.id,key,value,category:'inventory'}})
 const raw=await prisma.inventory.create({data:{storeId:store.id,name:'Vanilla powder',category:'ingredient',unit:'kg',currentStock:10,avgCost:1000,minStock:5}})
 const recipe=await createRecipe({storeId:store.id,name:'Base',outputUnit:'kg',inputs:[{inventoryId:raw.id,quantity:3}],outputs:[{name:'Prepared base',quantity:10}]})
 const semi=await prisma.inventory.findFirstOrThrow({where:{storeId:store.id,processRecipeId:recipe!.id}})
 const category=await prisma.category.create({data:{storeId:store.id,name:'Ice cream'}}),product=await prisma.product.create({data:{storeId:store.id,categoryId:category.id,name:'Sundae',code:randomUUID()}})
 await prisma.bOMItem.create({data:{productId:product.id,inventoryId:semi.id,quantity:100,unit:'g'}})
 async function order(at=new Date()) {return prisma.order.create({data:{storeId:store.id,staffId:'synthetic',orderNumber:randomUUID(),totalAmount:100,finalAmount:100,paymentMethod:'cash',status:'completed',createdAt:at}})}
 async function sale(at=new Date()){const o=await order(at);await prisma.$transaction(tx=>recordOrderConsumption(tx,store.id,o.id,[{productId:product.id,quantity:1}],{consumedAt:at}));return o}
 const balance=async()=>(await prisma.inventory.findUniqueOrThrow({where:{id:raw.id}})).currentStock
 async function observe(q:number,approve=true){const c=await createInventoryCount({storeId:store.id,period:'ad_hoc',startDate:new Date('2026-01-01'),endDate:new Date('2027-01-01'),inventoryIds:[raw.id]});const i=c.items[0];await updateCountItem(i.id,q,'counter',undefined,{countId:c.id,storeId:store.id,expectedStock:i.inventory.currentStock,observedVersion:i.inventory.updatedAt.toISOString()});if(approve){await submitInventoryCount(c.id,store.id);await completeInventoryCount(c.id,'manager',store.id)}return (await getInventoryCountById(c.id,store.id))!}
 return{store,raw,recipe,product,balance,sale,order,observe}
}
test('batch issue then processing does not deduct twice; sale estimates once and unprepared reversal is idempotent',async()=>{
 const f=await fixture(),input={inventoryId:f.raw.id,storeId:f.store.id,staffId:'counter',reason:'withdrawal',quantity:3,operationId:randomUUID()}
 await stockOut(input);await stockOut(input);await executeRecipe(f.recipe!.id,1,'counter',f.store.id,randomUUID());expect(await f.balance()).toBe(10)
 const order=await f.sale();expect(await f.balance()).toBeCloseTo(9.97)
 await expect(prisma.$transaction(tx=>recordOrderConsumption(tx,f.store.id,order.id,[{productId:f.product.id,quantity:1}]))).rejects.toThrow();expect(await f.balance()).toBeCloseTo(9.97)
 await prisma.$transaction(tx=>reverseOrderConsumption(tx,order.id));await prisma.$transaction(tx=>reverseOrderConsumption(tx,order.id));expect(await f.balance()).toBeCloseTo(10)
 expect((await prisma.batch.findMany({where:{inventoryId:f.raw.id,status:'active'}})).reduce((sum,b)=>sum+b.quantity,0)).toBeCloseTo(10)
 await stockOut({...input,operationId:randomUUID(),reason:'loss',quantity:1});expect(await f.balance()).toBeCloseTo(9)
 const other=await fixture();await expect(stockOut({...input,storeId:other.store.id,operationId:randomUUID()})).rejects.toThrow('not found')
})
test('whole-store counts use frozen sales snapshots and ignore internal processing as depletion',async()=>{
 const f=await fixture();await f.observe(10);await f.sale()
 await stockOut({storeId:f.store.id,inventoryId:f.raw.id,reason:'withdrawal',quantity:3,staffId:'counter'});await executeRecipe(f.recipe!.id,1,'counter',f.store.id,randomUUID())
 await stockIn({storeId:f.store.id,inventoryId:f.raw.id,reason:'purchase',quantity:2,unitCost:1000,staffId:'receiver'})
 await stockOut({storeId:f.store.id,inventoryId:f.raw.id,reason:'loss',quantity:0.1,staffId:'counter'})
 await f.observe(11.87)
 const row=(await physicalInventoryVariance({storeId:f.store.id,startDate:'2026-01-01',endDate:'2027-01-01'})).find(r=>r.inventoryId===f.raw.id)!
 expect(row.theoreticalConsumption).toBeCloseTo(0.03);expect(row.actualConsumption).toBeCloseTo(0.03);expect(row.receipts).toBe(2);expect(row.knownNonSaleOut).toBeCloseTo(0.1);expect(row.varianceStatus).toBe('normal')
})
test('late offline sale before approved count is not deducted again; pending-review late estimates are compensated',async()=>{
 const f=await fixture(),at=new Date(Date.now()-60000),order=await f.order(at)
 const c=await f.observe(9,false)
 await prisma.$transaction(tx=>recordOrderConsumption(tx,f.store.id,order.id,[{productId:f.product.id,quantity:1}],{consumedAt:at}));expect(await f.balance()).toBeCloseTo(9.97)
 await submitInventoryCount(c.id,f.store.id);await completeInventoryCount(c.id,'manager',f.store.id);expect(await f.balance()).toBeCloseTo(9)
 const old=await f.sale(at);expect(await f.balance()).toBeCloseTo(9)
 await prisma.$transaction(tx=>reverseOrderConsumption(tx,old.id));expect(await f.balance()).toBeCloseTo(9)
 expect(await prisma.config.findUnique({where:{storeId_key:{storeId:f.store.id,key:CALIBRATED_PREFIX+f.raw.id}}})).not.toBeNull()
})
test('forecast ignores bulk issues and waste in demand, preserves zero-sales days and subtracts outstanding receipts',async()=>{
 const f=await fixture();await f.observe(10)
 const at=new Date('2026-10-10T12:00:00Z');await f.sale(at)
 await stockOut({storeId:f.store.id,inventoryId:f.raw.id,reason:'withdrawal',quantity:100,staffId:'counter'})
 await stockOut({storeId:f.store.id,inventoryId:f.raw.id,reason:'loss',quantity:1,staffId:'counter'})
 await prisma.config.create({data:{storeId:f.store.id,key:'inventoryPackage:'+f.raw.id,value:JSON.stringify({unit:'bag',quantity:2,baseUnit:'kg'}),category:'inventory'}})
 await prisma.purchaseOrder.create({data:{storeId:f.store.id,orderNumber:randomUUID(),status:'approved',totalAmount:1000,items:{create:[{inventoryId:f.raw.id,quantity:4,receivedQty:1,unitCost:1000}]}}})
 const row=(await inventoryForecast(f.store.id,7,new Date('2026-10-17T12:00:00Z'))).find(r=>r.inventoryId===f.raw.id)!
 expect(row.totalUsage).toBeCloseTo(0.03);expect(row.historyDays).toBe(7);expect(row.dailyUsage).toBeCloseTo(0.03/7);expect('onOrderQty' in row&&row.onOrderQty).toBe(3)
 expect(row.daysUntilStockOut).not.toBeNull()
 const short=(await inventoryForecast(f.store.id,1,new Date('2026-10-17T12:00:00Z')))[0];expect(short.daysUntilStockOut).toBeNull()
})
test('negative estimated balance never blocks sales; a prepared refund keeps consumed ingredients and count resets baseline',async()=>{
 const f=await fixture();await f.observe(0);const o=await f.sale();expect(await f.balance()).toBeCloseTo(-0.03)
 await prisma.order.update({where:{id:o.id},data:{status:'refunded'}});expect(await f.balance()).toBeCloseTo(-0.03)
 await f.observe(2);expect(await f.balance()).toBeCloseTo(2)
 await f.sale();expect(await f.balance()).toBeCloseTo(1.97)
})
test('unverified opening balance and incomplete recipes suppress numerical coverage; packages round upward',async()=>{
 const f=await fixture();const at=new Date('2026-10-10T12:00:00Z');await f.sale(at)
 let row=(await inventoryForecast(f.store.id,7,new Date('2026-10-17T12:00:00Z'))).find(r=>r.inventoryId===f.raw.id)!
 expect(row.daysUntilStockOut).toBeNull();expect('calibrationRequired' in row&&row.calibrationRequired).toBe(true)
 expect(await getLowStockAlerts(f.store.id)).toEqual([])
 await f.observe(1)
 await prisma.config.create({data:{storeId:f.store.id,key:'inventoryPackage:'+f.raw.id,value:JSON.stringify({unit:'bag',quantity:3,baseUnit:'kg'}),category:'inventory'}})
 row=(await inventoryForecast(f.store.id,7,new Date('2026-10-20T12:00:00Z'))).find(r=>r.inventoryId===f.raw.id)!
 expect(row.suggestedReorderQty).toBe(6)
 const o=await f.order(new Date('2026-10-19T12:00:00Z'))
 await prisma.orderConsumptionSnapshot.create({data:{storeId:f.store.id,orderId:o.id,createdAt:o.createdAt,materials:'[]',issues:'[{"code":"BOM_MISSING"}]'}})
 row=(await inventoryForecast(f.store.id,7,new Date('2026-10-20T12:00:00Z'))).find(r=>r.inventoryId===f.raw.id)!
 expect(row.daysUntilStockOut).toBeNull();expect('recipeComplete' in row&&row.recipeComplete).toBe(false)
})
test('whole-store analysis requires two post-cutover counts and provides prepared-leftover conversion coefficients',async()=>{
 const f=await fixture();const opening=await f.observe(10)
 const row=(await physicalInventoryVariance({storeId:f.store.id,startDate:'2026-01-01',endDate:'2027-01-01'})).find(r=>r.inventoryId===f.raw.id)!
 expect(row.actualConsumption).toBeNull();expect(row.unavailableReason).toBe('TWO_PHYSICAL_OBSERVATIONS_REQUIRED')
 const options=opening.items[0].inventory.countEquivalents
 expect(options).toHaveLength(1);expect(options[0].unit).toBe('kg');expect(options[0].rawQuantity).toBeCloseTo(0.3)
})
