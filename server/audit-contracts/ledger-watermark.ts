import {expect,test} from '@jest/globals'
import {captureCountBoundary,COUNT_OBSERVATION_PREFIX} from '../src/utils/countObservation'
import {createInventoryCount,updateCountItem,completeInventoryCount} from '../src/services/InventoryCountService'
import {updateInventory as updateMaterial} from '../src/services/MaterialService'
import {updateInventory as updateInventoryMetadata} from '../src/services/InventoryService'
import {physicalInventoryVariance} from '../src/services/InventoryVarianceService'
export function ledgerWatermarkContract(db:any){
 test('more than5000 lifetime entries per direction permit constant-size observations and indexed period analysis',async()=>{
  const tenant=await db.tenant.create({data:{name:'Synthetic high history'}}),store=await db.store.create({data:{tenantId:tenant.id,name:'Synthetic'}}),inv=await db.inventory.create({data:{storeId:store.id,name:'Tea',category:'tea',unit:'kg',currentStock:100,avgCost:100}})
  for(let n=0;n<6;n++){
   await db.stockInLog.createMany({data:Array.from({length:1000},()=>({inventoryId:inv.id,quantity:1,unitCost:1,totalAmount:1,note:'Synthetic history'}))})
   await db.stockOutLog.createMany({data:Array.from({length:1000},()=>({inventoryId:inv.id,quantity:1,reason:'sold'}))})
  }
  await expect(updateMaterial(inv.id,{ledgerSequence:0} as any)).rejects.toThrow('INVENTORY_METADATA_FIELD_NOT_ALLOWED')
  await expect(updateMaterial(inv.id,{currentStock:999} as any)).rejects.toThrow('INVENTORY_METADATA_FIELD_NOT_ALLOWED')
  await expect(updateInventoryMetadata(inv.id,{ledgerEpoch:0} as any)).rejects.toThrow('INVENTORY_METADATA_FIELD_NOT_ALLOWED')
  await expect(db.$transaction(async(tx:any)=>{
   await tx.$executeRawUnsafe((process.env.DATABASE_URL||'').startsWith('file:')?'DROP TRIGGER "StockOutLog_ledger_insert"':'DROP TRIGGER "StockOutLog_ledger_insert" ON "StockOutLog"')
   await expect(captureCountBoundary(tx,inv.id)).rejects.toThrow('INVENTORY_LEDGER_MIGRATION_REQUIRED')
   throw Error('ROLLBACK_MISSING_TRIGGER_TEST')
  })).rejects.toThrow('ROLLBACK_MISSING_TRIGGER_TEST')
  const observed:any[]=[]
  async function count(quantity:number){
   const c=await createInventoryCount({storeId:store.id,period:'monthly',startDate:new Date(),endDate:new Date(Date.now()+86400000)})
   const current=await db.inventory.findUniqueOrThrow({where:{id:inv.id}})
   await updateCountItem(c.items[0].id,quantity,'staff',undefined,{storeId:store.id,countId:c.id,expectedStock:current.currentStock,observedVersion:current.updatedAt.toISOString()})
   const marker=await db.config.findUniqueOrThrow({where:{storeId_key:{storeId:store.id,key:COUNT_OBSERVATION_PREFIX+c.items[0].id}}})
   expect(marker.value.length).toBeLessThan(600);const snapshot=JSON.parse(marker.value);expect(snapshot.version).toBe(3);observed.push(snapshot.boundary)
   await completeInventoryCount(c.id,'manager',store.id)
  }
  await count(100)
  const before=await db.inventory.findUniqueOrThrow({where:{id:inv.id}})
  expect(before.ledgerSequence).toBe(12000n)
  await expect(db.$transaction(async(tx:any)=>{await tx.inventory.update({where:{id:inv.id},data:{currentStock:{decrement:7}}});await tx.stockOutLog.create({data:{inventoryId:inv.id,quantity:7,reason:'sold'}});throw Error('ROLLBACK_WATERMARK')})).rejects.toThrow('ROLLBACK_WATERMARK')
  expect((await db.inventory.findUniqueOrThrow({where:{id:inv.id}})).ledgerSequence).toBe(12000n)
  await db.$transaction(async(tx:any)=>{await tx.inventory.update({where:{id:inv.id},data:{currentStock:{decrement:20}}});await tx.stockOutLog.create({data:{inventoryId:inv.id,quantity:20,reason:'sold'}})})
  await count(80)
  expect(observed[1].sequence).toBe('12001')
  const filter={storeId:store.id,startDate:new Date(Date.now()-86400000).toISOString(),endDate:new Date(Date.now()+86400000).toISOString()}
  const rows=await physicalInventoryVariance(filter);expect(rows[0].theoreticalConsumption).toBe(20);expect(rows[0].actualConsumption).toBe(20);expect(rows[0].variance).toBe(0)
  const sqlite=process.env.DATABASE_URL?.startsWith('file:')
  const plan=sqlite?await db.$queryRawUnsafe('EXPLAIN QUERY PLAN SELECT * FROM "StockOutLog" WHERE "inventoryId"=? AND "ledgerSequence">? AND "ledgerSequence"<=? ORDER BY "ledgerSequence" LIMIT 1000',inv.id,12000,12001):await db.$queryRawUnsafe('EXPLAIN SELECT * FROM "StockOutLog" WHERE "inventoryId"=$1 AND "ledgerSequence">$2 AND "ledgerSequence"<=$3 ORDER BY "ledgerSequence" LIMIT 1000',inv.id,12000,12001)
  expect(JSON.stringify(plan,(_,v)=>typeof v==='bigint'?v.toString():v)).toContain('StockOutLog_inventoryId_ledgerSequence_key')
  // Rewriting any old ledger row invalidates old observations even when outside the time window.
  const old=await db.stockOutLog.findFirstOrThrow({where:{inventoryId:inv.id},orderBy:{ledgerSequence:'asc'}})
  await db.stockOutLog.update({where:{id:old.id},data:{quantity:2}})
  expect((await physicalInventoryVariance(filter))[0].unavailableReason).toBe('UNCERTIFIED_OBSERVATION_BOUNDARY')
  await db.stockOutLog.delete({where:{id:old.id}})
  expect((await db.inventory.findUniqueOrThrow({where:{id:inv.id}})).ledgerEpoch).toBe(2n)
  await expect(db.stockOutLog.create({data:{inventoryId:inv.id,quantity:1,reason:'sold',ledgerSequence:999999n}})).rejects.toThrow()
 },60000)
}
