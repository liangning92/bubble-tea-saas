import { orderDiscountTotal } from '../../../shared/utils/orderDiscount'
import { formatNumber } from '../utils/numberDisplay'
import { useTranslation } from 'react-i18next'
import { formatCurrency, formatDateTime } from '../utils/helpers'
export function OrderSummaryCards({orders,onOpen}:{orders:any[];onOpen:(order:any)=>void}) {
  const {t}=useTranslation()
  return <div className="md:hidden space-y-3">{orders.map(order=><article key={order.id} className="border border-border rounded-xl p-4 bg-white space-y-3">
    <header className="flex flex-wrap justify-between gap-2"><strong className="tabular-nums">{formatCurrency(order.finalAmount ?? order.total)}</strong><span className={`badge ${order.status === 'completed' ? 'badge-success' : order.status === 'pending' ? 'badge-warning' : 'badge-error'}`}>{t('orders.'+order.status,{defaultValue:order.status})}</span></header>
    <dl className="space-y-2">{(order.items?.length?order.items:[{productName:'—',quantity:null}]).map((item:any,index:number)=><div key={index} className="flex justify-between gap-3"><dt className="min-w-0 break-words">{item.productName}</dt><dd className="shrink-0 tabular-nums">× {formatNumber(item.quantity??'—')}</dd></div>)}</dl>
    {orderDiscountTotal(order) > 0 && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 space-y-1" data-testid="order-card-discount">
      <div className="flex justify-between gap-3"><span>{t('orders.totalDiscount')}</span><strong className="shrink-0 tabular-nums">-{formatCurrency(orderDiscountTotal(order))}</strong></div>
      {order.activityName && order.activitySource !== 'points' && <p className="break-words">{order.activityName}</p>}
    </div>}
    <dl className="text-sm text-gray-600 space-y-1"><div className="flex justify-between gap-3"><dt>{t('orders.date')}</dt><dd>{formatDateTime(order.createdAt)}</dd></div><div className="flex justify-between gap-3"><dt>{t('orders.payment')}</dt><dd>{order.paymentMethod==='cash'?t('uiDesign.cash'):order.paymentMethod==='qris'?'QRIS':order.paymentMethod}</dd></div><div className="flex justify-between gap-3"><dt>{t('channels.channel')}</dt><dd>{order.channel?.name||'—'}</dd></div><div className="flex justify-between gap-3"><dt>{t('orders.customer')}</dt><dd>{order.member?.name||order.staff?.name||'—'}</dd></div></dl>
    <button type="button" className="btn-secondary w-full" onClick={()=>onOpen(order)}>{t('common.view')}</button>
  </article>)}</div>
}
