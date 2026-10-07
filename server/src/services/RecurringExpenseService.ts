import {createHash} from 'crypto'
import prisma from '../config/database'
import {addDays,addMonths,formatDate} from '../utils/dateUtils'

export function validExpenseDate(value:string):boolean {
 const date=new Date(`${value}T00:00:00+07:00`)
 return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(date.getTime())&&formatDate(date)===value
}

// A store lock serializes the scheduler with edits and other server instances.
// The separate receipt also prevents regenerating a deliberately deleted expense.
export async function generateRecurringExpenses(storeId:string,now=new Date()) {
 return prisma.$transaction(async tx=>{
  await tx.store.update({where:{id:storeId},data:{updatedAt:new Date()}})
  const where={storeId_key:{storeId,key:'expenses.recurring'}}
  const record=await tx.config.findUnique({where});if(!record)return 0
  const state=JSON.parse(record.value),today=formatDate(now);let generated=0,changed=false
  for(const item of state.items){
   if(!item.active)continue
   if(!validExpenseDate(item.nextDueDate)||!Number.isSafeInteger(item.amount)||item.amount<=0||!['daily','weekly','monthly'].includes(item.frequency))throw Error('INVALID_RECURRING_EXPENSE')
   // Bound catch-up work to keep transactions short. Later ticks continue.
   for(let count=0;item.nextDueDate<=today&&count<31;count++){
    const due=item.nextDueDate,date=new Date(`${due}T00:00:00+07:00`)
    const key='expenses.generated.'+createHash('sha256').update(JSON.stringify([item.id,due])).digest('hex')
    const receipt=await tx.config.findUnique({where:{storeId_key:{storeId,key}}})
    if(!receipt){
     const expense=await tx.expense.create({data:{storeId,type:'operational',category:item.category,amount:item.amount,description:item.name,date,referenceId:item.id,referenceType:'recurring'}})
     await tx.config.create({data:{storeId,key,category:'expense',value:JSON.stringify({expenseId:expense.id,due,amount:item.amount})}});generated++
    }
    item.nextDueDate=formatDate(item.frequency==='monthly'?addMonths(date,1):addDays(date,item.frequency==='weekly'?7:1));changed=true
   }
  }
  if(changed){state.revision++;await tx.config.update({where,data:{value:JSON.stringify(state)}})}
  return generated
 },{timeout:15000})
}

export function startRecurringExpenseScheduler(){
 // Desktop replicas must never run cloud finance jobs.
 if(!process.env.DATABASE_URL?.startsWith('postgres'))return
 let running=false
 const tick=async()=>{
  if(running)return;running=true
  try{
   const records=await prisma.config.findMany({where:{key:'expenses.recurring'},select:{storeId:true}})
   for(const record of records){try{await generateRecurringExpenses(record.storeId)}catch(error){console.error('[Recurring expense] generation failed',record.storeId,error)}}
  }catch(error){console.error('[Recurring expense] scan failed',error)}finally{running=false}
 }
 void tick();const timer=setInterval(()=>void tick(),60000);timer.unref()
}
