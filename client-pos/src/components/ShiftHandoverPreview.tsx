import { useTranslation } from 'react-i18next'
import { formatShiftCash } from '../../../shared/utils/shiftCashReconciliation'

export function ShiftHandoverPreview({data,actualCash,receipts,cashierName,shiftName}:{data:any;actualCash:number;receipts:{qris:number;shopeefood:number;gofood:number};cashierName:string;shiftName:string}) {
  const {t,i18n}=useTranslation()
  const r=data.cashReconciliation
  const values={revenue:r.revenue+receipts.shopeefood+receipts.gofood,cash:actualCash-data.shift.openFloat,openFloat:data.shift.openFloat,drawerTotal:actualCash,expenses:r.expenses,...receipts}
  const date=new Date(data.shift.openedAt).toLocaleString(i18n.language,{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})
  return <section className="mb-4 rounded-xl border bg-white p-4" data-testid="handover-preview">
    <h3 className="text-lg font-bold">{t('handoverFlow.title')}</h3>
    <dl className="mt-3 space-y-3">
      <div className="flex justify-between gap-3"><dt>{t('handoverFlow.dateShift')}</dt><dd className="font-semibold text-right">{date} · {shiftName}</dd></div>
      <div className="flex justify-between gap-3"><dt>{t('handoverFlow.cashier')}</dt><dd className="font-semibold">{cashierName}</dd></div>
      {(Object.keys(values) as (keyof typeof values)[]).map(key=><div key={key} className="flex justify-between gap-3 border-t pt-2"><dt>{t('handoverFlow.'+key)}</dt><dd data-testid={'handover-'+key} className="font-bold">{formatShiftCash(values[key])}</dd></div>)}
    </dl>
  </section>
}
