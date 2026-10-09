import { useTranslation } from 'react-i18next'
import { ShiftCashReconciliation, shiftCashDifference, formatShiftCash } from '../../../shared/utils/shiftCashReconciliation'
export function ShiftCashCheck({reconciliation,actualCash,refresh}:{reconciliation?:ShiftCashReconciliation|null;actualCash:string;refresh:()=>void}) {
  const {t}=useTranslation(),difference=shiftCashDifference(actualCash,reconciliation)
  return <section className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4" data-testid="shift-cash-check">
    <div className="flex justify-between gap-3"><h3 className="font-bold">{t('cashReconciliation.title')}</h3><button type="button" onClick={refresh} className="text-sm underline">{t('cashReconciliation.refresh')}</button></div>
    <p className="my-2 text-xs text-gray-600">{t('cashReconciliation.formula')}</p>
    <dl className="grid grid-cols-2 gap-3 text-sm">{(['revenue','expenses','qris','cashFromRevenue','openFloat','expectedCash'] as const).map(key=><div key={key}><dt>{t('cashReconciliation.'+key)}</dt><dd data-testid={'cash-check-'+key} className={key==='expectedCash'?'mt-1 text-xl font-bold text-primary':'font-semibold'}>{reconciliation ? formatShiftCash(reconciliation[key]) : t('cashReconciliation.unknown')}</dd></div>)}</dl>
    {difference!==null && <p className={'mt-3 font-semibold '+(difference!==0?'text-red-600':'text-green-700')}>{t('cashReconciliation.difference')}: {formatShiftCash(difference)}</p>}
    {difference!==null && difference!==0 && <p role="alert" className="mt-2 text-sm text-amber-800" data-testid="cash-mismatch-notice">{t('cashReconciliation.warning',{difference:formatShiftCash(difference)})}</p>}
  </section>
}
