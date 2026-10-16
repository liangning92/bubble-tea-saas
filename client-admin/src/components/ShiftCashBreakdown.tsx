import { useTranslation } from 'react-i18next'
import { formatShiftCash, type ShiftCashReconciliation } from '../../../shared/utils/shiftCashReconciliation'
import { shiftCashBreakdown } from '../utils/shiftCashBreakdown'

export function ShiftCashBreakdown({ reconciliation, actualCash, recordedDifference, manualQris }: {
  reconciliation: ShiftCashReconciliation | null; actualCash: number | null; recordedDifference: number | null; manualQris: number | null
}) {
  const { t } = useTranslation()
  const breakdown = shiftCashBreakdown(reconciliation, actualCash, recordedDifference, manualQris)
  const money = formatShiftCash
  return <section className="rounded-xl border bg-white p-4" data-testid="shift-cash-breakdown">
    <h3 className="font-semibold">{t('shiftCashBreakdown.title')}</h3>
    {!breakdown || !reconciliation ? <p className="mt-2 text-sm text-gray-500">{t('shiftCashBreakdown.unavailable')}</p> : <>
      <p className="mt-2 text-sm text-gray-500">{t('shiftCashBreakdown.basis')}</p>
      <dl className="mt-3 grid grid-cols-2 lg:grid-cols-3 gap-4">
        {(['openFloat', 'revenue', 'expenses', 'qris', 'expectedCash'] as const).map(key => <div key={key}>
          <dt className="text-sm text-gray-500">{key === 'qris' ? t('shiftCashBreakdown.orderQris') : t('cashReconciliation.' + key)}</dt>
          <dd className="mt-1 font-semibold" data-testid={'breakdown-' + key}>{money(reconciliation[key])}</dd>
        </div>)}
        <div><dt className="text-sm text-gray-500">{t('cashReconciliation.actualCash')}</dt><dd className="mt-1 font-semibold">{money(actualCash!)}</dd></div>
      </dl>
      <p className="mt-3 text-sm">{t('shiftCashBreakdown.expectedFormula', { float: money(reconciliation.openFloat), revenue: money(reconciliation.revenue), expenses: money(reconciliation.expenses), qris: money(reconciliation.qris), expected: money(breakdown.formulaExpected) })}</p>
      <p className="mt-2 text-sm">{t('shiftCashBreakdown.differenceFormula', { actual: money(actualCash!), expected: money(reconciliation.expectedCash), difference: money(breakdown.calculatedDifference) })}</p>
      <p className="mt-2 font-bold" data-testid="breakdown-system-difference">{t('shiftCashBreakdown.systemDifference')}: {money(breakdown.systemDifference)}</p>
      {breakdown.inconsistent && <p role="alert" className="mt-3 text-sm text-red-700">{t('shiftCashBreakdown.inconsistent')}</p>}
      {breakdown.qrisDifference !== null && <div className={'mt-4 rounded-lg border p-3 ' + (breakdown.qrisDifference !== 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50')}>
        <h4 className="font-semibold">{t('shiftCashBreakdown.qrisComparison')}</h4>
        <dl className="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div><dt>{t('shiftCashBreakdown.manualQris')}</dt><dd className="font-semibold" data-testid="breakdown-manual-qris">{money(manualQris!)}</dd></div>
          <div><dt>{t('shiftCashBreakdown.orderQris')}</dt><dd className="font-semibold">{money(reconciliation.qris)}</dd></div>
          <div><dt>{t('shiftCashBreakdown.qrisDifference')}</dt><dd className="font-semibold" data-testid="breakdown-qris-difference">{money(breakdown.qrisDifference)}</dd></div>
          <div><dt>{t('shiftCashBreakdown.manualDifference')}</dt><dd className="font-semibold" data-testid="breakdown-manual-difference">{money(breakdown.manualDifference!)}</dd></div>
        </dl>
        <p className="mt-3 text-sm">{t('shiftCashBreakdown.manualFormula', { float: money(reconciliation.openFloat), revenue: money(reconciliation.revenue), expenses: money(reconciliation.expenses), qris: money(manualQris!), expected: money(breakdown.manualExpected!), actual: money(actualCash!), difference: money(breakdown.manualDifference!) })}</p>
        <p className="mt-2 text-sm">{t(breakdown.qrisDifference === 0 ? 'shiftCashBreakdown.qrisMatches' : 'shiftCashBreakdown.qrisMismatch')}</p>
      </div>}
      {breakdown.qrisDifference === null && <p className="mt-3 text-sm text-gray-500">{t('shiftCashBreakdown.noManualQris')}</p>}
      <p className="mt-3 text-xs text-gray-500">{t('shiftCashBreakdown.checkReceipts')}</p>
    </>}
  </section>
}
