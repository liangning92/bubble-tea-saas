import { formatNumber } from '../utils/numberDisplay'
import { notifyAdmin, confirmAdmin } from './AdminFeedback'
import { OrderItemsTable } from './OrderItemsTable'
import { useTranslation } from 'react-i18next'
import {PageHelp} from './PageHelp'
interface RequestPolicy {reasonCode?:string;selectedItemIds?:string;amount?:number;order?:{items:any[]}}
function selected(request:RequestPolicy):{v2:boolean;rows:{itemId:string;quantity:number;amount?:number}[]}{
 try{const value=JSON.parse(request.selectedItemIds||'[]');if(value?.version===2&&Array.isArray(value.items))return {v2:true,rows:value.items};if(Array.isArray(value))return {v2:false,rows:(request.order?.items||[]).filter(i=>value.includes(i.id)).map(i=>({itemId:i.id,quantity:i.quantity}))}}catch{}
 return {v2:false,rows:[]}
}
export async function confirmPreparedRefund(request:RequestPolicy,t:(key:string)=>string):Promise<boolean> {
 if(!['customer_dissatisfied','paid_unprepared'].includes(request.reasonCode||'')){notifyAdmin(t('refundPolicy.legacyBlocked'));return false}
 const {v2,rows}=selected(request)
 if(!rows.length||(!v2&&rows.length!==request.order?.items.length)){notifyAdmin(t('refundPolicy.partialBlocked'));return false}
 return await confirmAdmin(t(request.reasonCode==='paid_unprepared'?'refundPolicy.verifyUnprepared':'refundPolicy.verifyPrepared'))
}
export function RefundPolicyReview({request}:{request:RequestPolicy}){
 const {t}=useTranslation();const {rows}=selected(request)
 return <div className="my-3 p-3 border rounded text-sm space-y-1"><p>{t(`refundPolicy.${request.reasonCode||'legacy'}`)}</p><p>{t('refundPolicy.selected')}</p><OrderItemsTable items={rows.map(row=>({productName:request.order?.items.find(i=>i.id===row.itemId)?.productName || '—',quantity:row.quantity}))} amount={(_,index)=>rows[index].amount===undefined?'—':`Rp ${formatNumber(rows[index].amount)}`} /><p>{t('orders.refundAmount')}: Rp {formatNumber(request.amount??'—')}</p><PageHelp><p>{t('itemRefund.manual')}</p><p>{t(request.reasonCode==='paid_unprepared'?'refundPolicy.unpreparedBlocked':'refundPolicy.noRestock')}</p></PageHelp></div>
}
