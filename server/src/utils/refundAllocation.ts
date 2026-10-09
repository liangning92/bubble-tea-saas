export type RefundLine = {id:string; quantity:number; unitPrice:number;addons?:unknown}
export type RefundSelection = {itemId:string; quantity:number}
export type RefundOrder = {items:RefundLine[];totalAmount:number;finalAmount:number;checkoutTaxAmount:number|null;requestFingerprint:string|null}
const integer=(n:number)=>Number.isSafeInteger(n)&&n>=0
export function allocateRefundTotal(order:RefundOrder,total:number):Map<string,number>{
 const lines=[...order.items].sort((a,b)=>a.id.localeCompare(b.id))
 if(!integer(total)||!integer(order.totalAmount)||order.totalAmount<=0||!lines.length||lines.some(i=>!Number.isSafeInteger(i.quantity)||i.quantity<=0||!integer(i.unitPrice)||!integer(i.quantity*i.unitPrice)))throw Error('REFUND_ALLOCATION_EVIDENCE_REQUIRED')
 const baseTotal=lines.reduce((s,i)=>s+i.quantity*i.unitPrice,0)
 const lineAmount=(i:RefundLine)=>{if(baseTotal===order.totalAmount)return i.quantity*i.unitPrice
   let addons:any=i.addons||[];if(typeof addons==='string'){try{addons=JSON.parse(addons)}catch{throw Error('REFUND_ALLOCATION_EVIDENCE_REQUIRED')}}
   if(!Array.isArray(addons)||addons.some(a=>!integer(a.price)||!Number.isSafeInteger(a.qty??1)||(a.qty??1)<1))throw Error('REFUND_ALLOCATION_EVIDENCE_REQUIRED')
   return i.quantity*(i.unitPrice+addons.reduce((s,a)=>s+a.price*(a.qty??1),0))
 }
 if(lines.reduce((s,i)=>s+lineAmount(i),0)!==order.totalAmount)throw Error('REFUND_ALLOCATION_EVIDENCE_REQUIRED')
 const denominator=BigInt(order.totalAmount)
 const parts=lines.map(i=>{const n=BigInt(total)*BigInt(lineAmount(i));return {id:i.id,amount:Number(n/denominator),remainder:n%denominator}})
 let remaining=total-parts.reduce((s,p)=>s+p.amount,0)
 for(const part of [...parts].sort((a,b)=>a.remainder===b.remainder?a.id.localeCompare(b.id):a.remainder>b.remainder?-1:1)){if(remaining--<=0)break;part.amount++}
 return new Map(parts.map(p=>[p.id,p.amount]))
}
export function unitRangeAmount(total:number,units:number,start:number,count:number){
 if(![total,units,start,count].every(integer)||units===0||start+count>units)throw Error('INVALID_REFUND_ITEMS')
 const base=Math.floor(total/units),extra=total%units
 return base*count+Math.max(0,Math.min(start+count,extra)-Math.min(start,extra))
}
export function canonicalSelection(items:unknown):RefundSelection[]{
 if(!Array.isArray(items)||!items.length||items.length>500)throw Error('INVALID_REFUND_ITEMS')
 const rows=items.map(i=>{if(!i||typeof i.itemId!=='string'||!Number.isSafeInteger(i.quantity)||i.quantity<=0)throw Error('INVALID_REFUND_ITEMS');return {itemId:i.itemId,quantity:i.quantity}})
 if(new Set(rows.map(i=>i.itemId)).size!==rows.length)throw Error('INVALID_REFUND_ITEMS')
 return rows.sort((a,b)=>a.itemId.localeCompare(b.itemId))
}
export function requireRefundEvidence(order:RefundOrder){
 if(!order.requestFingerprint?.startsWith('v1:')||order.checkoutTaxAmount===null||!integer(order.checkoutTaxAmount)||!integer(order.finalAmount)||order.finalAmount<order.checkoutTaxAmount||order.finalAmount-order.checkoutTaxAmount>order.totalAmount)throw Error('REFUND_ALLOCATION_EVIDENCE_REQUIRED')
}

/** Net original-order receipts for reports; never rewrite the immutable sale snapshot. */
export function netReceivedAmount(order:{finalAmount:number;status?:string;refundRequests?:{amount:number;status:string}[]}) {
 if(order.status==='refunded')return 0
 const refunded=(order.refundRequests||[]).filter(r=>r.status==='approved'||r.status==='paid').reduce((sum,r)=>sum+r.amount,0)
 return Math.max(0,order.finalAmount-refunded)
}
