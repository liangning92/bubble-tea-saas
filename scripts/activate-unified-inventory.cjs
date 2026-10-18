// Run inside the exact verified API image. No historical quantities are inferred/restored.
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
(async()=>{try{for(const store of await db.store.findMany({select:{id:true}})){
 const result=await db.$transaction(async tx=>{
  await tx.store.update({where:{id:store.id},data:{updatedAt:new Date()}});
  const key='inventory_unified_stock_v1',where={storeId_key:{storeId:store.id,key}};
  const previous=await tx.config.findUnique({where});if(previous)return{storeId:store.id,alreadyActive:true,since:previous.value};
  if(await tx.inventoryCount.count({where:{storeId:store.id,status:{in:['in_progress','pending_review']}}}))throw Error('ACTIVE_COUNT_FINISH_BEFORE_POLICY_SWITCH:'+store.id);
  const value=new Date().toISOString();
  await tx.config.create({data:{storeId:store.id,key,value,category:'inventory'}});
  await tx.financeAuditLog.create({data:{storeId:store.id,userId:'system:unified-inventory-v1',action:'update',entityType:'inventory_policy',entityId:key,description:'Whole-store raw-equivalent estimates: issues and processing are internal; sales estimated once. Historical balances retained; first approved whole-store physical count required.',newValue:JSON.stringify({since:value,restoreHistoricalWithdrawals:false,openingCountRequired:true})}});
  await tx.config.deleteMany({where:{storeId:store.id,key:'inventory_alert_center_checked_at'}});
  return{storeId:store.id,since:value,openingCountRequired:true};
 },{timeout:30000});console.log(JSON.stringify(result));
}}finally{await db.$disconnect()}})().catch(e=>{console.error(e);process.exitCode=1});
