import {expect,test} from '@jest/globals'
import {randomUUID} from 'crypto'
import type {PrismaClient} from '@prisma/client'
import {getOrders} from '../src/services/OrderService'
import {getProducts} from '../src/services/ProductService'
import {getInventory,getStockInLogs,getStockOutLogs} from '../src/services/InventoryService'
import {getStaff} from '../src/services/StaffService'
import {getSuppliers} from '../src/services/SupplierService'
import {getMembers} from '../src/services/MemberService'
export function registerSearchCases(prisma:PrismaClient,provider:'sqlite'|'postgresql') {
 async function fixture(){
  const id=randomUUID()
  const tenant=await prisma.tenant.create({data:{name:'Synthetic search'}})
  const store=await prisma.store.create({data:{tenantId:tenant.id,name:'Synthetic search'}})
  const foreign=await prisma.store.create({data:{tenantId:tenant.id,name:'Synthetic foreign'}})
  return {id,store,foreign}
 }
 async function unicodeFolds(){
  if(provider==='sqlite')return false
  const [row]=await prisma.$queryRawUnsafe<Array<{folded:boolean}>>("SELECT 'Æ' ILIKE 'æ' AS folded")
  return row.folded
 }
 test(`${provider}: order and pickup nonempty search preserves ASCII folding and Unicode boundary`,async()=>{
  const f=await fixture()
  const order=await prisma.order.create({data:{storeId:f.store.id,staffId:'synthetic',orderNumber:`${f.id}-MiXeDÆ`,pickupNumber:'AbC9',totalAmount:100,finalAmount:100,paymentMethod:'cash'}})
  await prisma.order.create({data:{storeId:f.foreign.id,staffId:'synthetic',orderNumber:`foreign-${f.id}-MiXeDÆ`,pickupNumber:'AbC9',totalAmount:100,finalAmount:100,paymentMethod:'cash'}})
  for(const search of ['mixed','  MIXED  ','abc9','Æ']){
   const result=await getOrders({storeId:f.store.id,search})
   expect(result.list.map(o=>o.id)).toEqual([order.id]);expect(result.pagination.total).toBe(1)
  }
  expect((await getOrders({storeId:f.store.id,search:'æ'})).pagination.total).toBe(await unicodeFolds()?1:0)
  expect((await getOrders({storeId:f.store.id,search:'no-such-receipt'})).pagination.total).toBe(0)
 })
 test(`${provider}: product name description and code search preserve ASCII folding and Unicode boundary`,async()=>{
  const f=await fixture()
  const category=await prisma.category.create({data:{storeId:f.store.id,name:'Synthetic'}})
  const product=await prisma.product.create({data:{storeId:f.store.id,categoryId:category.id,name:'LatteÆ',description:'Cold Brew',code:`TEA-Code-${f.id}`,costPrice:100}})
  const foreignCategory=await prisma.category.create({data:{storeId:f.foreign.id,name:'Synthetic'}})
  await prisma.product.create({data:{storeId:f.foreign.id,categoryId:foreignCategory.id,name:'LatteÆ',description:'Cold Brew',code:`FOREIGN-TEA-Code-${f.id}`,costPrice:100}})
  for(const search of ['latte','cold brew','tea-code','Æ'])expect((await getProducts({storeId:f.store.id,search})).map(p=>p.id)).toEqual([product.id])
  expect((await getProducts({storeId:f.store.id,search:'æ'})).length).toBe(await unicodeFolds()?1:0)
  expect(await getProducts({storeId:f.store.id,search:'no-such-product'})).toEqual([])
 })

 for(const [label,query] of [['inventory',getInventory],['stock-in',getStockInLogs],['stock-out',getStockOutLogs]] as const){
  test(`${provider}: ${label} search keeps name semantics and related inventory store boundary`,async()=>{
   const f=await fixture();let ownId='';let foreignInventoryId=''
   for(const store of [f.store,f.foreign]){
    const inventory=await prisma.inventory.create({data:{storeId:store.id,name:'MiXeDÆ ingredient',category:'tea',unit:'g',currentStock:10,avgCost:BigInt(100)}})
    const incoming=await prisma.stockInLog.create({data:{inventoryId:inventory.id,quantity:10,unitCost:100,totalAmount:1000}})
    const outgoing=await prisma.stockOutLog.create({data:{inventoryId:inventory.id,quantity:1,reason:'sold'}})
    if(store.id===f.store.id)ownId=label==='inventory'?inventory.id:label==='stock-in'?incoming.id:outgoing.id
    else foreignInventoryId=inventory.id
   }
   for(const search of ['mixed','MIXED','Æ'])expect((await query({storeId:f.store.id,search})).map((row:{id:string})=>row.id)).toEqual([ownId])
   expect((await query({storeId:f.store.id,search:'æ'})).length).toBe(await unicodeFolds()?1:0)
   expect(await query({storeId:f.store.id,search:'absent'})).toEqual([])
   if(label==='inventory')expect(await getInventory({storeId:f.store.id,search:'mixed',categoryId:'other'})).toEqual([])
   else {
    const logQuery=label==='stock-in'?getStockInLogs:getStockOutLogs
    expect(await logQuery({storeId:f.store.id,search:'mixed',category:'other'})).toEqual([])
    expect(await logQuery({storeId:f.store.id,search:'mixed',inventoryId:foreignInventoryId})).toEqual([])
   }
  })
 }
 test(`${provider}: staff name and related user phone search retains store/status/position scopes`,async()=>{
  const f=await fixture();let ownId=''
  for(const [index,store] of [f.store,f.foreign].entries()){
   const user=await prisma.user.create({data:{storeId:store.id,phone:`628-${f.id}-${index}`,password:'synthetic-unused',role:'staff'}})
   const staff=await prisma.staff.create({data:{storeId:store.id,userId:user.id,name:'MiXeDÆ staff',employeeNumber:`search-${f.id}-${index}`,position:'cashier'}})
   if(index===0)ownId=staff.id
  }
  for(const search of ['mixed','MIXED','628-','Æ'])expect((await getStaff({storeId:f.store.id,search,status:'active',position:'cashier'})).map(row=>row.id)).toEqual([ownId])
  expect((await getStaff({storeId:f.store.id,search:'æ'})).length).toBe(await unicodeFolds()?1:0)
  expect(await getStaff({storeId:f.store.id,search:'absent'})).toEqual([])
  expect(await getStaff({storeId:f.store.id,search:'mixed',status:'inactive'})).toEqual([])
  expect(await getStaff({storeId:f.store.id,search:'mixed',position:'manager'})).toEqual([])
 })
 test(`${provider}: supplier name contact and phone search retains store/active scopes`,async()=>{
  const f=await fixture();let ownId=''
  for(const store of [f.store,f.foreign]){
   const supplier=await prisma.supplier.create({data:{storeId:store.id,name:'MiXeDÆ supplier',contactPerson:'CoNtAcT',phone:'628123456',isActive:true}})
   if(store.id===f.store.id)ownId=supplier.id
  }
  for(const search of ['mixed','MIXED','contact','628123','Æ'])expect((await getSuppliers({storeId:f.store.id,search,isActive:true})).map(row=>row.id)).toEqual([ownId])
  expect((await getSuppliers({storeId:f.store.id,search:'æ'})).length).toBe(await unicodeFolds()?1:0)
  expect(await getSuppliers({storeId:f.store.id,search:'absent'})).toEqual([])
  expect(await getSuppliers({storeId:f.store.id,search:'mixed',isActive:false})).toEqual([])
 })
 test(`${provider}: member name and phone search retains store/level scopes`,async()=>{
  const f=await fixture();let ownId=''
  for(const [index,store] of [f.store,f.foreign].entries()){
   const member=await prisma.member.create({data:{storeId:store.id,name:'MiXeDÆ member',phone:`628-${f.id}-${index}`,level:'bronze'}})
   if(index===0)ownId=member.id
  }
  for(const search of ['mixed','MIXED','628-','Æ'])expect((await getMembers({storeId:f.store.id,search,level:'bronze'})).map(row=>row.id)).toEqual([ownId])
  expect((await getMembers({storeId:f.store.id,search:'æ'})).length).toBe(await unicodeFolds()?1:0)
  expect(await getMembers({storeId:f.store.id,search:'absent'})).toEqual([])
  expect(await getMembers({storeId:f.store.id,search:'mixed',level:'gold'})).toEqual([])
 })
}
