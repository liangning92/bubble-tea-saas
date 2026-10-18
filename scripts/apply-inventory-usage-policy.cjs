// Run once inside the verified API image. Refresh current recipe cost caches only.
const {PrismaClient}=require('@prisma/client');
const {inventoryUsageMode}=require(process.cwd()+'/dist/utils/inventoryUsagePolicy');
const {recalculateInventoryConsumers}=require(process.cwd()+'/dist/services/InventoryQuantityService');
const db=new PrismaClient();
(async()=>{try{for(const {id:storeId} of await db.store.findMany({select:{id:true}})){
 const result=await db.$transaction(async tx=>{
  await tx.store.update({where:{id:storeId},data:{updatedAt:new Date()}});
  const key='inventory_usage_cost_policy:v2',where={storeId_key:{storeId,key}};
  if(await tx.config.findUnique({where}))return {storeId,alreadyApplied:true};
  const rows=await tx.inventory.findMany({where:{storeId}}),ids=rows.filter(r=>inventoryUsageMode(r)==='self_produced').map(r=>r.id);
  const before=await tx.product.findMany({where:{storeId},select:{id:true,name:true,costPrice:true}});
  await recalculateInventoryConsumers(tx,ids);
  const after=await tx.product.findMany({where:{storeId},select:{id:true,name:true,costPrice:true}});
  const changed=after.filter(p=>p.costPrice!==before.find(b=>b.id===p.id)?.costPrice);
  await tx.financeAuditLog.create({data:{storeId,userId:'system:inventory-usage-policy-v2',action:'update',entityType:'recipe_cost_policy',entityId:key,description:'Store-made plain water and ice: zero estimated recipe cost; historical orders and inventory values unchanged',oldValue:JSON.stringify(before.filter(p=>changed.some(c=>c.id===p.id))),newValue:JSON.stringify(changed)}});
  await tx.config.create({data:{storeId,key,value:JSON.stringify({version:2,inventoryIds:ids,changedProducts:changed.length,at:new Date().toISOString()}),category:'inventory'}});
  return {storeId,inventoryIds:ids,changedProducts:changed.length};
 },{timeout:60000});console.log(JSON.stringify(result));
}}finally{await db.$disconnect()}})().catch(e=>{console.error(e);process.exitCode=1});
