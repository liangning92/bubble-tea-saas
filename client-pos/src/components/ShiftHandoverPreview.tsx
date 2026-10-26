import { useTranslation } from 'react-i18next'
import { formatShiftCash } from '../../../shared/utils/shiftCashReconciliation'
import { resolveHandoverReceiptItems, type HandoverReceiptField } from '../../../shared/utils/handoverReceipt'

export function ShiftHandoverPreview({data,actualCash,receipts,cashierName,shiftName,settings}:{data:any;actualCash:number;receipts:{qris:number;shopeefood:number;gofood:number};cashierName:string;shiftName:string;settings:any}) {
  const {t,i18n}=useTranslation()
  const items=resolveHandoverReceiptItems(settings)
  const r=data.cashReconciliation
  const values={revenue:r.revenue+receipts.shopeefood+receipts.gofood,cash:actualCash-data.shift.openFloat,openFloat:data.shift.openFloat,drawerTotal:actualCash,expenses:r.expenses,...receipts}
  const fields:Record<keyof typeof values,HandoverReceiptField>={revenue:'revenue',cash:'cashReceived',openFloat:'openFloat',drawerTotal:'closeCash',expenses:'expenseAmount',qris:'qrisReceipts',shopeefood:'shopeefoodReceipts',gofood:'gofoodReceipts'}
  const date=new Date(data.shift.openedAt).toLocaleString(i18n.language,{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})
  const dateShift=[items.openedAt ? date : null,items.shiftType ? shiftName : null].filter(Boolean).join(' · ')
  return <section className="mb-4 rounded-xl border bg-white p-4" data-testid="handover-preview">
    <h3 className="text-lg font-bold">{t('handoverFlow.title')}</h3>
    <dl className="mt-3 space-y-3">
      {dateShift && <div className="flex justify-between gap-3"><dt>{t('handoverFlow.dateShift')}</dt><dd className="min-w-0 break-words font-semibold text-right">{dateShift}</dd></div>}
      {items.cashierName && <div className="flex justify-between gap-3"><dt>{t('handoverFlow.cashier')}</dt><dd className="min-w-0 break-words font-semibold text-right">{cashierName}</dd></div>}
      {(Object.keys(values) as (keyof typeof values)[]).filter(key=>items[fields[key]]).map(key=><div key={key} className="flex justify-between gap-3 border-t pt-2"><dt className="min-w-0">{t('handoverFlow.'+key)}</dt><dd data-testid={'handover-'+key} className="shrink-0 font-bold text-right">{formatShiftCash(values[key])}</dd></div>)}
      {(['orderCount','cupCount'] as const).filter(key=>items[key]).map(key=><div key={key} className="flex justify-between gap-3 border-t pt-2"><dt>{t('handoverFlow.'+key)}</dt><dd data-testid={'handover-'+key} className="font-bold">{data.summaryEvidence?.[key] ?? t('handoverFlow.unverified')}</dd></div>)}
      {items.activityDiscount && typeof data.summaryEvidence?.activityDiscountAmount==='number' && <div className="flex justify-between gap-3 border-t pt-2"><dt>{t('handoverFlow.activityDiscount')}</dt><dd data-testid="handover-activityDiscount" className="font-bold text-amber-700">{formatShiftCash(data.summaryEvidence.activityDiscountAmount)}</dd></div>}
      {items.totalDiscount && typeof data.summaryEvidence?.totalDiscountAmount==='number' && <div className="flex justify-between gap-3 border-t pt-2"><dt>{t('handoverFlow.totalDiscount')}</dt><dd data-testid="handover-totalDiscount" className="font-bold text-amber-700">{formatShiftCash(data.summaryEvidence.totalDiscountAmount)}</dd></div>}
      {items.expenses && <div className="border-t pt-2" data-testid="handover-expense-details"><dt>{t('handoverFlow.expenseDetails')}</dt><dd className="mt-2 space-y-2">{data.purchaseExpenses?.items?.map((item:any,index:number)=><div key={index} className="flex justify-between gap-3"><span className="min-w-0 break-words">{item.category} x{item.quantity ?? '-'}{item.description ? ' · '+item.description : ''}</span><span className="shrink-0">{formatShiftCash(item.amount)}</span></div>)}<div className="text-right font-bold">{typeof data.purchaseExpenses?.total === 'number' ? formatShiftCash(data.purchaseExpenses.total) : t('handoverFlow.unverified')}</div></dd></div>}
    </dl>
  </section>
}
