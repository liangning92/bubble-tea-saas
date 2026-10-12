import { allocateRefundTotal, requireRefundEvidence } from './refundAllocation'

export type InsightFilters = {days:number;categoryId?:string;channelId?:string}
export function insightPeriod(days:number,timeZone:string,now=new Date()) {
  if(!Number.isInteger(days)||days<1||days>365)throw Error('INVALID_DAYS')
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now)
  const get=(key:string)=>Number(parts.find(p=>p.type===key)?.value)
  const target=Date.UTC(get('year'),get('month')-1,get('day')-days+1)
  const localMidnight=(local:number)=>{
    let guess=local
    for(let i=0;i<3;i++) {
      const p=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess))
      const n=(k:string)=>Number(p.find(v=>v.type===k)?.value)
      const actual=Date.UTC(n('year'),n('month')-1,n('day'),n('hour'),n('minute'),n('second'))
      guess+=local-actual
    }
    return new Date(guess)
  }
  const start=localMidnight(target),previousStart=localMidnight(target-days*86400000)
  const previousEnd=new Date(previousStart.getTime()+now.getTime()-start.getTime())
  return {start,end:now,previousStart,previousEnd,timeZone,days}
}
export function saleLines(order:any) {
  const refunds=(order.refundRequests||[]).filter((r:any)=>['approved','paid'].includes(r.status))
  let evidence=true,net=new Map<string,number>()
  try {
    requireRefundEvidence(order)
    const beforeTax=order.finalAmount-order.checkoutTaxAmount
    net=allocateRefundTotal(order,beforeTax)
    for(const refund of refunds) {
      const amount=Math.round(refund.amount*beforeTax/Math.max(1,order.finalAmount))
      let ids:any[]=[];try{ids=JSON.parse(refund.selectedItemIds||'[]')}catch{}
      if(refund.reasonCode==='legacy'||(!ids.length&&refund.amount<order.finalAmount))throw Error('REFUND_ALLOCATION_EVIDENCE_REQUIRED')
      const selected=ids.length?order.items.filter((i:any)=>ids.includes(i.id)):order.items
      if(ids.length&&(selected.length!==ids.length||new Set(ids).size!==ids.length))throw Error('REFUND_ALLOCATION_EVIDENCE_REQUIRED')
      if(!selected.length)throw Error('REFUND_ALLOCATION_EVIDENCE_REQUIRED')
      const subtotal=selected.reduce((s:number,i:any)=>s+i.quantity*i.unitPrice,0)
      const allocation=allocateRefundTotal({...order,items:selected,totalAmount:subtotal},amount)
      allocation.forEach((value,id)=>net.set(id,Math.max(0,(net.get(id)||0)-value)))
    }
    if(order.status==='refunded')order.items.forEach((i:any)=>net.set(i.id,0))
  }catch {
    evidence=false
    const gross=order.items.reduce((s:number,i:any)=>s+i.quantity*i.unitPrice,0)
    const base=Math.max(0,gross-(order.discountAmount||0))
    const received=order.status==='refunded'?0:Math.max(0,base-refunds.reduce((s:number,r:any)=>s+r.amount,0))
    order.items.forEach((i:any)=>net.set(i.id,gross?received*i.quantity*i.unitPrice/gross:0))
  }
  const unprepared=new Set<string>()
  for(const r of refunds.filter((r:any)=>r.reasonCode==='paid_unprepared')) {
    let ids:any[]=[];try{ids=JSON.parse(r.selectedItemIds||'[]')}catch{}
    ;(ids.length?ids:order.items.map((i:any)=>i.id)).forEach((id:string)=>unprepared.add(id))
  }
  return order.items.map((item:any)=>({item,quantity:unprepared.has(item.id)?0:item.quantity,cost:unprepared.has(item.id)?0:item.bomCost*item.quantity,revenue:net.get(item.id)||0,evidence,costKnown:item.bomCost>0||unprepared.has(item.id)}))
}
export function summarizeProducts(orders:any[],catalog:any[],filters:InsightFilters) {
  const rows=new Map<string,any>()
  const eligible=(p:any)=>!filters.categoryId||p.categoryId===filters.categoryId
  const init=(p:any,name?:string)=>({productId:p.id,productName:name||p.name,categoryId:p.categoryId,category:p.category?.name||'',quantity:0,revenue:0,cost:0,orderIds:new Set<string>(),costKnown:true,evidence:true})
  catalog.filter(eligible).forEach(p=>rows.set(p.id,init(p)))
  const orderIds=new Set<string>(),channels=new Map<string,any>(),pairs=new Map<string,any>()
  for(const order of orders) {
    if(filters.channelId && order.channelId!==filters.channelId)continue
    const lines=saleLines(order).filter((l:any)=>eligible(l.item.product))
    if(!lines.some((l:any)=>l.quantity>0))continue
    orderIds.add(order.id)
    const unique=new Map<string,string>()
    for(const line of lines) {
      const {item,quantity,revenue,cost,evidence,costKnown}=line
      const row=rows.get(item.productId)||init(item.product,item.productName)
      row.quantity+=quantity;row.revenue+=revenue;row.cost+=cost;row.evidence&&=evidence;row.costKnown&&=costKnown
      if(quantity>0){row.orderIds.add(order.id);unique.set(item.productId,item.productName)}
      rows.set(item.productId,row)
      const key=`${order.channelId||'unassigned'}:${item.productId}`
      const channel=channels.get(key)||{channelId:order.channelId,channel:order.channel?.name||'',productId:item.productId,productName:item.productName,quantity:0}
      channel.quantity+=quantity;channels.set(key,channel)
    }
    const ids=[...unique.keys()].sort()
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++) {
      const key=ids[i]+':'+ids[j],pair=pairs.get(key)||{productIds:[ids[i],ids[j]],names:[unique.get(ids[i]),unique.get(ids[j])],orderCount:0}
      pair.orderCount++;pairs.set(key,pair)
    }
  }
  const list=[...rows.values()].map(({orderIds:ids,...r})=>({...r,orderCount:ids.size,penetration:orderIds.size?ids.size/orderIds.size*100:0,margin:r.quantity&&r.costKnown&&r.evidence&&r.revenue>0?(r.revenue-r.cost)/r.revenue*100:null}))
  const sold=list.filter(r=>r.quantity>0),known=sold.filter(r=>r.margin!==null)
  const avgQuantity=sold.length?sold.reduce((s,r)=>s+r.quantity,0)/sold.length:0
  const knownRevenue=known.reduce((s,r)=>s+r.revenue,0),avgMargin=knownRevenue?(knownRevenue-known.reduce((s,r)=>s+r.cost,0))/knownRevenue*100:0
  for(const row of list)row.matrixType=!row.quantity?'unsold':row.margin===null?'incomplete':row.quantity>=avgQuantity?(row.margin>=avgMargin?'star':'plowhorse'):(row.margin>=avgMargin?'puzzle':'dog')
  const categories=new Map<string,any>()
  list.forEach(r=>{const c=categories.get(r.categoryId)||{id:r.categoryId,name:r.category,quantity:0,revenue:0};c.quantity+=r.quantity;c.revenue+=r.revenue;categories.set(r.categoryId,c)})
  const channelTotals=new Map<string,number>()
  for(const c of channels.values())channelTotals.set(c.channelId||'',(channelTotals.get(c.channelId||'')||0)+c.quantity)
  for(const c of channels.values())c.percentage=channelTotals.get(c.channelId||'')?c.quantity/channelTotals.get(c.channelId||'')!*100:0
  return {list:list.sort((a,b)=>b.quantity-a.quantity||a.productId.localeCompare(b.productId)),categories:[...categories.values()],channels:[...channels.values()].filter(c=>c.quantity>0).sort((a,b)=>b.quantity-a.quantity),pairs:[...pairs.values()].filter(p=>p.orderCount>=5).sort((a,b)=>b.orderCount-a.orderCount).slice(0,10),benchmarks:{avgQuantity,avgMargin},overview:{productsSold:sold.length,quantity:sold.reduce((s,r)=>s+r.quantity,0),unsold:list.length-sold.length,orderCount:orderIds.size,incomplete:sold.filter(r=>r.margin===null).length}}
}
export function productPreferences(orders:any[],productId:string) {
  const specs=new Map<string,any>(),addons=new Map<string,any>();let total=0
  for(const order of orders)for(const {item,quantity} of saleLines(order)) {
    if(item.productId!==productId||quantity<=0)continue
    total+=quantity
    const s=specs.get(item.specId)||{id:item.specId,name:item.specName,quantity:0};s.quantity+=quantity;specs.set(item.specId,s)
    let options:any[]=[];try{const parsed=JSON.parse(item.addons);options=Array.isArray(parsed)?parsed:[]}catch{}
    for(const name of new Set(options.map(a=>a.name).filter(n=>typeof n==='string'&&n))) {
      const a=addons.get(name)||{name,quantity:0};a.quantity+=quantity;addons.set(name,a)
    }
  }
  const ratios=(map:Map<string,any>)=>[...map.values()].map(r=>({...r,percentage:total?r.quantity/total*100:0})).sort((a,b)=>b.quantity-a.quantity)
  return {total,specs:ratios(specs),addons:ratios(addons)}
}
