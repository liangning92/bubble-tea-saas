import {db} from '../db/offline'
import {localIdentity} from './offlineSale'
import {readBackendAuth} from './backendIdentity'
import {cachedActivityQuote} from './activityOfflineQuote'
export const offlineMemberScope=()=>{const a=readBackendAuth();if(!a.user?.storeId||!a.user.id)throw Error('CHECKOUT_BACKEND_LOGIN_REQUIRED');return `offline.members:${encodeURIComponent(localIdentity(a.user.storeId))}:${encodeURIComponent(a.user.storeId)}:${a.user.id}:`}
async function authority(){
 const a=readBackendAuth(),scope=offlineMemberScope(),g=(await db.config.get(`offline.authorization:${encodeURIComponent(localIdentity(a.user!.storeId!))}:${encodeURIComponent(a.user!.storeId!)}:${a.user!.id}`))?.value
 if(!g?.permissions?.includes('members.read')||!Number.isFinite(Date.parse(g.expiresAt))||Date.parse(g.expiresAt)<=Date.now())throw Error('OFFLINE_MEMBER_AUTHORIZATION_REQUIRED')
 return {auth:a,scope}
}
/** Publish all pages atomically; a failed refresh leaves the previous complete directory intact. */
export async function prepareOfflineMembers(request:(after?:string)=>Promise<any>){
 if(await pendingOfflineMembers())return
 const {auth,scope}=await authority()
 const complete=await db.config.get(scope+'$complete');if(complete?.value?.registration&&Date.now()-new Date(complete.updatedAt).getTime()<5*60000)return
 const rows:any[]=[],manifests:any[]=[];let registration:any;let after:string|undefined;const seen=new Set<string>()
 do{
  const captureStartedAt=Date.now(),response=await request(after),page=response.data?.data
  const inclusionKey=Array.isArray(page?.includedOrders)?scope+'$inclusion:'+crypto.randomUUID():undefined
  if(inclusionKey)manifests.push({key:inclusionKey,value:{includedOrders:page.includedOrders,includedOfflineOperationIds:page.includedOfflineOperationIds||[]},updatedAt:new Date()})
  registration=registration||page?.registration
  if(!Array.isArray(page?.members))throw Error('OFFLINE_MEMBERS_UNAVAILABLE')
  for(const row of page.members){if(!row.token||seen.has(row.member.id))throw Error('OFFLINE_MEMBERS_UNAVAILABLE');seen.add(row.member.id);rows.push({...row,captureStartedAt,...(inclusionKey?{inclusionKey}:{})})}
  if(page.next===after)throw Error('OFFLINE_MEMBERS_UNAVAILABLE');after=page.next||undefined
 }while(after)
 if(offlineMemberScope()!==scope||readBackendAuth().user?.id!==auth.user?.id)throw Error('CHECKOUT_AUTH_CHANGED')
 await db.transaction('rw',db.config,async()=>{
  await db.config.where('key').startsWith(scope).delete()
  await db.config.bulkPut([...manifests,...rows.map(value=>({key:scope+value.member.id,value,updatedAt:new Date()}))])
  await db.config.put({key:scope+'$complete',value:{registration},updatedAt:new Date()})
 })
}
export async function offlineMemberEvidence(id:string){
 const {auth,scope}=await authority(),row=await db.config.get(scope+id)||await db.config.get(offlineMemberCreationKey(id))
 if(row?.key.startsWith('offline.new-member:')){
  const backend=localIdentity(auth.user!.storeId!),created=await db.config.get(`offline.operation:${encodeURIComponent(backend)}:${encodeURIComponent(auth.user!.storeId!)}:${id.slice(10)}`),complete=await db.config.get(scope+'$complete')
  if(created?.value.status==='synced'&&complete&&new Date(complete.updatedAt)>=new Date(created.updatedAt))throw Error('OFFLINE_MEMBERS_UNAVAILABLE')
 }
 const evidence=structuredClone(row?.value)
 if(!evidence?.token||!Number.isFinite(Date.parse(evidence.expiresAt))||!Number.isFinite(Date.parse(evidence.issuedAt))||Date.parse(evidence.expiresAt)<=Date.now()||Date.parse(evidence.issuedAt)>Date.now())throw Error('OFFLINE_MEMBERS_UNAVAILABLE')
 const inclusion=evidence.inclusionKey?(await db.config.get(evidence.inclusionKey))?.value:evidence
 if(!inclusion)throw Error('OFFLINE_MEMBERS_UNAVAILABLE')
 const included=new Set(inclusion.includedOrders||[])
 const orders=await db.orders.where('[backendUrl+storeId]').equals([localIdentity(auth.user!.storeId!),auth.user!.storeId!]).filter(o=>(!!o.locallyAcceptedAt||o.checkoutResolution==='accepted'&&o.status==='synced')&&!['rejected','discarded'].includes(o.checkoutResolution||'')&&!included.has(o.orderNumber)&&!(o.status==='synced'&&o.syncedAt&&Number.isFinite(evidence.captureStartedAt)&&new Date(o.syncedAt).getTime()<=evidence.captureStartedAt)).sortBy('createdAt')
 const opRows=await db.config.where('key').startsWith(`offline.operation:${encodeURIComponent(localIdentity(auth.user!.storeId!))}:${encodeURIComponent(auth.user!.storeId!)}:`).toArray()
 const includedOps=new Set(inclusion.includedOfflineOperationIds||[])
 const eligibleOps=opRows.filter(r=>!((r.value as any).status==='synced'&&Number.isFinite(evidence.captureStartedAt)&&new Date(r.updatedAt).getTime()<=evidence.captureStartedAt))
 const referrals=eligibleOps.map(r=>r.value).filter(o=>o.kind==='member'&&!includedOps.has(o.id)&&(o.data.referredByPhone===evidence.member.phone||evidence.member.referralCode&&o.data.referredByPhone?.toUpperCase()===evidence.member.referralCode))
 const refunds=eligibleOps.map(r=>r.value).filter(o=>o.kind==='refund-settle'&&o.data.decision==='approve'&&!includedOps.has(o.id))
 const events=[...refunds.map(o=>({at:Date.parse(o.occurredAt),order:null,referral:false,refund:o.data})),...orders.map(order=>({at:new Date(order.occurredAt||order.createdAt).getTime(),order,referral:false,refund:null})),...referrals.map(o=>({at:Date.parse(o.occurredAt),order:null,referral:true,refund:null}))].sort((a,b)=>a.at-b.at)
 for(const event of events){
  if(event.referral){evidence.member.points+=500;continue}
  if(event.refund){
   const local=event.refund.localEvidence
   if(local.memberId===id){const returned=local.pointsReturned||0;const reversed=Math.min(local.pointsReversed||0,evidence.member.points+returned);evidence.member.points+=returned-reversed;evidence.member.totalSpent-=Math.min(event.refund.amount,evidence.member.totalSpent)}
   if(local.couponId)for(const c of evidence.coupons){if(c.id===local.couponId)c.status='unused';if(c.coupon.id===local.couponTemplateId)c.coupon.usedCount=Math.max(0,c.coupon.usedCount-1)}
   continue
  }
  const o=event.order!
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
 const saved=await db.config.where('key').startsWith(scope).toArray(),created=await db.config.where('key').startsWith(offlineMemberCreationKey('')).toArray(),rows=[...saved,...created.filter(c=>!saved.some(s=>s.value?.member?.id===c.value?.member?.id))],list:any[]=[]
 for(const row of rows){if(!row.value?.member)continue;const m=row.value.member
  if(params.phone&&m.phone!==params.phone||params.level&&m.level!==params.level||params.search&&!`${m.name} ${m.phone}`.toLowerCase().includes(String(params.search).toLowerCase()))continue
  try{list.push((await offlineMemberEvidence(m.id)).member)}catch(error:any){if(error.message!=='OFFLINE_MEMBERS_UNAVAILABLE')throw error}
 }
 const page=Math.max(1,Number(params.page)||1),pageSize=Math.max(1,Math.min(200,Number(params.pageSize)||20))
 return {data:{code:200,offline:true,data:{list:list.slice((page-1)*pageSize,page*pageSize),pagination:{page,pageSize,total:list.length,totalPages:Math.ceil(list.length/pageSize)}}}}
}
export async function offlineMemberCoupons(id:string){return {data:{code:200,offline:true,data:{list:(await offlineMemberEvidence(id)).coupons.filter((c:any)=>c.status==='unused')}}}}
export async function offlineActivityQuote(snapshot:any,input:any){return cachedActivityQuote(snapshot,{...input,...(input.memberId?{offlineMember:await offlineMemberEvidence(input.memberId)}:{})})}

export function offlineMemberCreationKey(id:string){const auth=readBackendAuth();return `offline.new-member:${encodeURIComponent(localIdentity(auth.user!.storeId!))}:${encodeURIComponent(auth.user!.storeId!)}:${id}`}
export async function memberRegistrationPolicy(){const {scope}=await authority();const policy=(await db.config.get(scope+'$complete'))?.value?.registration;if(!policy?.token||!Number.isFinite(Date.parse(policy.expiresAt))||Date.parse(policy.expiresAt)<=Date.now())throw Error('OFFLINE_MEMBERS_UNAVAILABLE');return policy}
export async function pendingOfflineMembers(){
 const auth=readBackendAuth();if(!auth.user?.storeId)return false
 const backend=localIdentity(auth.user.storeId)
 if((await db.config.where('key').startsWith(`offline.operation:${encodeURIComponent(backend)}:${encodeURIComponent(auth.user.storeId)}:`).toArray()).some(r=>(['member','refund-settle'].includes(r.value.kind))&&r.value.status!=='synced'))return true
 return !!await db.orders.where('[backendUrl+storeId]').equals([localIdentity(auth.user.storeId),auth.user.storeId]).filter(o=>!!o.locallyAcceptedAt&&!!o.checkoutRequest?.memberId&&o.status!=='synced').count()
}
export async function offlineVerifyCoupon(code:string,memberId?:string){
 if(!memberId)throw Error('OFFLINE_MEMBER_REQUIRED')
 const evidence=await offlineMemberEvidence(memberId),record=evidence.coupons.find((c:any)=>c.status==='unused'&&c.coupon.code.toUpperCase()===code.trim().toUpperCase())
 const c=record?.coupon,now=Date.now()
 if(!c||Date.parse(c.validFrom)>now||Date.parse(c.validUntil)<=now||(c.usageLimit&&c.usedCount>=c.usageLimit))throw Error('ACTIVITY_COUPON_UNAVAILABLE')
 return {data:{code:200,offline:true,data:{coupon:c,memberCoupon:record}}}
}
