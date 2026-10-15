/** Integer rupiah/points math; earned points use the original occurrence date in Jakarta. */
export function offlineEarnedPoints(amount:number,member:any,rule:any,at:string):number {
 if(!rule?.isActive||!Number.isSafeInteger(amount)||amount<rule.minPurchase||!Number.isSafeInteger(rule.pointsPerRupiah)||rule.pointsPerRupiah<=0)return 0
 let points=Math.floor(amount/rule.pointsPerRupiah)
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',month:'2-digit',day:'2-digit'}).format(new Date(at))
 if(member.birthday&&day===new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',month:'2-digit',day:'2-digit'}).format(new Date(member.birthday)))points=Math.floor(points*rule.birthdayMultiplier)
 const tiers=JSON.parse(rule.tierMultiplier||'{}');points=Math.floor(points*(tiers[member.level]||1))
 if(!Number.isSafeInteger(points)||points<0)throw Error('OFFLINE_MEMBER_AMOUNT_INVALID')
 return points
}
export function offlineMemberCandidates(evidence:any,input:any,items:any[],now:Date){
 const member=evidence?.member
 if(!member||member.id!==input.memberId||member.status!=='active'||!Number.isSafeInteger(member.points)||member.points<0)throw Error('OFFLINE_MEMBER_UNAVAILABLE')
 const extras:any[]=[],subtotal=items.reduce((s,i)=>s+i.quantity*(i.unitPrice+(i.addons||[]).reduce((n:any,a:any)=>n+a.price*(a.qty||1),0)),0)
 const redeemed=Math.min(input.pointsRequested||0,member.points,subtotal*100)
 if(redeemed>=100)extras.push({id:'points',version:0,name:'Points',discount:Math.floor(redeemed/100),priority:0,kind:'points',pointsRedeemed:Math.floor(redeemed/100)*100})
 if(input.couponId){
  const record=evidence.coupons.find((c:any)=>c.id===input.couponId&&c.status==='unused'),c=record?.coupon
  if(!c||c.status!=='active'||Date.parse(c.validFrom)>now.getTime()||Date.parse(c.validUntil)<=now.getTime()||(c.usageLimit&&c.usedCount>=c.usageLimit)||subtotal<c.minOrder)throw Error('ACTIVITY_COUPON_UNAVAILABLE')
  const basic=items.reduce((s,i)=>s+i.unitPrice*i.quantity,0)
  let discount=c.type==='discount_fixed'?c.value:c.type==='discount_percent'?Math.round(basic*c.value/100):0
  if(c.type==='free_product'){const cheapest=items.length?Math.min(...items.map(i=>i.unitPrice)):0;discount=Math.min(cheapest,c.value>0?c.value:cheapest)}
  extras.push({id:record.id,version:0,name:c.code,discount:Math.min(c.type==='discount_fixed'?subtotal:basic,discount,c.maxDiscount||Infinity),priority:0,kind:'coupon'})
 }
 return extras
}
