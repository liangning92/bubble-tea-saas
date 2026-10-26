// Audited cutover only. Never rewrites balances, snapshots, or historical movements.
const path=require('path');
const {PrismaClient}=require(require.resolve('@prisma/client',{paths:[path.resolve(__dirname,'../server'),process.cwd()]}));
const db=new PrismaClient(),apply=process.argv.includes('--apply');
const option=process.argv.find(v=>v.startsWith('--store='));
if(!option){console.error('Explicit --store=<id> required; add --apply to activate.');process.exit(1)}
const storeId=option.slice('--store='.length),key='inventory_actual_out_v2';
(async()=>{
 const report=await db.$transaction(async tx=>{
  const store=await tx.store.findUniqueOrThrow({where:{id:storeId},select:{id:true,name:true}});
  if(apply)await tx.store.update({where:{id:storeId},data:{updatedAt:new Date()}});
  const prior=await tx.config.findUnique({where:{storeId_key:{storeId,key}}});
  const inventory=await tx.inventory.findMany({where:{storeId,OR:[{type:{not:'semi_finished'}},{processRecipeId:null}]},select:{id:true,name:true,unit:true,currentStock:true}});
  const estimates=await tx.stockOutLog.groupBy({by:['inventoryId','reason'],where:{inventory:{storeId},reason:{in:['sale_estimate','sale_estimate_reversal']}},_sum:{quantity:true},_count:true});
  const activeCounts=await tx.inventoryCount.findMany({where:{storeId,status:{in:['in_progress','pending_review']}},select:{id:true,status:true}});
  let since=prior?.value||null;
  if(apply&&!prior){since=new Date().toISOString();await tx.config.create({data:{storeId,key,value:since,category:'inventory'}});await tx.config.deleteMany({where:{storeId,key:'inventory_alert_center_checked_at'}})}
  return {store,applied:apply,since,alreadyActive:!!prior,balancesChanged:false,inventory,legacyEstimates:estimates,activeCounts,requiresWarehouseReobservation:activeCounts.length>0};
 },{isolationLevel:'Serializable',timeout:30000});
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
