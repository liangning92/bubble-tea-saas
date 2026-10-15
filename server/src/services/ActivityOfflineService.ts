import {verifyOfflineMember} from './MemberOfflineService'
import {offlineMemberCandidates} from '../utils/offlineMemberPricing'
import { POS_OFFLINE_TTL_MS, POS_OFFLINE_DAYS } from '../utils/offlinePolicy'
import jwt from 'jsonwebtoken'
import prisma from '../config/database'
import { config } from '../config/env'
import { Activity, QuoteItem, bestActivityPrice } from '../utils/activities'
import { listActivities, QuoteInput, quoteActivities } from './ActivityService'
const priceTypes=['special_price','percent','nth_cup','buy_get','fixed','tiered','bundle','addon','upgrade']
export async function activityOfflineSnapshot(storeId:string){
 const [all,products,channels,addons]=await Promise.all([listActivities(storeId),prisma.product.findMany({where:{storeId,status:'active'},include:{specs:true,channelPrices:true,addons:{include:{addon:true}}}}),prisma.channel.findMany({where:{storeId,status:'active'}}),prisma.addon.findMany({where:{storeId}})])
 const activities=all.filter(a=>priceTypes.includes(a.type)&&a.limit===undefined&&!a.rule.perMemberLimit&&!a.memberOnly&&!a.memberLevels.length)
 const snapshot={purpose:'activity-offline',storeId,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+POS_OFFLINE_TTL_MS).toISOString(),activities,products:products.map(p=>({id:p.id,addonNames:p.addons.map(a=>a.addon.name),specs:p.specs.map(s=>({id:s.id,price:s.price})),prices:p.channelPrices.map(c=>({channelId:c.channelId,multiplier:c.priceAdjustment,enabled:c.enabled}))})),channels:channels.map(c=>({id:c.id,code:c.code})),addons:addons.map(a=>({name:a.name,price:a.price})),taxRate:config.indonesia.ppnRate}
 return {...snapshot,token:jwt.sign(snapshot,config.jwt.secret,{expiresIn:`${POS_OFFLINE_DAYS}d`})}
}
export async function quoteOfflineActivity(storeId:string,input:QuoteInput,token:string,occurredAt:string,db:any=prisma,memberProof?:{token:string;pointsBefore:number}){
 const snapshot=jwt.verify(token,config.jwt.secret,{ignoreExpiration:true}) as any
 if(snapshot.purpose!=='activity-offline'||snapshot.storeId!==storeId||input.groupId||((input.memberId||input.couponId||input.pointsRequested)&&!memberProof))throw Error('ACTIVITY_OFFLINE_POLICY')
 const now=new Date(occurredAt)
 if(!Number.isFinite(now.getTime())||occurredAt<snapshot.issuedAt||occurredAt>snapshot.expiresAt||now.getTime()>Date.now()+60000)throw Error('ACTIVITY_OFFLINE_TIME_INVALID')
 const channel=snapshot.channels.find((c:any)=>c.id===input.channelId||c.code===(input.channel||'DINE_IN'))
 if(!channel)throw Error('ACTIVITY_CHANNEL_STORE_MISMATCH')
 const items:QuoteItem[]=input.items.map(i=>{
 const product=snapshot.products.find((p:any)=>p.id===i.productId),spec=product?.specs.find((s:any)=>s.id===i.specId)
 if(!spec)throw Error('ACTIVITY_OFFLINE_CATALOG_MISMATCH')
 const adjustment=product.prices.find((p:any)=>p.channelId===channel.id&&p.enabled)
 const unitPrice=adjustment?Math.round(spec.price*adjustment.multiplier):spec.price
 if(unitPrice!==i.unitPrice)throw Error('ACTIVITY_OFFLINE_PRICE_CHANGED')
 for(const addon of i.addons||[])if(!product.addonNames?.includes(addon.name)||!snapshot.addons.some((a:any)=>a.name===addon.name&&a.price===addon.price))throw Error('ACTIVITY_OFFLINE_ADDON_MISMATCH')
 return {productId:i.productId,specId:i.specId,quantity:i.quantity,unitPrice,addons:i.addons||[]}
 })
 const member=memberProof?await verifyOfflineMember(memberProof.token,storeId,input.memberId||'',occurredAt):undefined
 if(member){if(!Number.isSafeInteger(memberProof!.pointsBefore)||memberProof!.pointsBefore<0)throw Error('OFFLINE_MEMBER_AMOUNT_INVALID');member.member.points=memberProof!.pointsBefore}
 const price=bestActivityPrice(snapshot.activities as Activity[],items,{channel:channel.code,paymentMethod:input.paymentMethod,now},member?offlineMemberCandidates(member,input,items,now):[])
 // Shared-stock and quota rights are deliberately decided only after the order reaches the server.
 const current=await quoteActivities(storeId,{...input,items},db,now,price.finalAmount)
 const entitlements=current.entitlements.filter(e=>!e.rewardId||e.activity.rule.rewardIds?.length===1)
 const tax=input.taxEnabled===false?0:Math.round(price.finalAmount*snapshot.taxRate)
 return {...current,...price,items,tax,grandTotal:price.finalAmount+tax,entitlements,pendingSelections:[],couponId:price.applied?.kind==='coupon'?price.applied.id:undefined,pointsRedeemed:price.applied?.kind==='points'?price.applied.pointsRedeemed||0:0,signature:token,offline:true,offlineTaxRate:snapshot.taxRate,context:{...current.context,now}}
}
