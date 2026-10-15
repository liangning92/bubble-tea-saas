import {db} from '../db/offline'
import {localIdentity} from './offlineSale'
import {readBackendAuth} from './backendIdentity'
import {cachedActivityQuote} from './activityOfflineQuote'
const prefix=()=>{const a=readBackendAuth();if(!a.user?.storeId||!a.user.id)throw Error('CHECKOUT_BACKEND_LOGIN_REQUIRED');return `offline.members:${encodeURIComponent(localIdentity(a.user.storeId))}:${encodeURIComponent(a.user.storeId)}:${a.user.id}:`}
async function authority(){
 const a=readBackendAuth(),scope=prefix(),g=(await db.config.get(`offline.authorization:${encodeURIComponent(localIdentity(a.user!.storeId!))}:${encodeURIComponent(a.user!.storeId!)}:${a.user!.id}`))?.value
 if(!g?.permissions?.includes('members.read')||!Number.isFinite(Date.parse(g.expiresAt))||Date.parse(g.expiresAt)<=Date.now())throw Error('OFFLINE_MEMBER_AUTHORIZATION_REQUIRED')
 return {auth:a,scope}
}
/** Publish all pages atomically; a failed refresh leaves the previous complete directory intact. */
export async function prepareOfflineMembers(request:(after?:string)=>Promise<any>){
 if(await pendingOfflineMembers())return
 const {auth,scope}=await authority()
 const complete=await db.config.get(scope+'$complete');if(complete&&Date.now()-new Date(complete.updatedAt).getTime()<5*60000)return
 const rows:any[]=[];let after:string|undefined;const seen=new Set<string>()
 do{
  const response=await request(after),page=response.data?.data
  if(!Array.isArray(page?.members))throw Error('OFFLINE_MEMBERS_UNAVAILABLE')
  for(const row of page.members){if(!row.token||seen.has(row.member.id))throw Error('OFFLINE_MEMBERS_UNAVAILABLE');seen.add(row.member.id);rows.push(row)}
  if(page.next===after)throw Error('OFFLINE_MEMBERS_UNAVAILABLE');after=page.next||undefined
 }while(after)
 if(prefix()!==scope||readBackendAuth().user?.id!==auth.user?.id)throw Error('CHECKOUT_AUTH_CHANGED')
 await db.transaction('rw',db.config,async()=>{
  await db.config.where('key').startsWith(scope).delete()
  await db.config.bulkPut(rows.map(value=>({key:scope+value.member.id,value,updatedAt:new Date()})))
  await db.config.put({key:scope+'$complete',value:true,updatedAt:new Date()})
 })
}
export async function offlineMemberEvidence(id:string){
 const {auth,scope}=await authority(),row=await db.config.get(scope+id)
 const evidence=structuredClone(row?.value)
 if(!evidence?.token||!Number.isFinite(Date.parse(evidence.expiresAt))||!Number.isFinite(Date.parse(evidence.issuedAt))||Date.parse(evidence.expiresAt)<=Date.now()||Date.parse(evidence.issuedAt)>Date.now())throw Error('OFFLINE_MEMBERS_UNAVAILABLE')
 const included=new Set(evidence.includedOrders||[])
 const orders=await db.orders.where('[backendUrl+storeId]').equals([localIdentity(auth.user!.storeId!),auth.user!.storeId!]).filter(o=>(!!o.locallyAcceptedAt||o.checkoutResolution==='accepted'&&o.status==='synced')&&!['rejected','discarded'].includes(o.checkoutResolution||'')&&!included.has(o.orderNumber)).sortBy('createdAt')
 for(const o of orders){
  const request=o.checkoutRequest as any
  const effects=o.cloudReceipt?.memberEffects as any
  if(request?.memberId===id){
   if(o.locallyAcceptedAt&&request.offlineMemberPointsBefore!==evidence.member.points)throw Error('OFFLINE_MEMBER_LEDGER_CONFLICT')
   // Older online receipts carry no earned-points evidence: withhold that bonus until refreshed.
   const earned=o.locallyAcceptedAt?request.offlineMemberPointsEarned:effects?.pointsEarned||0
   const redeemed=o.locallyAcceptedAt?request.pointsRedeemed:effects?.pointsRedeemed??request.pointsRedeemed
   evidence.member.points=Math.max(0,evidence.member.points+Number(earned||0)-Number(redeemed||0))
   evidence.member.totalSpent+=o.finalAmount
  }
  const couponId=o.locallyAcceptedAt?request.offlineMemberCouponId:effects?effects.couponId:request?.activityCouponId
  const templateId=o.locallyAcceptedAt?request.offlineMemberCouponTemplateId:effects?.couponTemplateId
  if(couponId){
   for(const c of evidence.coupons){
    if(c.id===couponId)c.status='used'
    if(c.coupon.id===templateId)c.coupon.usedCount++
   }
  }
 }
 return evidence
}
export async function offlineMembers(params:any={}){
 const {scope}=await authority()
 if(!(await db.config.get(scope+'$complete'))?.value)throw Error('OFFLINE_MEMBERS_UNAVAILABLE')
 const rows=await db.config.where('key').startsWith(scope).toArray(),list:any[]=[]
 for(const row of rows){if(!row.value?.member)continue;const m=row.value.member
  if(params.phone&&m.phone!==params.phone||params.level&&m.level!==params.level||params.search&&!`${m.name} ${m.phone}`.toLowerCase().includes(String(params.search).toLowerCase()))continue
  list.push((await offlineMemberEvidence(m.id)).member)
 }
 const page=Math.max(1,Number(params.page)||1),pageSize=Math.max(1,Math.min(200,Number(params.pageSize)||20))
 return {data:{code:200,offline:true,data:{list:list.slice((page-1)*pageSize,page*pageSize),pagination:{page,pageSize,total:list.length,totalPages:Math.ceil(list.length/pageSize)}}}}
}
export async function offlineMemberCoupons(id:string){return {data:{code:200,offline:true,data:{list:(await offlineMemberEvidence(id)).coupons.filter((c:any)=>c.status==='unused')}}}}
export async function offlineActivityQuote(snapshot:any,input:any){return cachedActivityQuote(snapshot,{...input,...(input.memberId?{offlineMember:await offlineMemberEvidence(input.memberId)}:{})})}

export async function pendingOfflineMembers(){
 const auth=readBackendAuth();if(!auth.user?.storeId)return false
 return !!await db.orders.where('[backendUrl+storeId]').equals([localIdentity(auth.user.storeId),auth.user.storeId]).filter(o=>!!o.locallyAcceptedAt&&!!o.checkoutRequest?.memberId&&o.status!=='synced').count()
}
export async function offlineVerifyCoupon(code:string,memberId?:string){
 if(!memberId)throw Error('OFFLINE_MEMBER_REQUIRED')
 const evidence=await offlineMemberEvidence(memberId),record=evidence.coupons.find((c:any)=>c.status==='unused'&&c.coupon.code.toUpperCase()===code.trim().toUpperCase())
 const c=record?.coupon,now=Date.now()
 if(!c||Date.parse(c.validFrom)>now||Date.parse(c.validUntil)<=now||(c.usageLimit&&c.usedCount>=c.usageLimit))throw Error('ACTIVITY_COUPON_UNAVAILABLE')
 return {data:{code:200,offline:true,data:{coupon:c,memberCoupon:record}}}
}
