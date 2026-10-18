// Run against the verified production image after the additive column migration.
// Human confirmation 2026-10-18: all procurement is prepaid online, never shift cash.
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient();
(async()=>{try{const stores=await db.store.findMany({select:{id:true}});for(const store of stores){const result=await db.$transaction(async tx=>{
 if(process.argv.includes('--apply'))await tx.store.update({where:{id:store.id},data:{updatedAt:new Date()}})
 const rows=await tx.expense.findMany({where:{storeId:store.id,referenceType:{in:['purchase','purchase_refund']}}});let changed=0;
 for(const old of rows){if(old.paymentSource==='online_payment'&&!old.cashSessionId&&!old.cashOccurredAt)continue;
 if(process.argv.includes('--apply')){const data={paymentSource:'online_payment',cashSessionId:null,cashOccurredAt:null};await tx.expense.update({where:{id:old.id},data});await tx.financeAuditLog.create({data:{storeId:store.id,userId:'system',action:'verify_payment_source',entityType:'expense',entityId:old.id,description:'Owner confirmed all purchase-order payments are prepaid online, independent of shift drawer (2026-10-18)',oldValue:JSON.stringify(old),newValue:JSON.stringify({...old,...data})}})}changed++}
 return {storeId:store.id,payments:rows.length,changed,netAmount:rows.reduce((n,e)=>n+e.amount,0)/100,mode:process.argv.includes('--apply')?'applied':'preview',originalHandoverReports:'preserved'}
 });console.log(JSON.stringify(result))}}finally{await db.$disconnect()}})().catch(e=>{console.error(e);process.exitCode=1})
