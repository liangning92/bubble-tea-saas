import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import prisma from '../config/database'

export class SalaryAdjustmentError extends Error {}
export interface SalaryAdjustment {id:string;staffId:string;month:string;type:'reward'|'penalty';amount:number;reason:string;status:'active'|'cancelled';createdBy:string;createdAt:string;cancelledBy?:string;cancelledAt?:string}
type DB=Prisma.TransactionClient
export async function periodLock(db: DB, storeId: string, staffId: string, month: string) {
  const key=`salary.period.${staffId}.${month}`
  await db.config.upsert({where:{storeId_key:{storeId,key}},create:{storeId,key,value:month,category:'staff'},update:{value:month}})
}
export async function listSalaryAdjustments(storeId:string,db:DB=prisma):Promise<SalaryAdjustment[]> {
  const rows=await db.config.findMany({where:{storeId,key:{startsWith:'staff.compensation.'}},orderBy:{createdAt:'desc'}})
  return rows.map(row=>JSON.parse(row.value))
}
export async function adjustmentPlan(storeId:string,staffId:string,month:string,db:DB=prisma) {
  const items=(await listSalaryAdjustments(storeId,db)).filter(i=>i.staffId===staffId&&i.month===month&&i.status==='active')
  return {items,rewards:items.filter(i=>i.type==='reward').reduce((s,i)=>s+i.amount,0),penalties:items.filter(i=>i.type==='penalty').reduce((s,i)=>s+i.amount,0)}
}
export async function savedAdjustmentPlan(storeId:string,salaryId:string,db:DB=prisma) {
  const row=await db.config.findUnique({where:{storeId_key:{storeId,key:`salary.adjustmentPlan.${salaryId}`}}})
  return row?JSON.parse(row.value):{items:[],rewards:0,penalties:0}
}
export async function saveAdjustmentPlan(db:DB,storeId:string,salaryId:string,plan:Awaited<ReturnType<typeof adjustmentPlan>>) {
  const key=`salary.adjustmentPlan.${salaryId}`
  await db.config.upsert({where:{storeId_key:{storeId,key}},create:{storeId,key,category:'staff',value:JSON.stringify(plan)},update:{value:JSON.stringify(plan)}})
}
export async function normalizeAdjustments(db:DB,storeId:string,staffId:string,month:string,bonus:number,deduction:number,includedIds:string[]) {
  const plan=await adjustmentPlan(storeId,staffId,month,db)
  const expected=plan.items.map(i=>i.id).sort()
  if(includedIds.length&&JSON.stringify([...includedIds].sort())!==JSON.stringify(expected))throw new SalaryAdjustmentError('SALARY_ADJUSTMENTS_RECALC_REQUIRED')
  const included=includedIds.length>0
  if(included&&(bonus<plan.rewards||deduction<plan.penalties))throw new SalaryAdjustmentError('Salary cannot omit recorded rewards or penalties')
  return {plan,bonus:bonus+(included?0:plan.rewards),deduction:deduction+(included?0:plan.penalties)}
}
export async function changeSalaryAdjustment(actor:{id:string;storeId:string},input:{staffId:string;month:string;type:'reward'|'penalty';amount:number;reason:string;requestId:string}|{cancelId:string}) {
  return prisma.$transaction(async db=>{
    let existing:SalaryAdjustment|undefined
    if('cancelId' in input){const row=await db.config.findUnique({where:{storeId_key:{storeId:actor.storeId,key:`staff.compensation.${input.cancelId}`}}});if(!row)throw new SalaryAdjustmentError('ADJUSTMENT_NOT_FOUND');existing=JSON.parse(row.value)}
    const staffId=existing?.staffId||('staffId' in input?input.staffId:'')
    const month=existing?.month||('month' in input?input.month:'')
    const staff=await db.staff.findUnique({where:{id:staffId},select:{storeId:true}})
    if(!staff||staff.storeId!==actor.storeId)throw new SalaryAdjustmentError('STAFF_STORE_MISMATCH')
    await periodLock(db,actor.storeId,staffId,month)
    if ('staffId' in input) {
      const replay=await db.config.findUnique({where:{storeId_key:{storeId:actor.storeId,key:`staff.compensation.${input.requestId}`}}})
      if(replay){const row=JSON.parse(replay.value);if(JSON.stringify([row.staffId,row.month,row.type,row.amount,row.reason,row.createdBy])!==JSON.stringify([input.staffId,input.month,input.type,input.amount,input.reason,actor.id]))throw new SalaryAdjustmentError('REQUEST_ID_CONFLICT');return row}
    }
    const salary=await db.salary.findFirst({where:{staffId,month}})
    if(existing?.status==='cancelled')return existing
    if(salary?.status==='paid')throw new SalaryAdjustmentError('Paid payroll cannot be changed')
    let item:SalaryAdjustment
    if(existing){item={...existing,status:'cancelled',cancelledBy:actor.id,cancelledAt:new Date().toISOString()}}
    else {
      const data=input as Extract<typeof input,{staffId:string}>
      item={id:data.requestId||randomUUID(),staffId,month,type:data.type,amount:data.amount,reason:data.reason,status:'active',createdBy:actor.id,createdAt:new Date().toISOString()}
    }
    const key=`staff.compensation.${item.id}`
    await db.config.upsert({where:{storeId_key:{storeId:actor.storeId,key}},create:{storeId:actor.storeId,key,category:'staff',value:JSON.stringify(item)},update:{value:JSON.stringify(item)}})
    if(salary){
      const old=await savedAdjustmentPlan(actor.storeId,salary.id,db),next=await adjustmentPlan(actor.storeId,staffId,month,db)
      const bonus=salary.bonus-old.rewards+next.rewards,deduction=salary.deduction-old.penalties+next.penalties
      const finalAmount=salary.baseSalary+salary.overtime+salary.commission+bonus-deduction
      if(bonus<0||deduction<0||finalAmount<0||bonus>2000000000||deduction>2000000000||finalAmount>2000000000)throw new SalaryAdjustmentError('Adjustment exceeds payable salary')
      const changed=await db.salary.updateMany({where:{id:salary.id,status:'pending'},data:{bonus,deduction,finalAmount}})
      if(changed.count!==1)throw new SalaryAdjustmentError('Payroll changed; reload')
      await saveAdjustmentPlan(db,actor.storeId,salary.id,next)
    }
    return item
  })
}
