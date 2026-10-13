import { isPayrollEmployee } from './StaffIdentityService'
import { getPayrollRules } from './PayrollRuleService'
import { z } from 'zod'
import { PrismaClient, Prisma } from '@prisma/client'
type DB = Pick<PrismaClient, 'config'> | Pick<Prisma.TransactionClient, 'config'>
type PayrollDB = DB & Pick<PrismaClient, 'attendance'>
const ruleKey = 'staff.probation.rule'
const employeeKey = (id: string) => `staff.probation.employee.${id}`
const basisKey = (id: string) => `salary.probationBasis.${id}`
export class ProbationInputError extends Error {}
export const probationRuleSchema = z.object({ enabled: z.boolean(), durationUnit: z.enum(['days','months']), duration: z.number().int().min(1).max(730), salaryMode: z.enum(['fixed','percentage']), salaryValue: z.number().int().min(1).max(2000000000) }).refine(r => r.durationUnit !== 'months' || r.duration <= 24, 'Maximum 24 months').refine(r => r.salaryMode !== 'percentage' || r.salaryValue <= 100, 'Percentage must not exceed 100')
export type ProbationRule = z.infer<typeof probationRuleSchema>
type Employee = { id: string; storeId: string; baseSalary: number | null; hireDate: Date | null; terminationDate?: Date | null; userId?:string; user?:{role:string} }
export type Enrollment = { exempt?: boolean; enabled: boolean; rule?: ProbationRule; confirmationDate?: string | null }
async function read(db: DB, storeId: string, key: string) { const row = await db.config.findUnique({ where: {storeId_key:{storeId,key}} }); return row ? JSON.parse(row.value) : null }
async function write(db: DB, storeId: string, key: string, value: unknown) { return db.config.upsert({where:{storeId_key:{storeId,key}},create:{storeId,key,value:JSON.stringify(value),category:'staff'},update:{value:JSON.stringify(value)}}) }
export async function getProbationRule(db: DB, storeId: string) { const row = await read(db,storeId,ruleKey); return row ? probationRuleSchema.parse(row) : {enabled:false} }
export async function saveProbationRule(db: DB, storeId: string, input: unknown) { const result=probationRuleSchema.safeParse(input); if(!result.success)throw new ProbationInputError(result.error.issues.map(i=>i.message).join('; '));await write(db,storeId,ruleKey,result.data);return result.data }
export async function getEnrollment(db: DB, staff: Employee): Promise<Enrollment> { if(!await isPayrollEmployee(db,staff))return {enabled:false}; const saved = await read(db,staff.storeId,employeeKey(staff.id)); if(saved && (saved.enabled || saved.exempt || saved.rule))return saved; const rule=await getProbationRule(db,staff.storeId); return rule.enabled && staff.hireDate ? {enabled:true,rule:probationRuleSchema.parse(rule)} : {enabled:false} }
export function dayNumber(day: string) { if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new ProbationInputError('INVALID_PROBATION_DATE'); const date=new Date(day+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==day)throw new ProbationInputError('INVALID_PROBATION_DATE');return date.getTime()/86400000 }
const dayString = (day: number) => new Date(day*86400000).toISOString().slice(0,10)
export function businessDate(date: Date) {const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);const p=(k:string)=>parts.find(x=>x.type===k)!.value;return `${p('year')}-${p('month')}-${p('day')}`}
export function confirmationDay(hire: string, enrollment: Enrollment) {
 if(!enrollment.enabled)return null
 if(enrollment.confirmationDate){if(dayNumber(enrollment.confirmationDate)<dayNumber(hire))throw new ProbationInputError('CONFIRMATION_BEFORE_HIRE');return enrollment.confirmationDate}
 const rule=probationRuleSchema.parse(enrollment.rule);const start=new Date(hire+'T00:00:00Z')
 if(rule.durationUnit==='days')return dayString(dayNumber(hire)+rule.duration)
 const target=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+rule.duration,1));const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();return dayString(Date.UTC(target.getUTCFullYear(),target.getUTCMonth(),Math.min(start.getUTCDate(),last))/86400000)
}
export async function saveEnrollment(db: DB, staff: Employee, enabled?: boolean, confirmationDate?: string | null) {
 if(!await isPayrollEmployee(db,staff))return {enabled:false}
 const previous=await getEnrollment(db,staff)
 if(enabled===undefined && confirmationDate===undefined && !previous.enabled)return previous
 const next: Enrollment={...previous,exempt:enabled===undefined?previous.exempt:!enabled,enabled:enabled ?? previous.enabled,confirmationDate:confirmationDate===undefined?previous.confirmationDate:confirmationDate}
 if(next.enabled){if(!staff.hireDate)throw new ProbationInputError('PROBATION_HIRE_DATE_REQUIRED');if(!previous.enabled){const rule=await getProbationRule(db,staff.storeId);if(!rule.enabled)throw new ProbationInputError('PROBATION_RULE_REQUIRED');next.rule=probationRuleSchema.parse(rule)}
 confirmationDay(businessDate(staff.hireDate),next)
 if(staff.baseSalary!==null && next.rule?.salaryMode==='fixed' && next.rule.salaryValue>staff.baseSalary)throw new ProbationInputError('PROBATION_SALARY_EXCEEDS_FORMAL_SALARY')}
 await write(db,staff.storeId,employeeKey(staff.id),next);return next
}
export function monthlyRateCents(staff: Employee, enrollment: Enrollment, date: string) {
 if(staff.baseSalary===null)throw new ProbationInputError('STAFF_BASE_SALARY_REQUIRED')
 if(!Number.isSafeInteger(staff.baseSalary)||staff.baseSalary<0||staff.baseSalary>2000000000)throw new ProbationInputError('INVALID_BASE_SALARY')
 const hire=staff.hireDate?businessDate(staff.hireDate):null
 const end=hire?confirmationDay(hire,enrollment):null
 if(enrollment.enabled&&!hire)throw new ProbationInputError('PROBATION_HIRE_DATE_REQUIRED')
 if(enrollment.enabled&&end&&date<end){const rule=probationRuleSchema.parse(enrollment.rule);if(rule.salaryMode==='fixed' && rule.salaryValue>staff.baseSalary)throw new ProbationInputError('PROBATION_SALARY_EXCEEDS_FORMAL_SALARY');return rule.salaryMode==='percentage'?staff.baseSalary*rule.salaryValue:rule.salaryValue*100}
 return staff.baseSalary*100
}
export const workingDaysSchema = z.object({probation:z.number().min(0).max(31).multipleOf(0.5),regular:z.number().min(0).max(31).multipleOf(0.5)}).strict()
export type WorkingDays = z.infer<typeof workingDaysSchema>
export function payrollBasis(staff: Employee, enrollment: Enrollment, month: string, workingDays?: WorkingDays) {
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new ProbationInputError('INVALID_SALARY_PERIOD')
 const start=dayNumber(month+'-01'),date=new Date(start*86400000),end=Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1)/86400000,daysInMonth=end-start
 const hire=staff.hireDate?businessDate(staff.hireDate):null,confirmation=hire?confirmationDay(hire,enrollment):null
 if(staff.terminationDate&&staff.hireDate&&businessDate(staff.terminationDate)<businessDate(staff.hireDate))throw new ProbationInputError('TERMINATION_BEFORE_HIRE')
 const begin=Math.max(start,hire?dayNumber(hire):start),until=Math.min(end,staff.terminationDate?dayNumber(businessDate(staff.terminationDate))+1:end)
 const segments: Array<{type:'probation'|'regular';startDate:string;endDate:string;days:number;monthlyRate:number;amount:number}>=[]
 let numerator=0
 for(let day=begin;day<until;day++){const key=dayString(day),rate=monthlyRateCents(staff,enrollment,key),type=confirmation&&key<confirmation?'probation':'regular';numerator+=rate;const last=segments[segments.length-1];if(last&&last.type===type&&last.monthlyRate===rate/100){last.days++;last.endDate=key}else segments.push({type,startDate:key,endDate:key,days:1,monthlyRate:rate/100,amount:0})}
 if(workingDays){const parsed=workingDaysSchema.safeParse(workingDays);if(!parsed.success)throw new ProbationInputError('INVALID_WORKING_DAYS');for(const type of ['probation','regular'] as const){const segment=segments.find(s=>s.type===type);if(workingDays[type]>(segment?.days||0))throw new ProbationInputError('WORKING_DAYS_EXCEED_EMPLOYMENT_DAYS');if(segment){Object.assign(segment,{eligibleDays:segment.days});segment.days=workingDays[type]}}numerator=segments.reduce((sum,s)=>sum+s.days*s.monthlyRate*100,0)}
 const amount=Math.round(numerator/(100*daysInMonth));segments.forEach(s=>s.amount=Math.round(s.days*s.monthlyRate/daysInMonth));if(segments.length)segments[segments.length-1].amount+=amount-segments.reduce((sum,s)=>sum+s.amount,0)
 return {version:1,month,proration:'calendar_days',timezone:'Asia/Jakarta',daysInMonth,eligibleDays:Math.max(0,until-begin),workingDays:workingDays||null,payableDays:segments.reduce((sum,s)=>sum+s.days,0),formalMonthlySalary:staff.baseSalary,confirmationDate:confirmation,rule:enrollment.enabled?enrollment.rule:null,segments,amount}
}
export async function staffProbation(db: DB, staff: Employee, now=new Date()) {const enrollment=await getEnrollment(db,staff),today=businessDate(now),hire=staff.hireDate?businessDate(staff.hireDate):null,end=hire?confirmationDay(hire,enrollment):null;return {...enrollment,status:hire&&today<hire?'not_started':end&&today<end?'probation':'regular',confirmationDate:end,overrideConfirmationDate:enrollment.confirmationDate||null,formalMonthlySalary:staff.baseSalary,currentMonthlySalary:staff.baseSalary===null?null:monthlyRateCents(staff,enrollment,today)/100} }
export async function calculatePayrollBasis(db: PayrollDB, staff: Employee, month: string, workingDays?: WorkingDays, source: 'estimate'|'manual'|'attendance' = workingDays ? 'manual' : 'estimate') {
 if(!await isPayrollEmployee(db,staff))throw new ProbationInputError('ACCOUNT_NOT_EMPLOYEE')
 if(staff.baseSalary===null)throw new ProbationInputError('STAFF_BASE_SALARY_REQUIRED')
 const enrollment=await getEnrollment(db,staff),available=payrollBasis(staff,enrollment,month)
 const start=new Date(month+'-01T00:00:00+07:00'),end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),1)-7*3600000)
 const records=await db.attendance.findMany({where:{staffId:staff.id,checkInTime:{gte:start,lt:end},status:{not:'absence'}},select:{checkInTime:true,status:true}})
 const dates=new Set(records.filter(r=>r.status!=='absence').map(r=>businessDate(r.checkInTime)))
 const attendanceDays:WorkingDays={probation:0,regular:0}
 for(const date of dates){const segment=available.segments.find(s=>date>=s.startDate&&date<=s.endDate);if(segment)attendanceDays[segment.type]++}
 const basis=payrollBasis(staff,enrollment,month,workingDays || (source==='attendance'?attendanceDays:undefined))
 const rules=await getPayrollRules(db,staff.storeId)
 const fullMonthEligible=!!staff.hireDate&&businessDate(staff.hireDate)<=month+'-01'&&(!staff.terminationDate||dayNumber(businessDate(staff.terminationDate))>=dayNumber(month+'-01')+basis.daysInMonth-1)
 const paidRestDays=source!=='estimate'&&fullMonthEligible?Math.min(rules.paidRestDays,Math.max(0,basis.eligibleDays-basis.payableDays)):0
 // Fixed monthly credits have no leave dates. Across probation/regular rates,
 // use the month's employment-weighted rate and disclose the credit separately.
 const workNumerator=basis.segments.reduce((sum,s)=>sum+Math.round(s.monthlyRate*100)*s.days,0)
 const monthNumerator=available.segments.reduce((sum,s)=>sum+Math.round(s.monthlyRate*100)*s.days,0)
 const totalAmount=Math.round((workNumerator*basis.daysInMonth+monthNumerator*paidRestDays)/(100*basis.daysInMonth*basis.daysInMonth))
 const paidRestAmount=totalAmount-basis.amount
 return {...basis,version:2,workedAmount:basis.amount,amount:basis.amount+paidRestAmount,payableDays:basis.payableDays+paidRestDays,workedDays:basis.payableDays,daysSource:source,attendanceDays,fullMonthEligible,paidRestDays,paidRestAmount,payrollRules:rules}
}
export async function savePayrollBasis(db: PayrollDB, salary: {id:string;staffId:string;month:string;baseSalary:number}, staff: Employee, workingDays?: WorkingDays, manualCorrection=false, metadata: Record<string,unknown> = {}) {if(staff.baseSalary===null)return
 const basis=await calculatePayrollBasis(db,staff,salary.month,workingDays, (metadata.daysSource as 'manual'|'attendance'|undefined) || (workingDays?'manual':'estimate'));await write(db,staff.storeId,basisKey(salary.id),{...basis,...metadata,manualCorrection,recordedBaseSalary:salary.baseSalary,manualAdjustment:salary.baseSalary!==basis.amount})}
export async function savedPayrollBasis(db: DB, storeId:string, salaryId:string) {return read(db,storeId,basisKey(salaryId))}

// Rebase unpaid payroll when the employment dates change; payments remain historical.
export async function refreshEmploymentPayroll(db: Prisma.TransactionClient, staff: Employee) {
 if(staff.baseSalary===null)return
 const salaries=await db.salary.findMany({where:{staffId:staff.id,status:'pending'}})
 for(const listed of salaries){
  await write(db,staff.storeId,`salary.period.${staff.id}.${listed.month}`,listed.month)
  const salary=await db.salary.findUnique({where:{id:listed.id}})
  if(!salary || salary.status!=='pending')continue
  const previous=await savedPayrollBasis(db,staff.storeId,salary.id)
  if(previous?.manualCorrection){await write(db,staff.storeId,basisKey(salary.id),{...previous,employmentNeedsReview:true});continue}
  const available=payrollBasis(staff,await getEnrollment(db,staff),salary.month)
  const days=previous?.workingDays && previous.daysSource!=='attendance' ? {
   probation:Math.min(previous.workingDays.probation,available.segments.find(s=>s.type==='probation')?.days||0),
   regular:Math.min(previous.workingDays.regular,available.segments.find(s=>s.type==='regular')?.days||0)
  }:undefined
  const basis=await calculatePayrollBasis(db,staff,salary.month,days)
  const finalAmount=basis.amount+salary.overtime+salary.commission+salary.bonus-salary.deduction
  if(finalAmount<0)throw new ProbationInputError('SALARY_DEDUCTIONS_EXCEED_TERMINATION_PAY')
  const changed=await db.salary.updateMany({where:{id:salary.id,status:'pending'},data:{baseSalary:basis.amount,finalAmount}})
  if(changed.count){
   await write(db,staff.storeId,`salary.employmentRevision.${salary.id}`,{previousBaseSalary:salary.baseSalary,previousFinalAmount:salary.finalAmount,previousBasis:previous,hireDate:staff.hireDate,terminationDate:staff.terminationDate,updatedAt:new Date().toISOString()})
   await savePayrollBasis(db,{...salary,baseSalary:basis.amount},staff,days)
  }
 }
}

export const isLegacyAutomaticBasis=(basis:any)=>basis?.version!==2&&!basis?.manualCorrection&&!basis?.manualAdjustment&&basis?.daysSource!=='manual'
