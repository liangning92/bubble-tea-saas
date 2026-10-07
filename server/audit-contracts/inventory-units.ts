import {expect,test} from '@jest/globals'
import {randomUUID} from 'crypto'
import {stockIn,updateInventory} from '../src/services/InventoryService'
import {updateProductBom,calculateProductCost} from '../src/services/ProductService'
import {createOrder,refundOrder} from '../src/services/OrderService'
export function inventoryUnitContract(db:any){
 async function fixture(unit='kg',bomUnit='g'){
  const key=randomUUID(),tenant=await db.tenant.create({data:{name:'Synthetic units'}}),store=await db.store.create({data:{tenantId:tenant.id,name:'Synthetic units'}})
  const category=await db.category.create({data:{storeId:store.id,name:'Tea'}}),product=await db.product.create({data:{storeId:store.id,categoryId:category.id,name:'Tea',code:key}}),spec=await db.spec.create({data:{productId:product.id,name:'Regular',price:20000}})
  const inventory=await db.inventory.create({data:{storeId:store.id,name:'Ingredient',category:'tea',unit,avgCost:10000,concentrateRatio:10}})
  await updateProductBom(product.id,[{inventoryId:inventory.id,quantity:25,unit:bomUnit}])
  const order={storeId:store.id,staffId:'synthetic',orderNumber:key,paymentMethod:'cash',taxEnabled:false,items:[{productId:product.id,productName:'Tea',specId:spec.id,specName:'Regular',quantity:1,unitPrice:20000}]}
  return {store,product,inventory,order}
 }
 test.each([['kg','g'],['L','ml']])('2%s input minus 25%s sale preserves ledger units, cost and exact unprepared reversal',async(unit,bomUnit)=>{
  const f=await fixture(unit,bomUnit)
  await stockIn({storeId:f.store.id,inventoryId:f.inventory.id,quantity:2,inputUnit:unit,unitCost:10000,reason:'purchase'})
  expect(await calculateProductCost(f.product.id)).toBe(250)
  const sale=await createOrder(f.order)
  expect((await db.inventory.findUnique({where:{id:f.inventory.id}})).currentStock).toBeCloseTo(1.975,9)
  expect((await db.stockOutLog.findFirst({where:{orderId:sale.id}})).quantity).toBeCloseTo(0.025,9)
  expect(sale.items[0].bomCost).toBe(250)
  await updateProductBom(f.product.id,[{inventoryId:f.inventory.id,quantity:500,unit:bomUnit}])
  const request=await db.refundRequest.create({data:{orderId:sale.id,reason:'unprepared',reasonCode:'paid_unprepared',requestedBy:'cashier'}})
  await refundOrder(sale.id,'verified',undefined,undefined,{requestId:request.id,approvedBy:'admin',restoreUnprepared:true})
  expect((await db.inventory.findUnique({where:{id:f.inventory.id}})).currentStock).toBe(2)
  expect((await db.stockOutLog.findFirst({where:{orderId:sale.id,reason:'refund_unprepared'}})).quantity).toBe(-0.025)
 })
 test('package input is material-specific and price/log snapshot uses the entered package',async()=>{
  const f=await fixture();await updateInventory(f.inventory.id,{packaging:{unit:'bag',quantity:2,baseUnit:'kg'}})
  await stockIn({storeId:f.store.id,inventoryId:f.inventory.id,quantity:2,inputUnit:'bag',unitCost:10000,reason:'purchase'})
  const inv=await db.inventory.findUnique({where:{id:f.inventory.id}}),log=await db.stockInLog.findFirst({where:{inventoryId:inv.id}})
  expect(inv.currentStock).toBe(4);expect(Number(inv.avgCost)).toBe(5000);expect(log.quantity).toBe(4);expect(log.totalAmount).toBe(20000);expect(log.unitCost).toBe(5000);expect(JSON.parse(log.note).inputQuantity).toBe(2)
  await expect(stockIn({storeId:'foreign',inventoryId:inv.id,quantity:1,reason:'purchase'})).rejects.toThrow('Inventory not found')
  await expect(stockIn({storeId:f.store.id,inventoryId:inv.id,quantity:1,inputUnit:'L',reason:'purchase'})).rejects.toThrow('INCOMPATIBLE_INVENTORY_UNITS')
  await expect(updateInventory(inv.id,{unit:'g'})).rejects.toThrow('INVENTORY_UNIT_IMMUTABLE')
  await expect(updateInventory(inv.id,{currentStock:99})).rejects.toThrow('USE_INVENTORY_COUNT_OR_ADJUSTMENT')
  expect((await db.inventory.findUnique({where:{id:inv.id}})).currentStock).toBe(4)
 })
 test('invalid/foreign BOM preserves previous recipe and no legacy quantity is reinterpreted',async()=>{
  const f=await fixture(),foreign=await fixture()
  const old=await db.bOMItem.findMany({where:{productId:f.product.id}})
  await expect(updateProductBom(f.product.id,[{inventoryId:f.inventory.id,quantity:25,unit:'ml'}])).rejects.toThrow('INCOMPATIBLE_INVENTORY_UNITS')
  await expect(updateProductBom(f.product.id,[{inventoryId:foreign.inventory.id,quantity:25,unit:'g'}])).rejects.toThrow('INVENTORY_STORE_MISMATCH')
  expect(await db.bOMItem.findMany({where:{productId:f.product.id}})).toEqual(old)
  // Historical stock is not converted at read or metadata update.
  await db.inventory.update({where:{id:f.inventory.id},data:{currentStock:12}})
  await updateInventory(f.inventory.id,{name:'Renamed'});expect((await db.inventory.findUnique({where:{id:f.inventory.id}})).currentStock).toBe(12)
 })
}
