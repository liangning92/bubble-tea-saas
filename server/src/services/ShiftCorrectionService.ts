import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { CASH_WARNING_PREFIX, applyHandoverQris, cashWarningFor, CashReviewError } from './ShiftCashReconciliation'
import { manualReceiptsSchema } from './ShiftManualReceipts'
import { shiftHandoverFinancials } from './ShiftHandoverFinancials'

const amount = z.number().int().min(0).max(2147483647)
export const shiftCorrectionSchema = z.object({
  updatedAt: z.string().datetime(), openFloat: amount,
  manualReceipts: manualReceiptsSchema.optional(), reason: z.string().trim().min(1).max(2000)
}).strict()

export async function correctShift(db: Pick<PrismaClient, '$transaction'>, actor: {id:string;storeId:string;role:string}, id:string, body:unknown) {
  if (actor.role !== 'admin') throw new CashReviewError(403, 'ADMIN_REQUIRED')
  const input = shiftCorrectionSchema.parse(body)
  return db.$transaction(async tx => {
    await tx.store.update({where:{id:actor.storeId},data:{updatedAt:new Date()}})
    const session = await tx.shiftSession.findFirst({where:{id,storeId:actor.storeId}})
    if (!session) throw new CashReviewError(404, 'SHIFT_NOT_FOUND')
    if (session.updatedAt.toISOString() !== input.updatedAt) throw new CashReviewError(409, 'SHIFT_CHANGED_REFRESH')
    const where = {storeId_key:{storeId:actor.storeId,key:'pos.shift.report:'+id}}
    const row = await tx.config.findUnique({where})
    const report = row ? JSON.parse(row.value) : null
    const oldWarning = await tx.config.findUnique({where:{storeId_key:{storeId:actor.storeId,key:CASH_WARNING_PREFIX+id}}})
    const original = JSON.stringify({session,report,cashWarning:oldWarning ? JSON.parse(oldWarning.value) : null})
    const actualCash = input.manualReceipts?.cash
    let data: any = {openFloat:input.openFloat}
    let corrected = report
    if (session.status === 'closed') {
      if (!report?.cashReconciliation || actualCash === undefined || !input.manualReceipts) throw new CashReviewError(409, 'SHIFT_REPORT_REQUIRED')
      const reconciliation = applyHandoverQris({...report.cashReconciliation,openFloat:input.openFloat},input.manualReceipts.qris)
      const difference = Math.round((actualCash-reconciliation.expectedCash)*100)/100
      const int = (value:number) => Number.isSafeInteger(value) && value >= -2147483648 && value <= 2147483647
      data = {...data,actualCash:actualCash,expectedCash:int(reconciliation.expectedCash)?reconciliation.expectedCash:0,cashDifference:int(difference)?difference:null}
      corrected = {...report,openFloat:input.openFloat,actualCash:actualCash,manualReceipts:input.manualReceipts,manualReceiptsCashBasis:'drawer_total',cashReconciliation:reconciliation,expectedCash:reconciliation.expectedCash,recordedBalance:reconciliation.expectedCash,cashDifference:difference,
        handoverFinancials:shiftHandoverFinancials(actualCash,input.openFloat,reconciliation.expenses,input.manualReceipts.qris,input.manualReceipts.shopeefood,input.manualReceipts.gofood,reconciliation.revenue),correctedAt:new Date().toISOString(),correctedBy:actor.id}
      await tx.config.update({where,data:{value:JSON.stringify(corrected)}})
      const warning = cashWarningFor(id,actualCash,reconciliation,new Date())
      const warningWhere = {storeId_key:{storeId:actor.storeId,key:CASH_WARNING_PREFIX+id}}
      if (warning) await tx.config.upsert({where:warningWhere,create:{storeId:actor.storeId,key:CASH_WARNING_PREFIX+id,category:'shift_report',value:JSON.stringify(warning)},update:{value:JSON.stringify(warning)}})
      else await tx.config.deleteMany({where:{storeId:actor.storeId,key:CASH_WARNING_PREFIX+id}})
    } else if (session.status === 'open' && actualCash === undefined && input.manualReceipts === undefined) {
      const expected = session.expectedCash + input.openFloat-session.openFloat
      data.expectedCash = Math.max(-2147483648,Math.min(2147483647,expected))
    } else throw new CashReviewError(400, 'SHIFT_CORRECTION_INVALID')
    const changed = await tx.shiftSession.updateMany({where:{id,storeId:actor.storeId,updatedAt:session.updatedAt,status:session.status},data})
    if (changed.count !== 1) throw new CashReviewError(409, 'SHIFT_CHANGED_REFRESH')
    await tx.financeAuditLog.create({data:{storeId:actor.storeId,userId:actor.id,action:'update',entityType:'shift_correction',entityId:id,description:input.reason,oldValue:original,newValue:JSON.stringify({changes:data,report:corrected})}})
    return tx.shiftSession.findUniqueOrThrow({where:{id}})
  })
}
