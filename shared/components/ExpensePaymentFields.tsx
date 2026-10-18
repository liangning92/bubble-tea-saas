import { LocalizedDateTimeInput } from './LocalizedDateTimeInput'
import { useTranslation } from 'react-i18next'
export function ExpensePaymentFields({source,onSource,date,onDate,disabled=false,allowDrawer=true,fixedSource=false}:{source:string;onSource:(s:string)=>void;date?:string;onDate?:(s:string)=>void;disabled?:boolean;allowDrawer?:boolean;fixedSource?:boolean}){
 const {t}=useTranslation()
 return <section className="space-y-2 min-w-0 rounded-xl border p-3" aria-label={t('expensePayment.title')}>
  {fixedSource?<p className="text-sm">{t('expensePayment.purchaseOnline')}</p>:<label className="block text-sm">{t('expensePayment.source')}<select aria-label={t('expensePayment.source')} className="input w-full block mt-1 border rounded-lg p-2" disabled={disabled} value={source} onChange={e=>onSource(e.target.value)}>
   {['unknown','online_payment','owner_transfer','personal','other',...(allowDrawer?['drawer_cash']:[])].map(s=><option key={s} value={s}>{t('expensePayment.'+s)}</option>)}
  </select></label>}
  {onDate&&<label className="block text-sm">{t('expensePayment.date')}<LocalizedDateTimeInput aria-label={t('expensePayment.date')} className="input w-full block mt-1 border rounded-lg p-2" type="date" required value={date||''} onChange={e=>onDate(e.target.value)} disabled={disabled}/></label>}
  <p className="text-xs text-gray-600">{t('expensePayment.hint')}</p>
 </section>
}
