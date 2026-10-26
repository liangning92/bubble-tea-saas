// Default is read-only. Run after the additive migration; --apply changes metadata only.
const {PrismaClient}=require('@prisma/client')
const {historicalOrderDiscount}=require('../dist/utils/historicalOrderDiscount')
const db=new PrismaClient(),apply=process.argv.includes('--apply')
;(async()=>{
  const prefix='marketing.unified.order.'
  const rows=await db.config.findMany({where:{key:{startsWith:prefix}},select:{key:true,storeId:true,value:true}})
  const report={apply,examined:rows.length,eligible:0,updated:0,skipped:0,activityDiscountAmount:0}
  for(const row of rows){
    let snapshot
    try{snapshot=JSON.parse(row.value)}catch{report.skipped++;continue}
    if(!snapshot?.applied?.discount)continue
    const order=await db.order.findFirst({where:{id:row.key.slice(prefix.length),storeId:row.storeId}})
    if(!order){report.skipped++;continue}
    const where={id:order.id,storeId:order.storeId,activitySource:null,activityDiscountAmount:0,couponDiscountAmount:0,pointsDiscountAmount:0,manualDiscountAmount:0,totalAmount:order.totalAmount,discountAmount:order.discountAmount,finalAmount:order.finalAmount}
    if(order.activitySource||order.activityDiscountAmount||order.couponDiscountAmount||order.pointsDiscountAmount||order.manualDiscountAmount)continue
    const data=historicalOrderDiscount(order,snapshot)
    if(!data){report.skipped++;continue}
    report.eligible++;report.activityDiscountAmount+=data.activityDiscountAmount
    if(apply)report.updated+=(await db.order.updateMany({where,data})).count
  }
  console.log(JSON.stringify(report))
})().catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>db.$disconnect())
