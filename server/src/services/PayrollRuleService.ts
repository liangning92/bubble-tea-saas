import { z } from 'zod'
import { PrismaClient, Prisma } from '@prisma/client'
import { formatDate } from '../utils/dateUtils'
type DB = Pick<PrismaClient,'config'> | Pick<Prisma.TransactionClient,'config'>
const key='staff.payroll.rules'
export const payrollRuleSchema=z.object({paidRestDays:z.number().min(0).max(31).multipleOf(0.5),blockWeekendLeave:z.literal(true).default(true)})
export const defaultPayrollRules={paidRestDays:2,blockWeekendLeave:true as const}
export async function getPayrollRules(db:DB,storeId:string){const row=await db.config.findUnique({where:{storeId_key:{storeId,key}}});return row?payrollRuleSchema.parse(JSON.parse(row.value)):defaultPayrollRules}
export async function savePayrollRules(db:DB,storeId:string,input:unknown){const value=payrollRuleSchema.parse(input);await db.config.upsert({where:{storeId_key:{storeId,key}},create:{storeId,key,category:'staff',value:JSON.stringify(value)},update:{value:JSON.stringify(value)}});return value}
export async function assertWeekdayLeave(db:DB,storeId:string,start:Date,end:Date){
 await getPayrollRules(db,storeId)
 const first=new Date(formatDate(start)+'T00:00:00Z'),last=new Date(formatDate(end)+'T00:00:00Z')
 if(!Number.isFinite(first.getTime())||!Number.isFinite(last.getTime())||last<first)throw new Error('INVALID_LEAVE_DATES')
 for(let day=first.getTime();day<=last.getTime();day+=86400000){const weekday=new Date(day).getUTCDay();if(weekday===0||weekday===6)throw new Error('WEEKEND_LEAVE_NOT_ALLOWED')}
}
