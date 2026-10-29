import {beforeAll,afterAll,test,expect} from '@jest/globals'
import {randomUUID} from 'crypto'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../src/config/database'
import {upgradeLocalSqlite} from '../src/utils/sqliteUpgrade'
import {upgradeInventoryFlow} from '../src/utils/inventoryFlowUpgrade'
import {declareAccessRoutes} from '../src/middlewares/staffAccessV2'
import {inventoryCountRouter} from '../src/routes/inventoryCount'
import {config} from '../src/config/env'
import {createInventoryCount,updateCountItems,submitInventoryCount,returnInventoryCount,completeInventoryCount,getInventoryCountById,cancelInventoryCount} from '../src/services/InventoryCountService'
import {isInternalConfig} from '../src/utils/configAccess'
beforeAll(async()=>{await upgradeLocalSqlite(prisma,process.env.DATABASE_URL!);await upgradeInventoryFlow(prisma,process.env.DATABASE_URL!)})
afterAll(async()=>{await prisma.$disconnect()})
async function fixture(period:'ad_hoc'|'monthly'='ad_hoc'){
 const tenant=await prisma.tenant.create({data:{name:'Synthetic count return'}}),store=await prisma.store.create({data:{tenantId:tenant.id,name:'Synthetic count return'}})
 const materials=await Promise.all([10,20].map((q,i)=>prisma.inventory.create({data:{storeId:store.id,name:'Material '+i,category:'ingredient',unit:'kg',currentStock:q,avgCost:1000}})))
 const count=await createInventoryCount({storeId:store.id,period,startDate:new Date(),endDate:new Date()})
 const observations=count.items.map((i:any)=>({itemId:i.id,countedQty:i.inventory.currentStock-1,expectedStock:i.inventory.currentStock,observedVersion:i.inventory.updatedAt.toISOString(),note:'Original observation'}))
 await updateCountItems(count.id,store.id,'counter',observations)
 await submitInventoryCount(count.id,store.id)
 return {store,count,materials}
}
test('return preserves all observations, records reason and evidence, and never changes stock',async()=>{
 const f=await fixture(),before=await prisma.inventoryCountItem.findMany({where:{inventoryCountId:f.count.id},orderBy:{id:'asc'}})
 const stock=await prisma.inventory.findMany({where:{storeId:f.store.id},orderBy:{id:'asc'}})
 const result=await returnInventoryCount(f.count.id,f.store.id,'reviewer','  Recheck first material  ')
 expect(result.status).toBe('in_progress')
 expect(await prisma.inventoryCountItem.findMany({where:{inventoryCountId:f.count.id},orderBy:{id:'asc'}})).toEqual(before)
 expect(await prisma.inventory.findMany({where:{storeId:f.store.id},orderBy:{id:'asc'}})).toEqual(stock)
 expect(await prisma.stockOutLog.count({where:{inventoryId:{in:f.materials.map(i=>i.id)}}})).toBe(0)
 const detail=await getInventoryCountById(f.count.id,f.store.id)
 expect(detail.reviewHistory).toEqual([expect.objectContaining({reason:'Recheck first material',returnedBy:'reviewer'})])
 expect(JSON.stringify(detail.reviewHistory)).not.toContain('Original observation')
 const key='inventory.count-review.'+f.count.id
 expect(isInternalConfig(key)).toBe(true)
 const audit=JSON.parse((await prisma.config.findUniqueOrThrow({where:{storeId_key:{storeId:f.store.id,key}}})).value)
 expect(audit[0].items.map((i:any)=>i.countedQty).sort((a:number,b:number)=>a-b)).toEqual([9,19])
})
test('correct one item, preserve other observations and later movement; resubmit then adjust exactly once',async()=>{
 const f=await fixture(),first=f.count.items[0],second=f.count.items[1]
 await returnInventoryCount(f.count.id,f.store.id,'reviewer','Fix quantity')
 await prisma.inventory.update({where:{id:first.inventoryId},data:{currentStock:{decrement:2}}})
 const live=await prisma.inventory.findUniqueOrThrow({where:{id:first.inventoryId}})
 await updateCountItems(f.count.id,f.store.id,'counter',[{itemId:first.id,countedQty:live.currentStock-3,expectedStock:live.currentStock,observedVersion:live.updatedAt.toISOString(),note:'Rechecked now'}])
 await expect(completeInventoryCount(f.count.id,'reviewer',f.store.id)).rejects.toThrow('COUNT_SUBMIT_REQUIRED')
 await submitInventoryCount(f.count.id,f.store.id)
 // A second return retains the previous snapshot and captures the corrected submission.
 await returnInventoryCount(f.count.id,f.store.id,'reviewer','Confirmed correction; resubmit')
 expect((await getInventoryCountById(f.count.id,f.store.id)).reviewHistory).toHaveLength(2)
 await submitInventoryCount(f.count.id,f.store.id)
 await prisma.inventory.update({where:{id:first.inventoryId},data:{currentStock:{decrement:1}}})
 await completeInventoryCount(f.count.id,'reviewer',f.store.id)
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:first.inventoryId}})).currentStock).toBe(live.currentStock-4)
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:second.inventoryId}})).currentStock).toBe(second.inventory.currentStock-1)
 await expect(completeInventoryCount(f.count.id,'reviewer',f.store.id)).rejects.toThrow('COUNT_NOT_ACTIVE')
 await expect(returnInventoryCount(f.count.id,f.store.id,'reviewer','again')).rejects.toThrow('COUNT_NOT_ACTIVE')
})
test('wrong store, blank reason, draft, completed and cancelled states cannot return',async()=>{
 const f=await fixture('monthly'),other=await fixture()
 await expect(returnInventoryCount(f.count.id,other.store.id,'reviewer','x')).rejects.toThrow('COUNT_NOT_ACTIVE')
 for(const reason of ['','   ','x'.repeat(1001)])await expect(returnInventoryCount(f.count.id,f.store.id,'reviewer',reason)).rejects.toThrow('COUNT_RETURN_REASON_REQUIRED')
 await returnInventoryCount(f.count.id,f.store.id,'reviewer','Fix')
 await expect(returnInventoryCount(f.count.id,f.store.id,'reviewer','again')).rejects.toThrow('COUNT_NOT_ACTIVE')
 await expect(completeInventoryCount(f.count.id,'reviewer',f.store.id)).rejects.toThrow('COUNT_SUBMIT_REQUIRED')
 await cancelInventoryCount(f.count.id,f.store.id)
 await expect(returnInventoryCount(f.count.id,f.store.id,'reviewer','again')).rejects.toThrow('COUNT_NOT_ACTIVE')
})
test('HTTP reviewer permissions, validation and store boundary fail closed',async()=>{
 const f=await fixture(),other=await fixture(),app=express();app.use(express.json());app.use('/api/inventory-counts',declareAccessRoutes('/api/inventory-counts',inventoryCountRouter))
 async function token(role:string,storeId=f.store.id){const user=await prisma.user.create({data:{storeId,phone:randomUUID(),password:'synthetic',role}});return jwt.sign({id:user.id,phone:user.phone,role,storeId,staffId:'',issuedAtMs:Date.now()+1000},config.jwt.secret)}
 const httpServer=await new Promise<import('http').Server>(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server))});
 try {
 const url='/api/inventory-counts/'+f.count.id+'/return',admin=await token('admin')
 expect((await request(httpServer).post(url).send({reason:'Fix'})).status).toBe(401)
 expect((await request(httpServer).post(url).set('Authorization','Bearer '+await token('staff')).send({reason:'Fix'})).status).toBe(403)
 expect((await request(httpServer).post(url).set('Authorization','Bearer '+await token('manager',other.store.id)).send({reason:'Fix'})).status).toBe(409)
 expect((await request(httpServer).post(url).set('Authorization','Bearer '+admin).send({reason:'  '})).status).toBe(400)
 expect((await request(httpServer).post(url).set('Authorization','Bearer '+admin).send({reason:'Fix material'})).status).toBe(200)
 expect((await request(httpServer).post(url).set('Authorization','Bearer '+admin).send({reason:'again'})).status).toBe(409)
 }finally{await new Promise<void>(resolve=>httpServer.close(()=>resolve()))}
})
