import {validExpenseDate} from './RecurringExpenseService'
import prisma from '../config/database'
import {createHash,randomUUID} from 'crypto'
import {canonical} from '../utils/orderSnapshot'
import {convertQuantity} from '../utils/inventoryUnits'
import {z} from 'zod'
export const batchSchema=z.object({requestId:z.string().uuid(),type:z.enum(['products','inventory','bom','expenses']),rows:z.array(z.record(z.string().max(2000))).min(1).max(500)})
const text=(s:unknown)=>z.string().trim().min(1).max(200).parse(s)
const number=(s:string,positive=false)=>{const n=Number(s);if(!s.trim()||!Number.isFinite(n)||(positive?n<=0:n<0))throw Error('INVALID_NUMBER');return n}
const money=(s:string)=>{const n=number(s);if(!Number.isSafeInteger(n)||n>1000000000)throw Error('INVALID_MONEY');return n}
export async function batchImport(storeId:string,actor:string,input:z.infer<typeof batchSchema>){
 const data=batchSchema.parse(input),digest=createHash('sha256').update(canonical(data)).digest('hex'),errors:string[]=[];let imported=0
 await prisma.$transaction(async tx=>{
  await tx.store.update({where:{id:storeId},data:{updatedAt:new Date()}})
  const key=`import.request.${data.requestId}`,prior=await tx.config.findUnique({where:{storeId_key:{storeId,key}}})
  if(prior&&JSON.parse(prior.value).digest!==digest)throw Error('IMPORT_IDEMPOTENCY_CONFLICT')
  if(!prior)await tx.config.create({data:{storeId,key,category:'import',value:JSON.stringify({digest,actor})}})
 })
 for(let i=0;i<data.rows.length;i++){
  try{await prisma.$transaction(async tx=>{
   await tx.store.update({where:{id:storeId},data:{updatedAt:new Date()}})
   const key=`import.row.${data.requestId}.${i}`,prior=await tx.config.findUnique({where:{storeId_key:{storeId,key}}})
   if(prior){if(JSON.parse(prior.value).digest!==digest)throw Error('IMPORT_IDEMPOTENCY_CONFLICT');return}
   const r=data.rows[i]
   if(data.type==='products'){
    const name=text(r.name),categoryName=text(r.category),specs=text(r.specs).split(',').map(s=>text(s)),prices=text(r.price).split(',').map(money)
    if(specs.length!==prices.length||new Set(specs).size!==specs.length)throw Error('SPEC_PRICE_MISMATCH')
    if(await tx.product.findFirst({where:{storeId,name,deletedAt:null}}))throw Error('PRODUCT_ALREADY_EXISTS')
    const category=await tx.category.upsert({where:{storeId_name:{storeId,name:categoryName}},create:{storeId,name:categoryName},update:{}})
    await tx.product.create({data:{storeId,name,code:`IMPORT-${randomUUID()}`,categoryId:category.id,costPrice:r.cost?money(r.cost):0,status:z.enum(['active','inactive']).parse(r.status||'active'),specs:{create:specs.map((name,i)=>({name,price:prices[i],isDefault:i===0}))}}})
   }else if(data.type==='inventory'){
    const name=text(r.name),unit=text(r.unit),stock=number(r.stock),cost=money(r.cost)
    if(await tx.inventory.findFirst({where:{storeId,name}}))throw Error('INVENTORY_ALREADY_EXISTS')
    const supplier=r.supplier?await tx.supplier.findFirst({where:{storeId,name:r.supplier}}):null
    if(r.supplier&&!supplier)throw Error('SUPPLIER_NOT_FOUND')
    const inv=await tx.inventory.create({data:{storeId,name,category:text(r.category),unit,currentStock:stock,avgCost:cost}})
    if(stock)await tx.stockInLog.create({data:{inventoryId:inv.id,quantity:stock,unitCost:cost,totalAmount:Math.round(stock*cost),supplierId:supplier?.id,staffId:actor,note:JSON.stringify({version:1,ledgerUnit:unit,ledgerQuantity:stock,importRequest:data.requestId})}})
   }else if(data.type==='bom'){
    const products=await tx.product.findMany({where:{storeId,name:text(r.product_name),deletedAt:null}}),materials=await tx.inventory.findMany({where:{storeId,name:text(r.material_name)}})
    if(products.length!==1||materials.length!==1)throw Error('BOM_REFERENCE_MISSING_OR_AMBIGUOUS')
    const quantity=number(r.quantity,true),unit=text(r.unit);convertQuantity(quantity,unit,materials[0].unit)
    if(await tx.bOMItem.findFirst({where:{productId:products[0].id,inventoryId:materials[0].id}}))throw Error('BOM_ALREADY_EXISTS')
    await tx.bOMItem.create({data:{productId:products[0].id,inventoryId:materials[0].id,quantity,unit}})
   }else{
    if(!validExpenseDate(r.date))throw Error('INVALID_EXPENSE_DATE')
    const date=new Date(`${r.date}T00:00:00+07:00`);if(!Number.isFinite(date.getTime()))throw Error('INVALID_EXPENSE_DATE')
    await tx.expense.create({data:{storeId,type:text(r.type),category:text(r.category),amount:money(r.amount),description:text(r.description),date,referenceId:`${data.requestId}:${i}`,referenceType:'import'}})
   }
   await tx.config.create({data:{storeId,key,value:JSON.stringify({digest,actor,at:new Date().toISOString()}),category:'import'}})
  });imported++}catch(e){errors.push(`Row ${i+2}: ${e instanceof Error?e.message:'IMPORT_FAILED'}`)}
 }
 const result={success:errors.length===0,total:data.rows.length,imported,failed:errors.length,errors}
 await prisma.config.upsert({where:{storeId_key:{storeId,key:`import.run.${data.requestId}`}},create:{storeId,key:`import.run.${data.requestId}`,category:'import',value:JSON.stringify({digest,type:data.type,actor,result,at:new Date().toISOString()})},update:{value:JSON.stringify({digest,type:data.type,actor,result,at:new Date().toISOString()})}})
 return result
}
