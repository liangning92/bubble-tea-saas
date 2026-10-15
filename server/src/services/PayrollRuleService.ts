import { z } from 'zod'
import { PrismaClient, Prisma } from '@prisma/client'
import { formatDate } from '../utils/dateUtils'
type DB = Pick<PrismaClient,'config'> | Pick<Prisma.TransactionClient,'config'>
const key = 'staff.payroll.rules'
const days = z.number().min(0).max(366).multipleOf(0.5)
// Accept the old weekend flag for existing clients; explicit weekdays take precedence.
export const payrollRuleSchema = z.object({
 paidRestDays: z.number().min(0).max(31).multipleOf(0.5),
 blockWeekendLeave: z.boolean().optional(),
 blockedLeaveWeekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
 paidRestEligibility: z.enum(['full_month','prorated','any_employment']).default('full_month'),
 allowHalfDayLeave: z.boolean().default(true),
 annualLeaveDays: days.default(12), sickLeaveDays: days.default(14),
 tenureBonusEnabled: z.boolean().default(true), tenureBonusYears: z.number().int().min(1).max(100).default(5), tenureAnnualLeaveDays: days.default(15),
 dailyRateDivisor: z.number().min(1).max(366).default(26), overtimeMonthlyHours: z.number().min(1).max(744).default(176),
 attendanceBonusDays: z.number().min(0).max(31).multipleOf(0.5).default(24), attendanceBonusAmount: z.number().int().min(0).max(2000000000).default(200000),
}).transform(({blockWeekendLeave,blockedLeaveWeekdays,...rest}) => ({...rest,blockedLeaveWeekdays:[...new Set(blockedLeaveWeekdays ?? (blockWeekendLeave === false ? [] : [0,6]))].sort(),blockWeekendLeave:blockedLeaveWeekdays ? blockedLeaveWeekdays.includes(0)&&blockedLeaveWeekdays.includes(6) : blockWeekendLeave ?? true}))
export const defaultPayrollRules = payrollRuleSchema.parse({paidRestDays:2})
export async function getPayrollRules(db:DB,storeId:string) { const row=await db.config.findUnique({where:{storeId_key:{storeId,key}}});return row?payrollRuleSchema.parse(JSON.parse(row.value)):payrollRuleSchema.parse({paidRestDays:2}) }
export async function savePayrollRules(db:DB,storeId:string,input:unknown) {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('INVALID_PAYROLL_RULES')
 const previous=await getPayrollRules(db,storeId)
 const update=input as Record<string,unknown>
 const merged={...previous,...update}
 if('blockWeekendLeave' in update && !('blockedLeaveWeekdays' in update))merged.blockedLeaveWeekdays=update.blockWeekendLeave===false?[]:[0,6]
 const value=payrollRuleSchema.parse(merged);await db.config.upsert({where:{storeId_key:{storeId,key}},create:{storeId,key,category:'staff',value:JSON.stringify(value)},update:{value:JSON.stringify(value)}});return value }
export async function assertWeekdayLeave(db:DB,storeId:string,start:Date,end:Date) {
 const rules=await getPayrollRules(db,storeId)
 const first=new Date(formatDate(start)+'T00:00:00Z'),last=new Date(formatDate(end)+'T00:00:00Z')
 if(!Number.isFinite(first.getTime())||!Number.isFinite(last.getTime())||last<first)throw new Error('INVALID_LEAVE_DATES')
 for(let day=first.getTime();day<=last.getTime();day+=86400000)if(rules.blockedLeaveWeekdays.includes(new Date(day).getUTCDay()))throw new Error(rules.blockedLeaveWeekdays.length===2&&rules.blockWeekendLeave?'WEEKEND_LEAVE_NOT_ALLOWED':'LEAVE_DAY_NOT_ALLOWED')
}
export function leaveEntitlement(rules: ReturnType<typeof payrollRuleSchema.parse>, hireDate: Date, year: number) {
 const yearsEmployed = year - Number(formatDate(hireDate).slice(0,4))
 return {annualLeave:rules.tenureBonusEnabled && yearsEmployed >= rules.tenureBonusYears ? rules.tenureAnnualLeaveDays : rules.annualLeaveDays,sickLeave:rules.sickLeaveDays}
}
