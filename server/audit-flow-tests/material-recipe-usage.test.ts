import {beforeAll,afterAll,test,expect} from '@jest/globals'
import {randomUUID} from 'crypto'
import prisma from '../src/config/database'
import {upgradeLocalSqlite} from '../src/utils/sqliteUpgrade'
import {upgradeInventoryFlow} from '../src/utils/inventoryFlowUpgrade'
import {materialRecipeUsage} from '../src/services/MaterialRecipeUsageService'
import {createRecipe} from '../src/services/ProcessRecipeService'
import {appendConsumptionCorrection} from '../src/services/ConsumptionEvidenceService'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import {config} from '../src/config/env'
import {inventoryRouter} from '../src/routes/inventory'
import {declareAccessRoutes} from '../src/middlewares/staffAccessV2'
beforeAll(async()=>{await upgradeLocalSqlite(prisma,process.env.DATABASE_URL!);await upgradeInventoryFlow(prisma,process.env.DATABASE_URL!)})
afterAll(async()=>{await prisma.$disconnect()})
const now=new Date('2026-11-01T12:00:00Z')
async function fixture(){
 const tenant=await prisma.tenant.create({data:{name:'Synthetic recipe query'}}),store=await prisma.store.create({data:{tenantId:tenant.id,name:'Synthetic recipe query'}})
 const raw=await prisma.inventory.create({data:{storeId:store.id,name:'Vanilla powder',category:'ingredient',unit:'kg',currentStock:100}})
 const recipe=await createRecipe({storeId:store.id,name:'Vanilla base',outputUnit:'g',inputs:[{inventoryId:raw.id,quantity:1}],outputs:[{name:'Vanilla base '+store.id,quantity:1000}]})
 const base=await prisma.inventory.findFirstOrThrow({where:{storeId:store.id,processRecipeId:recipe!.id}})
 const category=await prisma.category.create({data:{storeId:store.id,name:'Ice cream'}})
 async function product(name:string,inventoryId?:string,quantity=50,unit='g'){
  const product=await prisma.product.create({data:{storeId:store.id,categoryId:category.id,name,code:randomUUID()}}),spec=await prisma.spec.create({data:{productId:product.id,name:'Regular',price:100}})
  if(inventoryId)await prisma.bOMItem.create({data:{productId:product.id,inventoryId,quantity,unit}})
  return {...product,spec}
 }
 const sundae=await product('Sundae',base.id,200),direct=await product('Powder drink',raw.id)
 async function order(product:any,quantity:number,status='completed',at='2026-10-02T00:00:00Z'){
  return prisma.order.create({data:{storeId:store.id,staffId:'synthetic',orderNumber:randomUUID(),status,paymentMethod:'cash',totalAmount:100,finalAmount:100,createdAt:new Date(at),items:{create:[{productId:product.id,specId:product.spec.id,productName:product.name,specName:'Regular',quantity,unitPrice:100,addons:'[]'}]}},include:{items:true}})
 }
 const a=await order(sundae,3),b=await order(direct,4)
 await prisma.refundRequest.create({data:{orderId:a.id,status:'approved',reason:'Partial refund',requestedBy:'synthetic',selectedItemIds:JSON.stringify({version:2,items:[{itemId:a.items[0].id,quantity:1}]})}})
 const snap=await prisma.orderConsumptionSnapshot.create({data:{storeId:store.id,orderId:b.id,createdAt:b.createdAt,materials:JSON.stringify([{inventoryId:raw.id,name:raw.name,unit:'kg',quantity:0.12}]),issues:'[]'}})
 await prisma.orderConsumptionSnapshot.create({data:{storeId:store.id,orderId:a.id,createdAt:a.createdAt,materials:JSON.stringify([{inventoryId:raw.id,name:raw.name,unit:'kg',quantity:0.6}]),issues:'[]'}})
 const filter={storeId:store.id,inventoryId:raw.id,startDate:'2026-10-01',endDate:'2026-10-31'}
 const query=()=>materialRecipeUsage(filter,prisma,now)
 return {store,raw,base,sundae,direct,a,b,snap,product,order,filter,query}
}
test('current nested recipe projection counts remaining units; historical evidence stays distinct and stock never changes',async()=>{
 const f=await fixture()
 for(const status of ['cancelled','refunded','suspended'])await f.order(f.sundae,100,status)
 await f.order(f.sundae,100,'completed','2026-09-30T16:59:59.999Z')
 const stock=await prisma.inventory.findMany({where:{storeId:f.store.id},orderBy:{id:'asc'}})
 const result=await f.query()
 expect(result.orderCount).toBe(2);expect(result.excludedOrderCount).toBe(3);expect(result.refundedQuantity).toBe(1)
 expect(result.estimate.complete).toBe(true);expect(result.estimate.quantity).toBeCloseTo(0.6,9)
 expect(result.estimate.breakdown.find((p:any)=>p.productId===f.sundae.id)).toMatchObject({soldQuantity:2,perUnit:0.2,quantity:0.4})
 expect(result.historical.quantity).toBeCloseTo(0.12);expect(result.historical.partialRefundOrderCount).toBe(1);expect(result.historical.complete).toBe(false)
 expect(await prisma.inventory.findMany({where:{storeId:f.store.id},orderBy:{id:'asc'}})).toEqual(stock)
 expect(await prisma.stockOutLog.count({where:{inventory:{storeId:f.store.id}}})).toBe(0)
 expect((await prisma.orderConsumptionSnapshot.findUniqueOrThrow({where:{id:f.snap.id}})).materials).toBe(f.snap.materials)
})
test('store date boundary includes midnight, missing recipes/snapshots remain visible and totals never pretend complete',async()=>{
 const f=await fixture(),missing=await f.product('Missing recipe')
 await f.order(missing,2);await f.order(f.direct,2,'paid','2026-09-30T17:00:00.000Z')
 const r=await f.query();expect(r.startAt).toBe('2026-09-30T17:00:00.000Z');expect(r.estimate.quantity).toBeCloseTo(0.7)
 expect(r.estimate.complete).toBe(false);expect(r.estimate.unresolved).toEqual([expect.objectContaining({productName:'Missing recipe',soldQuantity:2,reason:'BOM_MISSING'})]);expect(r.historical.missingOrderCount).toBe(2)
})
test('current recipe updates do not rewrite sale snapshots and certified historical corrections are respected',async()=>{
 const f=await fixture();await prisma.bOMItem.updateMany({where:{productId:f.direct.id},data:{quantity:100}})
 await appendConsumptionCorrection(prisma,f.store.id,f.snap.id,[{inventoryId:f.raw.id,name:f.raw.name,unit:'kg',quantity:0.03}],'Verified correction','synthetic-batch')
 const r=await f.query();expect(r.estimate.quantity).toBeCloseTo(0.8);expect(r.historical.quantity).toBeCloseTo(0.15)
 expect((await prisma.orderConsumptionSnapshot.findUniqueOrThrow({where:{id:f.snap.id}})).materials).toBe(f.snap.materials)
})
test('reversed and malformed-unit snapshots, unexpanded processing and invalid refunds are not presented as complete evidence',async()=>{
 const f=await fixture();await prisma.orderConsumptionSnapshot.update({where:{id:f.snap.id},data:{materials:JSON.stringify([{inventoryId:f.raw.id,name:'bad unit',unit:'g',quantity:100},{inventoryId:f.base.id,unit:'g',quantity:200}]),issues:'[{"code":"BOM_MISSING"}]'}})
 let r=await f.query();expect(r.historical.quantity).toBe(0);expect(r.historical.unitMismatchOrderCount).toBe(1);expect(r.historical.unexpandedOrderCount).toBe(1);expect(r.historical.issueOrderCount).toBe(1)
 await prisma.orderConsumptionSnapshot.update({where:{id:f.snap.id},data:{reversedAt:new Date()}});r=await f.query();expect(r.historical.activeOrderCount).toBe(0)
 await prisma.refundRequest.create({data:{orderId:f.b.id,status:'approved',reason:'Legacy unknown',requestedBy:'synthetic',selectedItemIds:'[]'}})
 r=await f.query();expect(r.invalidRefundOrderCount).toBe(1);expect(r.estimate.complete).toBe(false);expect(r.estimate.quantity).toBeCloseTo(0.4)
})
test('empty period returns zero; foreign materials, impossible dates, reversed and oversized periods fail closed',async()=>{
 const f=await fixture(),other=await fixture()
 await expect(materialRecipeUsage({...f.filter,inventoryId:other.raw.id},prisma,now)).rejects.toThrow('USAGE_MATERIAL_NOT_FOUND')
 await expect(materialRecipeUsage({...f.filter,inventoryId:f.base.id},prisma,now)).rejects.toThrow('USAGE_SELECT_RAW_MATERIAL')
 for(const dates of [{startDate:'2026-02-30',endDate:'2026-03-01'},{startDate:'2026-10-10',endDate:'2026-10-01'},{startDate:'2024-01-01',endDate:'2026-10-01'},{startDate:'2027-01-01',endDate:'2027-01-02'}])await expect(materialRecipeUsage({...f.filter,...dates},prisma,now)).rejects.toThrow(/INVALID_USAGE_PERIOD|Invalid calendar date/)
 const empty=await materialRecipeUsage({...f.filter,startDate:'2026-09-01',endDate:'2026-09-02'},prisma,now);expect(empty.orderCount).toBe(0);expect(empty.estimate.quantity).toBe(0);expect(empty.estimate.complete).toBe(true)
})
test('HTTP query requires access, validates dates and cannot read another store material',async()=>{
 const f=await fixture(),other=await fixture(),app=express();app.use(express.json());app.use('/api/inventory',declareAccessRoutes('/api/inventory',inventoryRouter))
 const server=await new Promise<import('http').Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))})
 async function token(role:string){const u=await prisma.user.create({data:{storeId:f.store.id,phone:randomUUID(),password:'synthetic',role}});return jwt.sign({id:u.id,phone:u.phone,storeId:f.store.id,role,staffId:'',issuedAtMs:Date.now()+1000},config.jwt.secret)}
 try{const url='/api/inventory/recipe-usage',admin=await token('admin'),query={inventoryId:f.raw.id,startDate:'2026-10-01',endDate:'2026-10-28'}
 expect((await request(server).get(url).query(query)).status).toBe(401)
 expect((await request(server).get(url).set('Authorization','Bearer '+await token('staff')).query(query)).status).toBe(403)
 expect((await request(server).get(url).set('Authorization','Bearer '+admin).query({...query,inventoryId:other.raw.id})).status).toBe(404)
 expect((await request(server).get(url).set('Authorization','Bearer '+admin).query({...query,startDate:'bad'})).status).toBe(400)
 const r=await request(server).get(url).set('Authorization','Bearer '+admin).query(query);expect(r.status).toBe(200);expect(r.body.data.readOnly).toBe(true)
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()))}
})
