/** Quantities are ledger base units; count and sales adjustments are not physical movements. */
export function reconciliationMovement(direction:'in'|'out',log:{quantity:number;reason?:string|null;note?:string|null}) {
 let note:any={};try{note=JSON.parse(log.note||'{}')}catch{}
 if(!Number.isFinite(log.quantity))return {incoming:0,outgoing:0,unknown:true}
 if(direction==='in'){
  if(note.kind==='receipt'||log.note?.startsWith('加工产出: '))return {incoming:log.quantity,outgoing:0,unknown:false}
  return {incoming:0,outgoing:0,unknown:true}
 }
 if(['count_adjustment','sale_estimate','sale_estimate_reversal','receipt_cost_adjustment'].includes(log.reason||''))return {incoming:0,outgoing:0,unknown:false}
 if(['internal_transfer','internal_conversion'].includes(note.stockEffect))return {incoming:0,outgoing:0,unknown:false}
 if(note.stockEffect==='physical_out'||['withdrawal','loss','expired','other','transfer','process','sold','refund_unprepared'].includes(log.reason||''))return {incoming:0,outgoing:log.quantity,unknown:false}
 return {incoming:0,outgoing:0,unknown:true}
}
export function reconciliationBalance(opening:number,receipts:number,actualOut:number,closing:number|null,criticalPercent=20){
 const round=(v:number)=>Math.round(v*1e9)/1e9
 const expectedClosing=round(opening+receipts-actualOut)
 const variance=closing===null?null:round(closing-expectedClosing)
 const variancePercent=variance===null||expectedClosing===0?null:Math.abs(variance)/Math.abs(expectedClosing)*100
 const mismatch=variance!==null&&Math.abs(variance)>=1e-6
 return {expectedClosing,variance,variancePercent,varianceStatus:closing===null?'awaiting_count':!mismatch?'normal':variancePercent!==null&&variancePercent>=criticalPercent?'critical':'warning'}
}
