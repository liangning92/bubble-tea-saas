import { useTranslation } from 'react-i18next'
import { formatCurrency } from '../utils/helpers'
export type ManualReceiptAmounts = {cash:number;qris:number;shopeefood:number;gofood:number}
export function ManualReceipts({amounts}: {amounts:ManualReceiptAmounts|null}) {
  const {t}=useTranslation()
  return <section className="rounded-xl border bg-white p-4" data-testid="manual-receipts">
    <h3 className="font-semibold">{t('manualReceipts.title')}</h3><p className="my-2 text-sm text-gray-500">{t('manualReceipts.hint')}</p>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{(['cash','qris','shopeefood','gofood'] as const).map(key=><div key={key}><p className="text-sm text-gray-500">{t('manualReceipts.'+key)}</p><p className="mt-1 font-semibold tabular-nums">{amounts ? formatCurrency(amounts[key]) : t('manualReceipts.missing')}</p></div>)}</div>
  </section>
}
