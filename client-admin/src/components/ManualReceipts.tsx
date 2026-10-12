import { useTranslation } from 'react-i18next'
import { formatCurrency } from '../utils/helpers'
export type ManualReceiptAmounts = {cash:number;qris:number;shopeefood:number;gofood:number}
export function ManualReceipts({amounts,cashIsDrawer=false,hideCash=false,actualCashReceived,hint}: {amounts:ManualReceiptAmounts|null;cashIsDrawer?:boolean;hideCash?:boolean;actualCashReceived?:number|null;hint?:string}) {
  const {t}=useTranslation()
  return <section className="rounded-xl border bg-white p-4" data-testid="manual-receipts">
    <h3 className="font-semibold">{t('manualReceipts.title')}</h3><p className="my-2 text-sm text-gray-500">{hint || t('manualReceipts.hint')}</p>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{actualCashReceived !== undefined && <div className="rounded-lg bg-emerald-50 p-3" data-testid="revenue-actual-cash"><p className="text-sm text-emerald-700">{t('revenueHandover.actualCash')}</p><p className="mt-1 font-bold tabular-nums text-emerald-700">{actualCashReceived === null ? t('manualReceipts.missing') : formatCurrency(actualCashReceived)}</p></div>}{(['cash','qris','shopeefood','gofood'] as const).filter(key=>!hideCash || key !== 'cash').map(key=><div key={key}><p className="text-sm text-gray-500">{cashIsDrawer && key === 'cash' ? t('shiftHandover.drawerTotal') : t('manualReceipts.'+key)}</p><p className="mt-1 font-semibold tabular-nums">{amounts ? formatCurrency(amounts[key]) : t('manualReceipts.missing')}</p></div>)}</div>
  </section>
}
