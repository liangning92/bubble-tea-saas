// Synthetic contract for device/upgrade tests whose store has no campaigns.
// Real discounts, signed-cache verification and grants are exercised by unified-activity-integration.cjs.
exports.emptyActivityQuotes=async(context,{isOffline=()=>false,specialPrice,products=[{id:'p',specs:[{id:'s',price:10000}],prices:[],addonNames:[]}]}={})=>{
 const activity=specialPrice===undefined?[]:[{id:'daily-test',version:1,used:0,type:'special_price',name:'Synthetic daily special',status:'published',priority:0,timezone:'Asia/Jakarta',weekdays:[],channels:['DINE_IN'],paymentMethods:[],productIds:['p'],specIds:[],memberOnly:false,memberLevels:[],rule:{price:specialPrice}}];
 await context.route('**/api/marketing/activities/quote',async route=>{
  if(isOffline())return route.abort('internetdisconnected');const input=route.request().postDataJSON();const prices=new Map(input.items.map(i=>[i.productId+":"+i.specId,i.unitPrice]));const items=input.items.map(i=>({...i,unitPrice:prices.get(i.productId+":"+i.specId)}));
  const subtotal=items.reduce((s,i)=>s+i.quantity*(i.unitPrice+(i.addons||[]).reduce((n,a)=>n+a.price*(a.qty||1),0)),0);
  const tax=input.taxEnabled===false?0:Math.round(subtotal*.11);
  await route.fulfill({contentType:'application/json',body:JSON.stringify({code:200,data:{items,subtotal,discount:0,finalAmount:subtotal,tax,grandTotal:subtotal+tax,applied:null,pointsRedeemed:0,pendingSelections:[],entitlements:[],signature:'synthetic-'+JSON.stringify(input)}})});
 });
 await context.route('**/api/marketing/activities/offline-snapshot',route=>isOffline()?route.abort('internetdisconnected'):route.fulfill({contentType:'application/json',body:JSON.stringify({code:200,data:{token:'synthetic-owned-fixture-only',expiresAt:new Date(Date.now()+86400000).toISOString(),activities:activity,channels:[{id:'dine_in',code:'DINE_IN'},{id:'takeaway',code:'TAKEAWAY'}],products,addons:[],taxRate:.11}})}));
};
