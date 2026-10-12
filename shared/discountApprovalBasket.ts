// Bind authorization to the monetary intent, independent of transport defaults.
export function discountApprovalBasket(body:any):string{
 const value={storeId:body.storeId,basketId:body.discountBasketId,staffId:body.staffId,memberId:body.memberId||null,channelId:body.channelId||null,paymentMethod:body.paymentMethod,taxEnabled:body.taxEnabled!==false,discountAmount:body.discountAmount||0,pointsRedeemed:body.pointsRedeemed||0,activityQuoteSignature:body.activityQuoteSignature||null,items:(body.items||[]).map((i:any)=>({productId:i.productId,specId:i.specId,quantity:i.quantity,unitPrice:i.unitPrice,addons:(i.addons||[]).map((a:any)=>({name:a.name,price:a.price,qty:a.qty||1}))}))}
 const canonical=(v:any):string=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}'
 return canonical(value)
}
