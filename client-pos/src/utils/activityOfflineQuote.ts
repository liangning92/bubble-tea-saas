import { bestActivityPrice } from '../../../shared/utils/activities'
export function cachedActivityQuote(snapshot:any,input:any,now=new Date()){
 if(!snapshot?.token||now.getTime()>Date.parse(snapshot.expiresAt)||input.memberId||input.couponId||input.pointsRequested||input.groupId)throw Error('ACTIVITY_OFFLINE_POLICY')
 const channel=snapshot.channels.find((c:any)=>c.id===input.channelId||c.code===input.channel)
 if(!channel)throw Error('ACTIVITY_OFFLINE_CATALOG_MISMATCH')
 const items=input.items.map((i:any)=>{const product=snapshot.products.find((p:any)=>p.id===i.productId),spec=product?.specs.find((s:any)=>s.id===i.specId)
 if(!spec)throw Error('ACTIVITY_OFFLINE_CATALOG_MISMATCH')
 const adjustment=product.prices.find((p:any)=>p.channelId===channel.id&&p.enabled)
 const unitPrice=adjustment?Math.round(spec.price*adjustment.multiplier):spec.price
 for(const addon of i.addons||[])if(!product.addonNames?.includes(addon.name)||!snapshot.addons.some((a:any)=>a.name===addon.name&&a.price===addon.price))throw Error('ACTIVITY_OFFLINE_CATALOG_MISMATCH')
 return {...i,unitPrice}})
 const price=bestActivityPrice(snapshot.activities,items,{now,channel:channel.code,paymentMethod:input.paymentMethod})
 const tax=input.taxEnabled===false?0:Math.round(price.finalAmount*snapshot.taxRate)
 return {...price,items,tax,grandTotal:price.finalAmount+tax,pointsRedeemed:0,pendingSelections:[],entitlements:[],offline:true,offlineToken:snapshot.token,occurredAt:now.toISOString(),signature:JSON.stringify({subtotal:price.subtotal,discount:price.discount,applied:price.applied,grandTotal:price.finalAmount+tax})}
}
