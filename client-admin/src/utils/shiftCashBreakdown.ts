import type { ShiftCashReconciliation } from '../../../shared/utils/shiftCashReconciliation'

const money = (value: number) => Math.round(value * 100) / 100

// Use the closing snapshot, rather than today's mutable order totals.
export function shiftCashBreakdown(reconciliation: ShiftCashReconciliation | null, actualCash: number | null, recordedDifference: number | null, manualQris: number | null) {
  if (!reconciliation || actualCash === null || !Number.isFinite(actualCash) ||
    ![reconciliation.revenue, reconciliation.expenses, reconciliation.qris, reconciliation.openFloat, reconciliation.expectedCash].every(Number.isFinite)) return null
  const formulaExpected = money(reconciliation.openFloat + reconciliation.revenue - reconciliation.expenses - reconciliation.qris)
  const calculatedDifference = money(actualCash - reconciliation.expectedCash)
  const systemDifference = recordedDifference !== null && Number.isFinite(recordedDifference) ? recordedDifference : calculatedDifference
  const hasManualQris = manualQris !== null && Number.isFinite(manualQris)
  const manualExpected = hasManualQris ? money(reconciliation.openFloat + reconciliation.revenue - reconciliation.expenses - manualQris) : null
  return {
    formulaExpected, calculatedDifference, systemDifference,
    inconsistent: formulaExpected !== reconciliation.expectedCash || systemDifference !== calculatedDifference,
    manualExpected,
    manualDifference: manualExpected === null ? null : money(actualCash - manualExpected),
    qrisDifference: hasManualQris ? money(manualQris - reconciliation.qris) : null,
  }
}
