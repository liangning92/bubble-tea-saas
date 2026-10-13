import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { LateRule, penaltyAmount } from './EmployeeAttendanceService'
import { readWork } from './EmployeeWorkspaceStore'
import { businessDate, ProbationInputError } from './ProbationService'

export const payrollCorrectionSchema = z.object({
  lateMinutes: z.number().int().min(0).max(50000),
  lateMode: z.enum(['rule','manual']),
  manualLateDeduction: z.number().int().min(0).max(2000000000).default(0),
  otherAttendanceDeduction: z.number().int().min(0).max(2000000000).default(0),
  unpaidProbationDays: z.number().min(0).max(31).multipleOf(0.5).optional(),
  unpaidRegularDays: z.number().min(0).max(31).multipleOf(0.5).optional(),
  reason: z.string().trim().min(1).max(1000),
}).strict()
export type PayrollCorrection = z.infer<typeof payrollCorrectionSchema>
export const correctionKey = (staffId:string,month:string) => `salary.correction.${staffId}.${month}`
export async function correctionPreview(db: Prisma.TransactionClient,storeId:string,month:string,input:Pick<PayrollCorrection,'lateMinutes'|'lateMode'|'manualLateDeduction'|'otherAttendanceDeduction'|'unpaidProbationDays'|'unpaidRegularDays'>) {
  const rule=await readWork<LateRule>(storeId,`rule.${month}`,db)
  const lateRuleRequired=input.lateMode==='rule' && input.lateMinutes>0 && !rule
  const lateDeduction=input.lateMode==='manual'?input.manualLateDeduction:rule?penaltyAmount(input.lateMinutes,rule):0
  if(!Number.isSafeInteger(lateDeduction)||lateDeduction<0||lateDeduction>2000000000)throw new ProbationInputError('PAYROLL_AMOUNT_OUT_OF_RANGE')
  return {...input,lateDeduction,lateRule:rule,lateRuleRequired}
}
export async function saveCorrection(db:Prisma.TransactionClient,storeId:string,staffId:string,month:string,input:PayrollCorrection,actorId:string) {
  const snapshot=await correctionPreview(db,storeId,month,input)
  if(snapshot.lateRuleRequired)throw new ProbationInputError('LATE_RULE_REQUIRED')
  const key=correctionKey(staffId,month)
  const value={...snapshot,reason:input.reason,actorId,recordedAt:new Date().toISOString()}
  await db.config.upsert({where:{storeId_key:{storeId,key}},create:{storeId,key,category:'staff',value:JSON.stringify(value)},update:{value:JSON.stringify(value)}})
  return value
}
export function payrollMonthClosed(month:string,now=new Date()) { return month<businessDate(now).slice(0,7) }
