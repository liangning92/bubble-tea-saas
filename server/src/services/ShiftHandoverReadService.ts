import prisma from '../config/database'
import { loadShiftCashReviews } from './ShiftCashReconciliation'
import { summarizeShiftPurchases } from './PosExpenseService'

// Reprints use audited payment corrections without changing the original handover snapshot.
export async function readShiftHandover(storeId: string, id: string, db = prisma) {
  const session = await db.shiftSession.findFirst({ where: { id, storeId, status: 'closed' } })
  if (!session) return null
  const [snapshot, reportRow] = await Promise.all([
    db.config.findUnique({ where: { storeId_key: { storeId, key: 'pos.shift.purchase:' + id } } }),
    db.config.findUnique({ where: { storeId_key: { storeId, key: 'pos.shift.report:' + id } } })
  ])
  let report = reportRow ? JSON.parse(reportRow.value) : null
  let purchaseExpenses = snapshot ? JSON.parse(snapshot.value) : null
  const reviewed = (await loadShiftCashReviews(db, storeId, [id])).get(id)?.cashReconciliation
  if (report && reviewed?.expenseReview) {
    purchaseExpenses = await summarizeShiftPurchases(storeId, new Date(reviewed.windowStart), new Date(reviewed.windowEnd), db)
    report = { ...report, cashReconciliation: reviewed, expectedCash: reviewed.expectedCash,
      cashDifference: session.actualCash === null ? null : session.actualCash - reviewed.expectedCash,
      purchaseExpenses,
      handoverFinancials: report.handoverFinancials ? { ...report.handoverFinancials, expenses: reviewed.expenses } : report.handoverFinancials }
  }
  return { ...session, expectedCash: report?.expectedCash ?? null, cashDifference: report?.cashDifference ?? null, purchaseExpenses, report }
}
