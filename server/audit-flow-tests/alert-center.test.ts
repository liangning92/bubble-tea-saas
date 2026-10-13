import {beforeAll,afterAll,test,expect} from '@jest/globals'
import {randomUUID} from 'crypto'
import prisma from '../src/config/database'
import {upgradeLocalSqlite} from '../src/utils/sqliteUpgrade'
import {upgradeInventoryFlow} from '../src/utils/inventoryFlowUpgrade'
import {pgLedgerDDL,assertLedgerInstalled} from '../src/utils/inventoryLedger'
import {inventoryForecast} from '../src/services/InventoryForecastService'
import {getInventoryAlertConfig,saveInventoryAlertConfig} from '../src/services/InventoryAlertConfigService'
import {refreshInventoryAlerts,handleInventoryAlert,calculateInventoryAlerts} from '../src/services/InventoryAlertCenterService'
import {stockIn,stockOut} from '../src/services/InventoryService'
import {setBatchExpiry} from '../src/services/InventoryBatchService'
import {createPurchaseOrder,receivePurchaseOrder} from '../src/services/PurchaseOrderService'
import {calculateRestockSuggestions,checkLowStockAlerts,checkExpiryAlerts} from '../src/services/MaterialService'
import {FLOW_CUTOVER_KEY} from '../src/services/OrderConsumptionService'
import {startOfDay,addDays} from '../src/utils/dateUtils'
const now=new Date('2026-10-13T12:00:00+07:00')
beforeAll(async()=>{if(process.env.DATABASE_URL!.startsWith('file:'))await upgradeLocalSqlite(prisma,process.env.DATABASE_URL!);else{try{await assertLedgerInstalled(prisma,false)}catch{for(const sql of pgLedgerDDL)await prisma.$executeRawUnsafe(sql)}}await upgradeInventoryFlow(prisma,process.env.DATABASE_URL!)})
afterAll(()=>prisma.$disconnect())
async function fixture(stock=5){const tenant=await prisma.tenant.create({data:{name:'Synthetic alert tests'}}),store=await prisma.store.create({data:{tenantId:tenant.id,name:'Synthetic alert tests'}}),inventory=await prisma.inventory.create({data:{storeId:store.id,name:'Tea',category:'tea',unit:'kg',currentStock:stock,avgCost:10000,shelfLife:30}});await prisma.config.create({data:{storeId:store.id,key:FLOW_CUTOVER_KEY,category:'inventory',value:new Date('2026-08-01T00:00:00+07:00').toISOString()}});return {store,inventory}}
async function out(f:any,qty:number,date:string,reason='withdrawal'){return prisma.stockOutLog.create({data:{inventoryId:f.inventory.id,quantity:qty,reason,createdAt:new Date(date)}})}
test('short history divides by actual covered days including zero-use days; today and sales theory excluded',async()=>{
 const f=await fixture();await out(f,6,'2026-10-10T08:00:00+07:00');await out(f,3,'2026-10-12T08:00:00+07:00');await out(f,100,'2026-10-13T08:00:00+07:00');await out(f,500,'2026-10-11T08:00:00+07:00','sold')
 const [row]=await inventoryForecast(f.store.id,30,now);expect(row.historyDays).toBe(3);expect(row.totalUsage).toBe(9);expect(row.dailyUsage).toBe(3);expect(row.dynamicSafetyStock).toBe(45);expect(row.insufficientHistory).toBe(true)
 await prisma.inventory.update({where:{id:f.inventory.id},data:{safetyStock:50}});expect((await inventoryForecast(f.store.id,30,now))[0].effectiveSafetyStock).toBe(50)
})
test('rolling 30-day window includes zeros, does not divide by number of log rows',async()=>{
 const f=await fixture();await out(f,500,'2026-08-10T08:00:00+07:00');await out(f,30,'2026-10-12T08:00:00+07:00')
 const [row]=await inventoryForecast(f.store.id,30,now);expect(row.historyDays).toBe(30);expect(row.totalUsage).toBe(30);expect(row.dailyUsage).toBe(1);expect(row.dynamicSafetyStock).toBe(15)
})
test('one day history uses one day; empty history does not claim zero consumption is complete data',async()=>{
 const f=await fixture();expect((await inventoryForecast(f.store.id,30,now))[0].historyDays).toBe(0);expect((await calculateInventoryAlerts(f.store.id,now)).some(a=>a.type==='data_incomplete')).toBe(true)
 await out(f,4,'2026-10-12T23:59:00+07:00');expect((await inventoryForecast(f.store.id,30,now))[0].dailyUsage).toBe(4)
})
test('old default seven days upgrades to fifteen; explicit custom settings retained',async()=>{
 const f=await fixture();await prisma.config.create({data:{storeId:f.store.id,key:'inventory_alert_config',category:'inventory',value:JSON.stringify({lowStockWarningDays:7})}});expect((await getInventoryAlertConfig(f.store.id)).lowStockWarningDays).toBe(15)
 await saveInventoryAlertConfig(f.store.id,{lowStockWarningDays:7});expect((await getInventoryAlertConfig(f.store.id)).lowStockWarningDays).toBe(7)
 await expect(saveInventoryAlertConfig(f.store.id,{lossCriticalPercent:5})).rejects.toThrow()
})
test('alerts deduplicate, handled notes persist, escalation reopens, recovery resolves and store scope holds',async()=>{
 const f=await fixture(10);await out(f,1,'2026-10-12T08:00:00+07:00');let result=await refreshInventoryAlerts(f.store.id,now);const warning=result.list.find(a=>a.type==='low_stock')!;expect(warning.severity).toBe('warning')
 await handleInventoryAlert(f.store.id,warning.id,'manager','Ordered replacement');await refreshInventoryAlerts(f.store.id,now);result=await refreshInventoryAlerts(f.store.id,now);expect(result.list.filter(a=>a.type==='low_stock')).toHaveLength(1);expect(result.list.find(a=>a.id===warning.id)?.status).toBe('handled')
 const other=await fixture();await expect(handleInventoryAlert(other.store.id,warning.id,'manager','foreign')).rejects.toThrow('NOT_FOUND');await expect(handleInventoryAlert(f.store.id,warning.id,'manager',' ')).rejects.toThrow('NOTE_REQUIRED')
 await prisma.inventory.update({where:{id:f.inventory.id},data:{currentStock:2}});result=await refreshInventoryAlerts(f.store.id,now);expect(result.list.find(a=>a.id===warning.id)?.status).toBe('open');expect(result.list.find(a=>a.id===warning.id)?.severity).toBe('critical')
 await prisma.inventory.update({where:{id:f.inventory.id},data:{currentStock:40}});result=await refreshInventoryAlerts(f.store.id,now);expect(result.list.find(a=>a.id===warning.id)?.status).toBe('resolved')
})
test('in-transit stock does not count as on-hand; arrival, overdue and loss alerts calculated independently',async()=>{
 const f=await fixture(2);await out(f,8,'2026-10-11T08:00:00+07:00');await out(f,2,'2026-10-12T08:00:00+07:00','loss')
 await createPurchaseOrder({storeId:f.store.id,source:'online',createdBy:'staff',expectedDate:new Date('2026-10-16T00:00:00+07:00'),items:[{inventoryId:f.inventory.id,quantity:100,unitCost:10000}]});await createPurchaseOrder({storeId:f.store.id,source:'online',createdBy:'staff',expectedDate:new Date('2026-10-12T00:00:00+07:00'),items:[{inventoryId:f.inventory.id,quantity:1,unitCost:10000}]})
 const alerts=await calculateInventoryAlerts(f.store.id,now);expect(alerts.find(a=>a.type==='arrival_shortage')?.severity).toBe('critical');expect(alerts.some(a=>a.type==='purchase_overdue')).toBe(true);expect(alerts.find(a=>a.type==='excessive_loss')?.severity).toBe('critical');expect((await inventoryForecast(f.store.id,30,now))[0].currentStock).toBe(2)
})
test('real batch expiry consumes oldest expiry, does not warn on fully used batches or duplicate receipt',async()=>{
 const f=await fixture(0),op=randomUUID();await stockIn({storeId:f.store.id,inventoryId:f.inventory.id,quantity:2,reason:'purchase',unitCost:10000,staffId:'staff',operationId:op,expiryDate:'2026-10-14'});await stockIn({storeId:f.store.id,inventoryId:f.inventory.id,quantity:2,reason:'purchase',unitCost:10000,staffId:'staff',operationId:op,expiryDate:'2026-10-14'})
 expect((await calculateInventoryAlerts(f.store.id,now)).some(a=>a.type==='expiry_batch')).toBe(true);expect(await prisma.batch.count({where:{inventoryId:f.inventory.id}})).toBe(1)
 await stockOut({storeId:f.store.id,inventoryId:f.inventory.id,quantity:2,reason:'withdrawal',staffId:'staff',operationId:randomUUID()});expect((await calculateInventoryAlerts(f.store.id,now)).some(a=>a.type==='expiry_batch')).toBe(false);expect((await calculateInventoryAlerts(f.store.id,now)).some(a=>a.type==='out_of_stock')).toBe(true)
})
test('optional receipt dates are atomic, existing undated balances can be dated without increasing stock',async()=>{
 const f=await fixture(3),order=await createPurchaseOrder({storeId:f.store.id,source:'online',createdBy:'staff',items:[{inventoryId:f.inventory.id,quantity:2,unitCost:10000}]})
 await expect(receivePurchaseOrder(order.id,'staff',f.store.id,[{itemId:order.items[0].id,expiryDate:'2026-02-30'}])).rejects.toThrow();expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock).toBe(3);expect((await prisma.purchaseOrder.findUniqueOrThrow({where:{id:order.id}})).status).toBe('awaiting_receipt')
 await receivePurchaseOrder(order.id,'staff',f.store.id,[{itemId:order.items[0].id,expiryDate:'2026-11-01'}]);const balance=(await prisma.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock;const logs=await prisma.stockInLog.count({where:{inventoryId:f.inventory.id}})
 const undated=await prisma.batch.findFirstOrThrow({where:{inventoryId:f.inventory.id,expiryDate:null}});await setBatchExpiry(f.store.id,f.inventory.id,undated.id,'2026-11-10');expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock).toBe(balance);expect(await prisma.stockInLog.count({where:{inventoryId:f.inventory.id}})).toBe(logs)
 await expect(setBatchExpiry(f.store.id,f.inventory.id,undated.id,'')).rejects.toThrow('EXPIRY_DATE_REQUIRED');const other=await fixture();await expect(setBatchExpiry(other.store.id,f.inventory.id,undefined,'2026-11-10')).rejects.toThrow('NOT_FOUND')
})
test('loss threshold equality alerts, overstock boundary does not; current-day activity clears stagnant warnings',async()=>{
 const f=await fixture(60);await out(f,27,'2026-09-13T08:00:00+07:00');await out(f,3,'2026-10-12T08:00:00+07:00','expired');let alerts=await calculateInventoryAlerts(f.store.id,now);expect(alerts.find(a=>a.type==='excessive_loss')?.severity).toBe('warning');expect(alerts.some(a=>a.type==='overstock')).toBe(false)
 await prisma.inventory.update({where:{id:f.inventory.id},data:{currentStock:61}});expect((await calculateInventoryAlerts(f.store.id,now)).some(a=>a.type==='overstock')).toBe(true)
 const inactive=await fixture(10);await out(inactive,1,'2026-08-10T08:00:00+07:00');expect((await calculateInventoryAlerts(inactive.store.id,now)).some(a=>a.type==='stagnant_stock')).toBe(true);await out(inactive,1,'2026-10-13T09:00:00+07:00');expect((await calculateInventoryAlerts(inactive.store.id,now)).some(a=>a.type==='stagnant_stock')).toBe(false)
})
test('threshold changes reclassify stored comparisons immediately without rewriting frozen consumption',async()=>{
 const f=await fixture();await prisma.consumptionAlert.create({data:{storeId:f.store.id,inventoryId:f.inventory.id,businessDate:'2026-10-12',status:'normal',detail:JSON.stringify({inventoryId:f.inventory.id,inventoryName:'Tea',unit:'kg',theoreticalConsumption:10,actualConsumption:11,varianceStatus:'normal'})}})
 expect((await calculateInventoryAlerts(f.store.id,now)).find(a=>a.type==='consumption_variance')?.severity).toBe('warning');await saveInventoryAlertConfig(f.store.id,{varianceWarningPercent:15,varianceCriticalPercent:30});expect((await calculateInventoryAlerts(f.store.id,now)).some(a=>a.type==='consumption_variance')).toBe(false)
})

test('secondary restock and low stock pages use the same short-history safety floor',async()=>{
 const f=await fixture(2);await out(f,4,addDays(startOfDay(new Date()),-1).toISOString());await prisma.inventory.update({where:{id:f.inventory.id},data:{minStock:80}})
 const [row]=await calculateRestockSuggestions(f.store.id,7);expect(row.dailyUsage).toBe(4);expect(row.targetStock).toBe(80);expect(row.suggestQty).toBe(78);expect((await checkLowStockAlerts(f.store.id))[0].safetyStock).toBe(80)
 await stockIn({storeId:f.store.id,inventoryId:f.inventory.id,quantity:1,reason:'purchase',staffId:'staff',operationId:randomUUID(),expiryDate:'2026-10-01'});expect((await checkExpiryAlerts(f.store.id,7)).length).toBe(1)
})
test('configured store timezone controls completed days and DST consumption boundaries',async()=>{
 const f=await fixture(10);await prisma.config.update({where:{storeId_key:{storeId:f.store.id,key:FLOW_CUTOVER_KEY}},data:{value:'2026-01-01T00:00:00Z'}});await prisma.config.create({data:{storeId:f.store.id,key:'storeInfo',category:'store',value:JSON.stringify({timezone:'America/New_York'})}})
 await out(f,6,'2026-03-07T15:00:00Z');await out(f,3,'2026-03-08T16:00:00Z');await out(f,100,'2026-03-09T10:00:00Z');const [row]=await inventoryForecast(f.store.id,30,new Date('2026-03-09T12:00:00Z'));expect(row.historyDays).toBe(2);expect(row.dailyUsage).toBe(4.5);expect(row.historyEnd).toBe('2026-03-09T04:00:00.000Z')
 const {employeeConsumption,checkConsumptionDay}=await import('../src/services/EmployeeConsumptionService');await prisma.orderConsumptionSnapshot.create({data:{storeId:f.store.id,orderId:randomUUID(),createdAt:new Date('2026-03-09T02:00:00Z'),materials:JSON.stringify([{inventoryId:f.inventory.id,name:'Tea',quantity:2,unit:'kg'}]),issues:'[]'}});const report=await employeeConsumption({storeId:f.store.id,startDate:'2026-03-08',endDate:'2026-03-08'});expect(report.list[0].theoreticalConsumption).toBe(2);expect(Date.parse(report.list[0].windowEnd)-Date.parse(report.list[0].windowStart)+1).toBe(23*3600000);await expect(checkConsumptionDay(f.store.id,'2026-03-08',new Date('2026-03-09T03:00:00Z'))).rejects.toThrow('BUSINESS_DAY_NOT_CLOSED');await checkConsumptionDay(f.store.id,'2026-03-08',new Date('2026-03-09T04:00:00Z'))
})
