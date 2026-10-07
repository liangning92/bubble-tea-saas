import { useTranslation } from 'react-i18next'
import {PageHelp} from './PageHelp'
interface RequestPolicy {reasonCode?:string;selectedItemIds?:string;amount?:number;order?:{items:any[]}}
function selected(request:RequestPolicy):{v2:boolean;rows:{itemId:string;quantity:number;amount?:number}[]}{
 try{const value=JSON.parse(request.selectedItemIds||'[]');if(value?.version===2&&Array.isArray(value.items))return {v2:true,rows:value.items};if(Array.isArray(value))return {v2:false,rows:(request.order?.items||[]).filter(i=>value.includes(i.id)).map(i=>({itemId:i.id,quantity:i.quantity}))}}catch{}
 return {v2:false,rows:[]}
}
export function confirmPreparedRefund(request:RequestPolicy,t:(key:string)=>string):boolean {
 if(!['customer_dissatisfied','paid_unprepared'].includes(request.reasonCode||'')){alert(t('refundPolicy.legacyBlocked'));return false}
 const {v2,rows}=selected(request)
 if(!rows.length||(!v2&&rows.length!==request.order?.items.length)){alert(t('refundPolicy.partialBlocked'));return false}
 return window.confirm(t(request.reasonCode==='paid_unprepared'?'refundPolicy.verifyUnprepared':'refundPolicy.verifyPrepared'))
}
export function RefundPolicyReview({request}:{request:RequestPolicy}){
 const {t}=useTranslation();const {rows}=selected(request)
 return <div className="my-3 p-3 border rounded text-sm space-y-1"><p>{t(`refundPolicy.${request.reasonCode||'legacy'}`)}</p><p>{t('refundPolicy.selected')}: {rows.map(row=>`${row.quantity} × ${request.order?.items.find(i=>i.id===row.itemId)?.productName||row.itemId}${row.amount===undefined?'':` (Rp ${row.amount})`}`).join(', ')||'—'}</p><p>{t('orders.refundAmount')}: Rp {request.amount??'—'}</p><PageHelp><p>{t('itemRefund.manual')}</p><p>{t(request.reasonCode==='paid_unprepared'?'refundPolicy.unpreparedBlocked':'refundPolicy.noRestock')}</p></PageHelp></div>
}
