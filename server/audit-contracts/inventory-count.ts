import {expect,test} from '@jest/globals'
import {createInventoryCount,updateCountItem,completeInventoryCount,cancelInventoryCount} from '../src/services/InventoryCountService'
import {physicalInventoryVariance} from '../src/services/InventoryVarianceService'
import {saveInventoryAlertConfig} from '../src/services/InventoryAlertConfigService'
import {getLowStockAlerts,getMaterialUsageForecast} from '../src/services/BomService'
import {COUNT_OBSERVATION_PREFIX} from '../src/utils/countObservation'
export function inventoryCountContract(db:any){
 async function fixture(){const tenant=await db.tenant.create({data:{name:'Synthetic count'}}),store=await db.store.create({data:{tenantId:tenant.id,name:'Synthetic'}}),inventory=await db.inventory.create({data:{storeId:store.id,name:'Tea',category:'tea',unit:'kg',currentStock:100,avgCost:200}});return {store,inventory}}
 const session=(s:string)=>createInventoryCount({storeId:s,period:'monthly',startDate:new Date('2026-01-01'),endDate:new Date('2026-12-31')})
 async function observe(f:any,c:any,quantity:number,note='Physical recount'){const inv=await db.inventory.findUniqueOrThrow({where:{id:f.inventory.id}});return updateCountItem(c.items[0].id,quantity,'actual-staff',note,{countId:c.id,storeId:f.store.id,expectedStock:inv.currentStock,observedVersion:inv.updatedAt.toISOString()})}
 test('count observation rejects stale revision and completion preserves subsequent sales, once only',async()=>{
  const f=await fixture(),c=await session(f.store.id)
  await expect(session(f.store.id)).rejects.toThrow('COUNT_ALREADY_ACTIVE')
  await db.inventory.update({where:{id:f.inventory.id},data:{currentStock:{decrement:10},updatedAt:new Date(Date.now()+1000)}})
  await expect(updateCountItem(c.items[0].id,98,'staff','recount',{countId:c.id,storeId:f.store.id,expectedStock:100,observedVersion:f.inventory.updatedAt.toISOString()})).rejects.toThrow('COUNT_REFRESH_REQUIRED')
  const item=await observe(f,c,88);expect(item.systemQty).toBe(90);expect(item.variance).toBe(-2)
  await db.inventory.update({where:{id:f.inventory.id},data:{currentStock:{decrement:5}}})
  const done=await completeInventoryCount(c.id,'manager',f.store.id)
  expect(done.items[0].inventory.currentStock).toBe(83);expect(done.items[0].movementSinceObservation).toBe(-5)
  await expect(completeInventoryCount(c.id,'manager',f.store.id)).rejects.toThrow('COUNT_NOT_ACTIVE')
  const logs=await db.stockOutLog.findMany({where:{inventoryId:f.inventory.id}});expect(logs).toHaveLength(1);expect(logs[0].quantity).toBe(2);expect(logs[0].reason).toBe('count_adjustment')
 })
 test('count gain requires reason, protects store/item boundaries, and cancel returns items',async()=>{
  const f=await fixture(),other=await fixture(),c=await session(f.store.id)
  await expect(observe(f,c,102,'')).rejects.toThrow('COUNT_VARIANCE_REASON_REQUIRED')
  await expect(completeInventoryCount(c.id,'manager',other.store.id)).rejects.toThrow('COUNT_NOT_ACTIVE')
  await expect(updateCountItem(c.items[0].id,102,'staff','test',{countId:'wrong',storeId:f.store.id,expectedStock:100,observedVersion:f.inventory.updatedAt.toISOString()})).rejects.toThrow('COUNT_NOT_ACTIVE')
  await observe(f,c,102);await completeInventoryCount(c.id,'manager',f.store.id)
  expect((await db.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock).toBe(102)
  expect((await db.stockOutLog.findFirstOrThrow({where:{inventoryId:f.inventory.id}})).quantity).toBe(-2)
  const next=await session(other.store.id);expect((await cancelInventoryCount(next.id,other.store.id)).items).toHaveLength(1)
 })
 test('legacy pending count cannot apply an unverified historical difference',async()=>{
  const f=await fixture(),c=await session(f.store.id)
  await db.inventoryCountItem.update({where:{id:c.items[0].id},data:{countedQty:90,variance:-10,countedAt:new Date(),countedBy:'old',note:'old'}})
  await expect(completeInventoryCount(c.id,'manager',f.store.id)).rejects.toThrow('COUNT_REOBSERVATION_REQUIRED')
  expect((await db.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock).toBe(100)
 })
 test('overlapping approval applies one adjustment and failed ledger insert rolls back all changes',async()=>{
  const f=await fixture(),c=await session(f.store.id);await observe(f,c,95)
  const sqlite=process.env.DATABASE_URL?.startsWith('file:')
  if(sqlite){
   await db.$executeRawUnsafe("CREATE TRIGGER audit_fail_count BEFORE INSERT ON StockOutLog WHEN NEW.reason='count_adjustment' BEGIN SELECT RAISE(ABORT,'synthetic count failure'); END")
   try{await expect(completeInventoryCount(c.id,'manager',f.store.id)).rejects.toThrow();expect((await db.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock).toBe(100);expect((await db.inventoryCount.findUniqueOrThrow({where:{id:c.id}})).status).toBe('in_progress')}
   finally{await db.$executeRawUnsafe('DROP TRIGGER audit_fail_count')}
  }
  const results=await Promise.allSettled([completeInventoryCount(c.id,'manager',f.store.id),completeInventoryCount(c.id,'manager',f.store.id)])
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  expect((await db.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock).toBe(95)
  expect(await db.stockOutLog.count({where:{inventoryId:f.inventory.id,reason:'count_adjustment'}})).toBe(1)
 })
 async function certifyFixture(f:any){
  const items=await db.inventoryCountItem.findMany({where:{inventoryId:f.inventory.id},orderBy:{countedAt:'asc'}})
  const inv=await db.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})
  for(const item of items){const logs=[...(await db.stockInLog.findMany({where:{inventoryId:f.inventory.id,createdAt:{lt:item.countedAt}}})),...(await db.stockOutLog.findMany({where:{inventoryId:f.inventory.id,createdAt:{lt:item.countedAt}}}))];const sequence=logs.reduce((max,l)=>l.ledgerSequence!==null&&l.ledgerSequence>max?l.ledgerSequence:max,0n);const boundary={inventoryId:f.inventory.id,sequence:sequence.toString(),epoch:inv.ledgerEpoch.toString()}
   const key=COUNT_OBSERVATION_PREFIX+item.id,value=JSON.stringify({version:3,countId:item.inventoryCountId,countedQty:item.countedQty,observedAt:item.countedAt.toISOString(),ledgerUnit:'kg',boundary})
   await db.config.upsert({where:{storeId_key:{storeId:f.store.id,key}},create:{storeId:f.store.id,key,value,category:'inventory'},update:{value}})
  }
 }
 async function baseline(close=85){const f=await fixture();for(const [date,qty] of [['2026-02-01T01:00:00Z',100],['2026-02-03T01:00:00Z',close]] as const){await db.inventoryCount.create({data:{storeId:f.store.id,period:'monthly',startDate:new Date(date),endDate:new Date(date),status:'completed',items:{create:{inventoryId:f.inventory.id,systemQty:qty,countedQty:qty,countedAt:new Date(date),countedBy:'physical-staff',variance:0}}}})}
  const createdAt=new Date('2026-02-02T01:00:00Z')
  await db.stockInLog.create({data:{inventoryId:f.inventory.id,quantity:10,unitCost:200,totalAmount:2000,note:JSON.stringify({kind:'receipt'}),createdAt}})
  for(const [reason,quantity] of [['sold',22],['refund_unprepared',-2],['loss',1],['transfer',1],['process',3],['count_adjustment',7]] as const)await db.stockOutLog.create({data:{inventoryId:f.inventory.id,reason,quantity,createdAt}})
  await certifyFixture(f);return f
 }
 const analysis=async(f:any)=>(await physicalInventoryVariance({storeId:f.store.id,startDate:'2026-02-01',endDate:'2026-02-04'}))[0]
 test('physical variance uses independent observations and excludes known loss/transfer/process and count adjustments',async()=>{
  const f=await baseline();const row=await analysis(f)
  expect(row.theoreticalConsumption).toBe(20);expect(row.actualConsumption).toBe(20);expect(row.knownNonSaleOut).toBe(5);expect(row.variance).toBe(0);expect(row.varianceStatus).toBe('normal')
 })
 test('variance warning/critical thresholds are independent, inclusive and disable-able',async()=>{
  const f=await baseline(82);await saveInventoryAlertConfig(f.store.id,{varianceWarningPercent:10,varianceCriticalPercent:35,autoCheckIntervalHours:6})
  let row=await analysis(f);expect(row.variancePercent).toBe(15);expect(row.varianceStatus).toBe('warning');expect(row.varianceAmountEstimate).toBe(600);expect(row.refreshHours).toBe(6)
  await db.inventoryCountItem.updateMany({where:{inventoryId:f.inventory.id,countedQty:82},data:{countedQty:78}})
  await certifyFixture(f);row=await analysis(f);expect(row.variancePercent).toBe(35);expect(row.varianceStatus).toBe('critical')
  await saveInventoryAlertConfig(f.store.id,{enableConsumptionAlert:false});expect((await analysis(f)).varianceStatus).toBe('normal')
 })
 test('missing observations, unknown movement and zero theoretical denominator never invent a percentage',async()=>{
  const missing=await fixture();expect((await analysis(missing)).actualConsumption).toBeNull();expect((await analysis(missing)).varianceStatus).toBe('unavailable')
  const f=await baseline(82);await db.stockOutLog.create({data:{inventoryId:f.inventory.id,quantity:1,reason:'manual',createdAt:new Date('2026-02-02T02:00:00Z')}})
  await certifyFixture(f);expect((await analysis(f)).unavailableReason).toBe('UNCLASSIFIED_MOVEMENTS')
  const zero=await baseline(82);await db.stockOutLog.updateMany({where:{inventoryId:zero.inventory.id,reason:'sold'},data:{quantity:2}})
  await certifyFixture(zero);expect((await analysis(zero)).variancePercent).toBeNull();expect((await analysis(zero)).unavailableReason).toBe('ZERO_THEORETICAL_BASELINE')
 })
 test('positive bookkeeping adjustment is not a receipt; legacy boundary is unavailable',async()=>{
  const f=await baseline(80)
  await db.stockInLog.updateMany({where:{inventoryId:f.inventory.id},data:{quantity:5,note:'Adjustment: bookkeeping'}})
  await db.stockOutLog.updateMany({where:{inventoryId:f.inventory.id,reason:{notIn:['sold','refund_unprepared']}},data:{quantity:0}})
  await certifyFixture(f)
  const row=await analysis(f);expect(row.receipts).toBe(0);expect(row.actualConsumption).toBeNull();expect(row.unavailableReason).toBe('UNCLASSIFIED_MOVEMENTS')
  // Old timestamp arithmetic would falsely infer25 vs20, a25% difference.
  expect((100+5-80-20)/20*100).toBe(25)
  await db.config.deleteMany({where:{storeId:f.store.id,key:{startsWith:COUNT_OBSERVATION_PREFIX}}})
  expect((await analysis(f)).unavailableReason).toBe('UNCERTIFIED_OBSERVATION_BOUNDARY')
 })
 test('low stock uses recorded ledger units and saved thresholds, enable and validated interval',async()=>{
  const f=await fixture();await db.inventory.update({where:{id:f.inventory.id},data:{currentStock:5}})
  await db.stockOutLog.create({data:{inventoryId:f.inventory.id,quantity:30,reason:'sold'}})
  await saveInventoryAlertConfig(f.store.id,{lowStockWarningDays:6,lowStockCriticalDays:2,autoCheckIntervalHours:8})
  expect((await getMaterialUsageForecast(f.store.id,30))[0].dailyUsage).toBe(1)
  expect((await getLowStockAlerts(f.store.id,30))[0].urgency).toBe('warning')
  await db.inventory.update({where:{id:f.inventory.id},data:{currentStock:2}});expect((await getLowStockAlerts(f.store.id,30))[0].urgency).toBe('critical')
  await saveInventoryAlertConfig(f.store.id,{enableLowStockAlert:false});expect(await getLowStockAlerts(f.store.id,30)).toEqual([])
  await expect(saveInventoryAlertConfig(f.store.id,{lowStockCriticalDays:99})).rejects.toThrow();await expect(saveInventoryAlertConfig(f.store.id,{autoCheckIntervalHours:0})).rejects.toThrow()
 })
}
