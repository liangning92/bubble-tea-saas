import {expect,test} from '@jest/globals'
import {randomUUID} from 'crypto'
import {updateProductBom,calculateProductCost,getProductCostDetail} from '../src/services/ProductService'
import {getProductBomDetail} from '../src/services/BomService'
import {createOrder} from '../src/services/OrderService'
import {executeRecipe} from '../src/services/ProcessRecipeService'
export function inventoryCostReview(db:any){
 async function store(){const tenant=await db.tenant.create({data:{name:'Synthetic cost review'}});return db.store.create({data:{tenantId:tenant.id,name:'Synthetic'}})}
 test.each(['finished_goods','semi_finished'])('legal purchased %s BOM has consistent nonzero cost and actual stock deduction',async type=>{
  const s=await store(),key=randomUUID(),category=await db.category.create({data:{storeId:s.id,name:'Tea'}}),product=await db.product.create({data:{storeId:s.id,categoryId:category.id,code:key,name:'Tea'}}),spec=await db.spec.create({data:{productId:product.id,name:'Regular',price:1000}})
  const inv=await db.inventory.create({data:{storeId:s.id,name:'Purchased ingredient',category:'tea',type,unit:'kg',currentStock:2,avgCost:10000}})
  await updateProductBom(product.id,[{inventoryId:inv.id,quantity:25,unit:'g'}])
  expect(await calculateProductCost(product.id)).toBe(250)
  expect((await getProductCostDetail(product.id))!.costPrice).toBe(250)
  expect((await getProductBomDetail(product.id))!.totalBomCost).toBe(250)
  const sale=await createOrder({storeId:s.id,orderNumber:key,staffId:'synthetic',paymentMethod:'cash',taxEnabled:false,items:[{productId:product.id,productName:'Tea',specId:spec.id,specName:'Regular',quantity:1,unitPrice:1000}]})
  expect(sale.items[0].bomCost).toBe(250);expect((await db.inventory.findUnique({where:{id:inv.id}})).currentStock).toBeCloseTo(1.975,9)
 })
 test.each([[1000,1,100],[300,0.3,333]])('processing cost100/%sg converts before rounding to %skg',async(outputQty,expectedQty,expectedCost)=>{
  const s=await store(),name=randomUUID();const input=await db.inventory.create({data:{storeId:s.id,name:'Input',category:'tea',unit:'pcs',currentStock:5,avgCost:100}})
  const output=await db.inventory.create({data:{storeId:s.id,name,category:'tea',type:'semi_finished',unit:'kg',currentStock:0,avgCost:0}})
  const recipe=await db.processRecipe.create({data:{storeId:s.id,name:'Synthetic',outputUnit:'g',items:{create:[{type:'input',inventoryId:input.id,quantity:1},{type:'output',name,quantity:outputQty}]}}})
  await executeRecipe(recipe.id)
  const actual=await db.inventory.findUnique({where:{id:output.id}}),log=await db.stockInLog.findFirst({where:{inventoryId:output.id}})
  expect(actual.currentStock).toBeCloseTo(expectedQty,9);expect(Number(actual.avgCost)).toBe(expectedCost);expect(log.unitCost).toBe(expectedCost);expect(log.totalAmount).toBe(100)
 })
}
