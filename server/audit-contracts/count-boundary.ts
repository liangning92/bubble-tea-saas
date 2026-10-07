import {randomUUID} from 'crypto'
import {expect,test} from '@jest/globals'
import {captureCountBoundary,COUNT_OBSERVATION_PREFIX} from '../src/utils/countObservation'
import {physicalInventoryVariance} from '../src/services/InventoryVarianceService'
export function countBoundaryContract(db:any){
 test('stock-lock membership handles sales beginning before opening and closing observations',async()=>{
  const tenant=await db.tenant.create({data:{name:'Synthetic boundary'}}),store=await db.store.create({data:{tenantId:tenant.id,name:'Synthetic'}}),inventory=await db.inventory.create({data:{storeId:store.id,name:'Tea',category:'tea',unit:'kg',currentStock:100}})
  const sqlite=process.env.DATABASE_URL?.startsWith('file:');const logs:any[]=[];const observations:any[]=[]
  async function observeWithWaitingSale(physical:number,quantity:number){
   let began!:()=>void;const started=new Promise<void>(r=>began=r);let sale:any,pid:number|undefined,startedAt:Date
   await db.$transaction(async(tx:any)=>{
    // This is the same inventory write lock and production snapshot helper as observation submission.
    await tx.inventory.update({where:{id:inventory.id},data:{currentStock:{increment:0}}})
    if(!sqlite){
     sale=db.$transaction(async(other:any)=>{await other.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");const [info]=await other.$queryRawUnsafe('SELECT pg_backend_pid() AS pid, CURRENT_TIMESTAMP AS stamp');pid=info.pid;startedAt=info.stamp;began();await other.inventory.update({where:{id:inventory.id},data:{currentStock:{decrement:quantity}}});const id=randomUUID();await other.$executeRawUnsafe('INSERT INTO "StockOutLog" ("id","inventoryId","quantity","reason") VALUES ($1,$2,$3,$4)',id,inventory.id,quantity,'sold');return other.stockOutLog.findUniqueOrThrow({where:{id}})},{timeout:15000})
     await started
     let blocked=false
     for(let n=0;n<100;n++){const rows=await tx.$queryRawUnsafe('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',pid);if(rows[0]?.wait_event_type==='Lock'){blocked=true;break}await new Promise(r=>setTimeout(r,5))}
     expect(blocked).toBe(true)
    }else{startedAt=new Date(Date.now()-1000)}
    const boundary=await captureCountBoundary(tx,inventory.id),observedAt=new Date()
    const count=await tx.inventoryCount.create({data:{storeId:store.id,period:'monthly',startDate:observedAt,endDate:observedAt,status:'completed',items:{create:{inventoryId:inventory.id,systemQty:physical,countedQty:physical,countedAt:observedAt,countedBy:'staff',variance:0}}},include:{items:true}})
    await tx.config.create({data:{storeId:store.id,key:COUNT_OBSERVATION_PREFIX+count.items[0].id,category:'inventory',value:JSON.stringify({version:3,countId:count.id,countedQty:physical,observedAt:observedAt.toISOString(),ledgerUnit:'kg',boundary})}})
    observations.push(observedAt)
   },{timeout:15000})
   if(sqlite){
    // SQLite serializes writers. Replay an explicitly older imported timestamp after the snapshot;
    // membership must remain correct even though timestamps cannot provide the order.
    sale=db.$transaction(async(tx:any)=>{await tx.inventory.update({where:{id:inventory.id},data:{currentStock:{decrement:quantity}}});return tx.stockOutLog.create({data:{inventoryId:inventory.id,quantity,reason:'sold',createdAt:startedAt!}})})
   }
   const log=await sale;expect(log.createdAt.getTime()).toBeLessThanOrEqual(observations[observations.length-1].getTime());logs.push(log)
  }
  await observeWithWaitingSale(100,20)
  await new Promise(r=>setTimeout(r,10))
  await observeWithWaitingSale(80,5)
  const rows=await physicalInventoryVariance({storeId:store.id,startDate:new Date(Date.now()-86400000).toISOString(),endDate:new Date(Date.now()+86400000).toISOString()})
  expect(rows[0].theoreticalConsumption).toBe(20);expect(rows[0].actualConsumption).toBe(20);expect(rows[0].variance).toBe(0);expect(rows[0].varianceStatus).toBe('normal')
  // A time-window query omits the20-unit opening waiter and includes the5-unit closing waiter.
  const timestampRows=await db.stockOutLog.findMany({where:{inventoryId:inventory.id,createdAt:{gte:observations[0],lte:observations[1]}}})
  if(!sqlite)expect(timestampRows.map((l:any)=>l.id)).toEqual([logs[1].id])
 })
}
