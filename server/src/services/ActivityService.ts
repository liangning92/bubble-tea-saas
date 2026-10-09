import { deductInventory } from './OrderService'
import { config as environment } from '../config/env'
import { randomUUID, createHash, randomInt } from 'crypto'
import { z } from 'zod'
import prisma from '../config/database'
import socketManager from '../socket'
import { Activity, ActivityContext, QuoteItem, PriceCandidate, ACTIVITY_TYPES, activityEligible, activityState, activitySummary, bestActivityPrice, matchesActivityItem } from '../utils/activities'
import { canonical } from '../utils/orderSnapshot'

export const ACTIVITY_PREFIX='marketing.unified.'
const activityKey=(id:string)=>`${ACTIVITY_PREFIX}activity.${id}`
const decode=<T>(value:string):T=>JSON.parse(value)
const number=z.number().int().min(0).max(1000000000)
const ids=z.array(z.string().min(1).max(100)).max(100)
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const ruleSchema=z.object({
 price:number.optional(),percent:z.number().min(0).max(100).optional(),amount:number.optional(),minAmount:number.optional(),maxDiscount:number.optional(),
 nth:z.number().int().min(2).max(100).optional(),buy:z.number().int().min(1).max(100).optional(),get:z.number().int().min(1).max(100).optional(),
 components:z.array(z.object({productId:z.string(),specId:z.string().optional(),quantity:z.number().int().min(1).max(100)})).min(1).max(30).optional(),
 tiers:z.array(z.object({minAmount:number,amount:number,percent:z.number().min(0).max(100).optional()})).min(1).max(20).optional(),
 addonNames:ids.optional(),rewardIds:ids.optional(),couponId:z.string().optional(),couponTrigger:z.enum(['paid','claim']).optional(),multiplier:z.number().min(1).max(100).optional(),points:number.optional(),
 stampsRequired:z.number().int().min(1).max(1000).optional(),participants:z.number().int().min(2).max(100).optional(),inviterPoints:number.optional(),inviteePoints:number.optional(),perMemberLimit:z.number().int().min(1).max(10000).optional(),
 prizes:z.array(z.object({id:z.string().min(1),name:z.string().min(1).max(100),code:z.string().max(100).default(''),color:z.string().regex(/^#[0-9a-f]{6}$/i),weight:z.number().int().min(0).max(1000000),remaining:number.optional(),rewardId:z.string().optional(),couponId:z.string().optional()})).max(30).optional()
}).strict()
export const activitySchema=z.object({
 name:z.string().trim().min(1).max(150),description:z.string().max(1000).default(''),theme:z.string().max(100).optional(),categoryId:z.string().min(1).max(100).optional(),type:z.enum(ACTIVITY_TYPES),status:z.enum(['draft','published','paused','ended']).default('draft'),priority:z.number().int().min(0).max(1000).default(0),
 startsAt:z.string().datetime({offset:true}).optional(),endsAt:z.string().datetime({offset:true}).optional(),timezone:z.string().default('Asia/Jakarta').refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true}catch{return false}},'Invalid time zone'),
 weekdays:z.array(z.number().int().min(0).max(6)).max(7).default([]),dailyStart:time.optional(),dailyEnd:time.optional(),channels:ids.default([]),paymentMethods:ids.default([]),productIds:ids.default([]),excludedProductIds:ids.default([]),specIds:ids.default([]),memberOnly:z.boolean().default(false),memberLevels:ids.default([]),showOnTv:z.boolean().default(true),
 imageUrl:z.string().max(2048).refine(v=>!v||/^https?:\/\//.test(v)||v.startsWith('/uploads/'),'Invalid image URL').optional(),limit:z.number().int().min(1).max(1000000000).optional(),rule:ruleSchema
}).strict().superRefine((a,ctx)=>{
 const issue=(message:string)=>ctx.addIssue({code:z.ZodIssueCode.custom,message})
 if(a.startsAt&&a.endsAt&&Date.parse(a.endsAt)<=Date.parse(a.startsAt))issue('End must follow start')
 if(!!a.dailyStart!==!!a.dailyEnd||a.dailyStart&&a.dailyStart===a.dailyEnd)issue('Set a distinct start and end for daily hours')
 const r=a.rule
 if(['special_price','member_price','bundle'].includes(a.type)&&r.price===undefined)issue('Price is required')
 if(a.type==='percent'&&r.percent===undefined)issue('Percentage is required')
 if(a.type==='nth_cup'&&(r.nth===undefined||r.percent===undefined))issue('Cup number and percentage are required')
 if(a.type==='buy_get'&&(r.buy===undefined||r.get===undefined))issue('Buy and gift quantities are required')
 if(['fixed','upgrade'].includes(a.type)&&r.amount===undefined)issue('Amount is required')
 if(a.type==='upgrade'&&!a.specIds.length)issue('Select eligible upgraded specifications')
 if(a.type==='addon'&&r.price===undefined)issue('Add-on price is required')
 if(a.type==='bundle'&&!r.components?.length)issue('Bundle components are required')
 if(a.type==='tiered'&&!r.tiers?.length)issue('Tiers are required')
 if(['gift','stamps'].includes(a.type)&&!r.rewardIds?.length)issue('Select at least one reward')
 if(['birthday','welcome'].includes(a.type)&&r.price===undefined&&r.percent===undefined&&r.amount===undefined&&!r.rewardIds?.length&&!r.couponId)issue('Configure a price or reward')
 if(a.type==='stamps'&&!r.stampsRequired)issue('Stamp target is required')
 if(a.type==='coupon'&&!r.couponId)issue('Coupon template is required')
 if(a.type==='coupon'&&r.couponTrigger==='claim'&&r.minAmount)issue('In-store claim cannot require a purchase amount; use after-payment coupons')
 if(a.type==='points'&&r.multiplier===undefined&&r.points===undefined)issue('Points or multiplier is required')
 if(a.type==='group'&&(!r.participants||r.price===undefined&&r.percent===undefined))issue('Group size and price or percentage are required')
 if(a.type==='referral'&&!r.inviterPoints&&!r.inviteePoints&&!r.couponId)issue('Referral reward is required')
 if(a.type==='lottery'&&(!r.prizes?.some(p=>p.weight>0)||new Set(r.prizes.map(p=>p.id)).size!==r.prizes.length))issue('Unique prizes with positive weights are required')
})
export async function records<T>(db:any,storeId:string,prefix:string):Promise<T[]> {
 const rows=await db.config.findMany({where:{storeId,key:{startsWith:ACTIVITY_PREFIX+prefix}}})
 return rows.map((row:any)=>decode<T>(row.value))
}
export async function putRecord(db:any,storeId:string,key:string,value:unknown){return db.config.upsert({where:{storeId_key:{storeId,key}},create:{storeId,key,value:JSON.stringify(value),category:key.startsWith(ACTIVITY_PREFIX+'grant.')?'activity_grant_'+(value as any).status:'marketing'},update:{value:JSON.stringify(value),...(key.startsWith(ACTIVITY_PREFIX+'grant.')?{category:'activity_grant_'+(value as any).status}:{})}})}
export async function casRecord(db:any,row:{id:string;value:string;key?:string},value:unknown){const updated=await db.config.updateMany({where:{id:row.id,value:row.value},data:{value:JSON.stringify(value),...(row.key?.startsWith(ACTIVITY_PREFIX+'grant.')?{category:'activity_grant_'+(value as any).status}:{})}});if(updated.count!==1)throw Error('ACTIVITY_CONCURRENT_CHANGE')}
export const displayPrizes=(prizes:any[]|undefined)=>(prizes||[]).map(({id,name,color})=>({id,name,color}))
export function notifyActivities(storeId:string){socketManager.emitToStore(storeId,'marketing:activities:updated',{refresh:true});socketManager.emitTVConfigUpdate(storeId,{refresh:true})}
export async function listActivities(storeId:string,db:any=prisma):Promise<Activity[]>{return records<Activity>(db,storeId,'activity.')}
async function validateReferences(storeId:string,a:any,db:any=prisma){
 if(a.categoryId&&!await db.campaignCategory.findFirst({where:{id:a.categoryId,storeId}}))throw Error('ACTIVITY_CATEGORY_STORE_MISMATCH')
 const products=[...new Set([...a.productIds,...(a.excludedProductIds||[]),...(a.rule.components||[]).map((c:any)=>c.productId)])]
 if(products.length&&(await db.product.count({where:{storeId,id:{in:products}}}))!==products.length)throw Error('ACTIVITY_PRODUCT_STORE_MISMATCH')
 const specs=[...new Set([...a.specIds,...(a.rule.components||[]).map((c:any)=>c.specId).filter(Boolean)])]
 if(specs.length&&(await db.spec.count({where:{id:{in:specs},product:{storeId}}}))!==specs.length)throw Error('ACTIVITY_SPEC_STORE_MISMATCH')
 const rewards=[...new Set([...(a.rule.rewardIds||[]),...(a.rule.prizes||[]).map((p:any)=>p.rewardId).filter(Boolean)])]
 if(rewards.length){const linked=await db.rewardCatalog.findMany({where:{storeId,id:{in:rewards},isActive:true}});if(linked.length!==rewards.length)throw Error('ACTIVITY_REWARD_STORE_MISMATCH');for(const reward of linked){if(reward.productId&&!await db.product.findFirst({where:{id:reward.productId,storeId}})||reward.addonId&&!await db.addon.findFirst({where:{id:reward.addonId,storeId}}))throw Error('ACTIVITY_REWARD_STORE_MISMATCH')}}
 const coupons=[...new Set([a.rule.couponId,...(a.rule.prizes||[]).map((p:any)=>p.couponId)].filter(Boolean))]
 if(coupons.length&&(await db.coupon.count({where:{storeId,id:{in:coupons},status:'active'}}))!==coupons.length)throw Error('ACTIVITY_COUPON_STORE_MISMATCH')
}
export async function saveActivity(storeId:string,input:unknown,id?:string,expectedVersion?:number){
 const data=activitySchema.parse(input);await validateReferences(storeId,data)
 const activity=await prisma.$transaction(async tx=>{
 if(data.categoryId&&!await tx.campaignCategory.findFirst({where:{id:data.categoryId,storeId}}))throw Error('ACTIVITY_CATEGORY_STORE_MISMATCH')
 const row=id?await tx.config.findUnique({where:{storeId_key:{storeId,key:activityKey(id)}}}):null
 if(id&&!row)throw Error('ACTIVITY_NOT_FOUND')
 const old=row?decode<Activity>(row.value):undefined
 if(old&&old.version!==expectedVersion)throw Error('ACTIVITY_VERSION_CHANGED')
 const value:Activity={...data,id:id||randomUUID(),storeId,version:(old?.version||0)+1,used:old?.used||0,source:old?.source} as Activity
 if(row)await casRecord(tx,row,value);else await putRecord(tx,storeId,activityKey(value.id),value)
 if(value.type==='lottery')await putRecord(tx,storeId,ACTIVITY_PREFIX+`prizes.${value.id}.${value.version}`,{prizes:value.rule.prizes})
 return value
 },data.categoryId?{isolationLevel:'Serializable'}:undefined);notifyActivities(storeId);return {...activity,state:activityState(activity)}
}
const arr=(value:any):any[]=>{if(Array.isArray(value))return value;try{const x=JSON.parse(value||'[]');return Array.isArray(x)?x:[]}catch{return []}}
export async function migrateActivities(storeId:string,dryRun=true){
 return prisma.$transaction(async tx=>{
 if(!dryRun)await tx.config.upsert({where:{storeId_key:{storeId,key:ACTIVITY_PREFIX+'migration.lock'}},create:{storeId,key:ACTIVITY_PREFIX+'migration.lock',value:'{}',category:'marketing'},update:{value:'{}'}})
 const [discounts,specials,configRow,existing,campaigns]=await Promise.all([
 tx.discountRule.findMany({where:{storeId}}),tx.timedSpecial.findMany({where:{storeId}}),tx.config.findUnique({where:{storeId_key:{storeId,key:'tv_screen_marketing_config'}}}),listActivities(storeId,tx),tx.campaign.findMany({where:{storeId}})])
 const defaults={storeId,version:1,description:'',priority:0,timezone:'Asia/Jakarta',weekdays:[],channels:[],paymentMethods:[],productIds:[],specIds:[],memberOnly:false,memberLevels:[],showOnTv:true,used:0}
 const candidates:Activity[]=[]
 for(const d of discounts)candidates.push({...defaults,id:`legacy-discount-${d.id}`,source:`discount:${d.id}`,name:d.name,type:({second_half:'nth_cup',bogo:'buy_get',percent:'percent',fixed:'fixed'} as any)[d.discountType]||'fixed',status:d.status==='active'?'published':'paused',priority:d.priority,productIds:arr(d.applicableProducts),excludedProductIds:arr(d.excludeProducts),channels:arr(d.applicableChannels).map(c=>String(c).toUpperCase()),startsAt:d.validFrom?.toISOString(),endsAt:d.validUntil?.toISOString(),rule:{...(d.discountType==='second_half'?{nth:2,percent:50}:d.discountType==='bogo'?{buy:1,get:1}:d.discountType==='percent'?{percent:d.discountValue}:{amount:d.discountValue}),minAmount:d.minOrderAmount,...(d.maxDiscount?{maxDiscount:d.maxDiscount}:{})}})
 for(const s of specials)candidates.push({...defaults,id:`legacy-special-${s.id}`,source:`special:${s.id}`,name:s.name,type:'special_price',status:s.status==='active'?'published':'paused',productIds:[s.productId],weekdays:arr(s.daysOfWeek),channels:arr(s.applicableChannels).map(c=>String(c).toUpperCase()),startsAt:s.startTime.toISOString(),endsAt:s.endTime.toISOString(),rule:{price:s.specialPrice}})
 const cfg=configRow?decode<any>(configRow.value):{}
 for(const [n,s] of (cfg.dailySpecials||[]).entries())candidates.push({...defaults,id:`legacy-tv-special-${n}`,source:`tv-special:${n}`,name:s.productName||'Daily special',type:'special_price',status:s.productId&&s.autoPrice?'published':'draft',conflict:s.productId&&s.autoPrice?undefined:'Link a store product and confirm its promotion price',productIds:s.productId?[s.productId]:[],weekdays:[s.dayOfWeek],channels:s.applicableChannels?.length?s.applicableChannels:['DINE_IN','TAKEAWAY'],rule:{price:s.specialPrice}})
 if(cfg.lottery?.enabled)candidates.push({...defaults,id:'legacy-tv-lottery',source:'tv-lottery',name:cfg.lottery.title||'Lucky draw',description:cfg.lottery.subtitle||'',type:'lottery',status:'published',rule:{minAmount:cfg.lottery.triggerMinOrderAmount,prizes:cfg.lottery.prizes}})
 for(const c of campaigns){let actions:any={};try{actions=JSON.parse(c.actions||'{}')}catch{}
 candidates.push({...defaults,id:`legacy-campaign-${c.id}`,source:`campaign:${c.id}`,categoryId:c.categoryId||undefined,name:c.name,description:c.description||'',type:c.type==='birthday'?'birthday':c.type==='welcome'?'welcome':'coupon',status:c.status==='active'?'published':'paused',memberOnly:true,startsAt:c.startDate.toISOString(),endsAt:c.endDate?.toISOString(),rule:{couponId:actions.couponId,perMemberLimit:1}})
 }
 const planned:Activity[]=[];const skipped:string[]=[]
 for(const a of candidates){if(existing.some(e=>e.source===a.source)){skipped.push(a.source!);continue}
 const same=(x:string[]|number[]|undefined,y:string[]|number[]|undefined)=>canonical([...(x||[])].sort())===canonical([...(y||[])].sort())
 const duplicate=[...existing,...planned].find(e=>e.status==='published'&&e.type===a.type&&same(e.productIds,a.productIds)&&same(e.excludedProductIds,a.excludedProductIds)&&same(e.specIds,a.specIds)&&same(e.weekdays,a.weekdays)&&same(e.channels,a.channels)&&same(e.paymentMethods,a.paymentMethods)&&e.memberOnly===a.memberOnly&&same(e.memberLevels,a.memberLevels)&&e.dailyStart===a.dailyStart&&e.dailyEnd===a.dailyEnd&&Math.max(e.startsAt?Date.parse(e.startsAt):-Infinity,a.startsAt?Date.parse(a.startsAt):-Infinity)<Math.min(e.endsAt?Date.parse(e.endsAt):Infinity,a.endsAt?Date.parse(a.endsAt):Infinity)&&canonical(e.rule)===canonical(a.rule))
 if(duplicate){a.conflict=`Duplicates ${duplicate.id}`;a.status='draft'}
 try{activitySchema.parse(Object.fromEntries(Object.entries(a).filter(([key])=>!['id','storeId','version','used','source','conflict'].includes(key))));await validateReferences(storeId,a,tx)}catch(error:any){a.conflict=`Review legacy rule: ${error.message}`;a.status='draft'}
 planned.push(a)
 if(!dryRun){await putRecord(tx,storeId,activityKey(a.id),a);if(a.type==='lottery')await putRecord(tx,storeId,ACTIVITY_PREFIX+`prizes.${a.id}.${a.version}`,{prizes:a.rule.prizes})}
 }
 if(!dryRun){await putRecord(tx,storeId,`${ACTIVITY_PREFIX}migration`,{version:1,completedAt:new Date().toISOString()});
 for(const a of planned.filter(a=>a.source?.startsWith('campaign:')))await tx.campaign.update({where:{id:a.source!.slice(9)},data:{status:'migrated'}})
 }
 return {dryRun,created:planned.length,skipped:skipped.length,conflicts:planned.filter(a=>a.conflict).length,activities:planned,legacyUnlinkedTvOffers:(cfg.dailySpecials||[]).filter((s:any)=>!s.productId||!s.autoPrice).length}
 })
}
export async function ensureMigrated(storeId:string){if(!await prisma.config.findUnique({where:{storeId_key:{storeId,key:ACTIVITY_PREFIX+'migration'}}})){await migrateActivities(storeId,false);notifyActivities(storeId)}}
export interface QuoteInput {items:QuoteItem[];channel?:string;channelId?:string;paymentMethod?:string;memberId?:string;couponId?:string;pointsRequested?:number;groupId?:string;giftSelections?:Record<string,string>;taxEnabled?:boolean}
export interface EntitlementPlan {activity:Activity;rewardId?:string;couponId?:string;points?:number;stamps?:number;inviterId?:string;inviterPoints?:number;prize?:Activity['rule']['prizes'][number];prizeIndex?:number}
export async function quoteActivities(storeId:string,input:QuoteInput,db:any=prisma,now=new Date(),paidAmountOverride?:number){
 const activities=await listActivities(storeId,db)
 const member=input.memberId?await db.member.findFirst({where:{id:input.memberId,storeId}}):null
 if(input.memberId&&!member)throw Error('ACTIVITY_MEMBER_STORE_MISMATCH')
 const channel=input.channelId?await db.channel.findFirst({where:{id:input.channelId,storeId}}):await db.channel.findFirst({where:{storeId,code:input.channel||'DINE_IN'}})
 if(input.channelId&&!channel)throw Error('ACTIVITY_CHANNEL_STORE_MISMATCH')
 const items:QuoteItem[]=[]
 for(const i of input.items){
 const spec=await db.spec.findFirst({where:{id:i.specId,productId:i.productId,product:{storeId,status:'active'}}})
 if(!spec)throw Error('ACTIVITY_SPEC_NOT_FOUND')
 const channelPrice=channel?await db.productChannelPrice.findFirst({where:{channelId:channel.id,productId:i.productId}}):null
 const addons:QuoteItem['addons']=[]
 for(const addon of i.addons||[]){const row=await db.addon.findFirst({where:{storeId,name:addon.name,productAddons:{some:{productId:i.productId}}}});if(!row||row.price!==addon.price)throw Error('ACTIVITY_ADDON_PRICE_CHANGED');addons.push({...addon,price:row.price})}
 items.push({productId:i.productId,specId:i.specId,quantity:i.quantity,unitPrice:channelPrice?.enabled?Math.round(spec.price*channelPrice.priceAdjustment):spec.price,addons})
 }
 const firstOrder=!!member&&!await db.order.findFirst({where:{storeId,memberId:member.id,status:'completed'}})
 let group:any=null
 if(input.groupId){const row=await db.config.findUnique({where:{storeId_key:{storeId,key:ACTIVITY_PREFIX+'group.'+input.groupId}}});group=row?decode<any>(row.value):null
 if(!group||group.status!=='formed'||!member||!group.memberIds.includes(member.id))throw Error('ACTIVITY_GROUP_NOT_FORMED')
 }
 const history=member?await records<any>(db,storeId,'grant.') : []
 const unavailableIds=activities.filter(a=>a.rule.perMemberLimit&&history.filter(g=>g.memberId===member?.id&&g.activityId===a.id&&!['revoked','cancelled'].includes(g.status)).length>=a.rule.perMemberLimit!).map(a=>a.id)
 const context:ActivityContext={now,channel:channel?.code||input.channel||'DINE_IN',paymentMethod:input.paymentMethod,member:member?{id:member.id,level:member.level,birthday:member.birthday?.toISOString(),firstOrder}:undefined,groupActivityIds:group?[group.activityId]:[],unavailableIds}
 const extras:PriceCandidate[]=[];let coupon:any=null
 const subtotal=items.reduce((s,i)=>s+i.quantity*(i.unitPrice+(i.addons||[]).reduce((x,a)=>x+a.price*(a.qty||1),0)),0)
 if(input.couponId){coupon=await db.memberCoupon.findFirst({where:{id:input.couponId,memberId:member?.id||'__none__',status:'unused'},include:{coupon:true}})
 const c=coupon?.coupon
 if(!c||c.storeId!==storeId||c.status!=='active'||c.validFrom>now||c.validUntil<=now||(c.usageLimit&&c.usedCount>=c.usageLimit)||subtotal<c.minOrder)throw Error('ACTIVITY_COUPON_UNAVAILABLE')
 const basicTotal=items.reduce((sum,i)=>sum+i.unitPrice*i.quantity,0)
 let discount=c.type==='discount_fixed'?c.value:c.type==='discount_percent'?Math.round(basicTotal*c.value/100):0
 if(c.type==='free_product'){const cheapest=items.length?Math.min(...items.map(i=>i.unitPrice)):0;discount=Math.min(cheapest,c.value>0?c.value:cheapest)}
 extras.push({id:coupon.id,version:0,name:c.code,discount:Math.min(basicTotal,discount,c.maxDiscount||Infinity),priority:0,kind:'coupon'})
 }
 const redeemed=Math.min(input.pointsRequested||0,member?.points||0,subtotal*100)
 if(redeemed>=100)extras.push({id:'points',version:0,name:'Points',discount:Math.floor(redeemed/100),priority:0,kind:'points',pointsRedeemed:Math.floor(redeemed/100)*100})
 const price=bestActivityPrice(activities,items,context,extras)
 const selections=input.giftSelections||{},pendingSelections:{activityId:string;name:string;rewards:{id:string;name:string}[]}[]=[],entitlements:EntitlementPlan[]=[]
 for(const a of activities){if(!activityEligible(a,context)||(paidAmountOverride??price.finalAmount)<(a.rule.minAmount||0)||a.productIds.length&&!items.some(i=>matchesActivityItem(a,i)))continue
 if(!['gift','birthday','welcome','coupon','points','stamps','lottery','referral'].includes(a.type)||a.type==='coupon'&&a.rule.couponTrigger==='claim')continue
 const plan:EntitlementPlan={activity:a}
 if((a.memberOnly||['coupon','points','stamps','referral'].includes(a.type))&&!member)continue
 if(a.rule.rewardIds?.length){const rewards=await db.rewardCatalog.findMany({where:{id:{in:a.rule.rewardIds},storeId,isActive:true,validFrom:{lte:now},validUntil:{gt:now},OR:[{stock:null},{stock:{gt:0}}]}})
 if(!rewards.length)continue
 if(a.type==='stamps'){
 const stampRow=await db.config.findUnique({where:{storeId_key:{storeId,key:ACTIVITY_PREFIX+`stamps.${a.id}.${member.id}`}}});const stamps=stampRow?decode<any>(stampRow.value).count:0
 plan.stamps=items.filter(i=>matchesActivityItem(a,i)).reduce((s,i)=>s+i.quantity,0)
 if(stamps+plan.stamps<a.rule.stampsRequired!){entitlements.push(plan);continue}
 }
 const selected=selections[a.id]||(rewards.length===1?rewards[0].id:undefined)
 if(selected&&!rewards.some((r:any)=>r.id===selected))throw Error('ACTIVITY_GIFT_UNAVAILABLE')
 if(!selected)pendingSelections.push({activityId:a.id,name:a.name,rewards:rewards.map((r:any)=>({id:r.id,name:r.name}))});else plan.rewardId=selected
 }
 if(a.rule.couponId)plan.couponId=a.rule.couponId
 if(a.type==='points')plan.points=a.rule.points||0
 if(a.type==='referral'){
 if(!firstOrder||!member.referredByMemberId)continue
 const inviter=await db.member.findFirst({where:{id:member.referredByMemberId,storeId}})
 if(!inviter||inviter.id===member.id)continue
 plan.inviterId=inviter.id;plan.inviterPoints=a.rule.inviterPoints||0;plan.points=a.rule.inviteePoints||0
 }
 if(a.type==='lottery'){let available=false;for(const p of a.rule.prizes||[]){if(p.weight<=0||p.remaining!==undefined&&p.remaining<=0)continue;if(p.rewardId){const r=await db.rewardCatalog.findFirst({where:{id:p.rewardId,storeId,isActive:true,validUntil:{gt:now},OR:[{stock:null},{stock:{gt:0}}]}});if(!r)continue}available=true;break}if(!available)continue}
 entitlements.push(plan)
 }
 const tax=input.taxEnabled===false?0:Math.round(price.finalAmount*environment.indonesia.ppnRate)
 const details={...price,items,pointsRedeemed:price.applied?.kind==='points'?price.applied.pointsRedeemed||0:0,couponId:price.applied?.kind==='coupon'?coupon?.id:undefined,tax,grandTotal:price.finalAmount+tax,groupId:group?.id,context,pendingSelections,entitlements}
 if(price.applied?.kind==='activity'){const a=activities.find(a=>a.id===price.applied!.id);if(a?.rule.perMemberLimit&&!entitlements.some(p=>p.activity.id===a.id))entitlements.push({activity:a})}
 const signature=createHash('sha256').update(canonical({items,applied:price.applied,grandTotal:details.grandTotal,memberId:member?.id,channel:context.channel,paymentMethod:context.paymentMethod,groupId:group?.id,giftSelections:input.giftSelections||{},entitlements:entitlements.map(p=>({id:p.activity.id,version:p.activity.version,rewardId:p.rewardId,couponId:p.couponId,points:p.points,stamps:p.stamps,inviterId:p.inviterId}))})).digest('hex')
 return {...details,signature,version:activities.reduce((s,a)=>s+a.version+a.used,0),evaluatedAt:now.toISOString()}
}
export async function reserveActivity(db:any,storeId:string,a:Activity,now=new Date()){
 const row=await db.config.findUnique({where:{storeId_key:{storeId,key:activityKey(a.id)}}})
 if(!row)throw Error('ACTIVITY_NOT_FOUND');const current=decode<Activity>(row.value)
 if(current.version!==a.version||activityState(current,now)!=='active'||current.limit!==undefined&&current.used>=current.limit)throw Error('ACTIVITY_PRICE_CHANGED')
 await casRecord(db,row,{...current,used:current.used+1})
}
export async function enqueueActivityGrants(tx:any,order:any,quote:Awaited<ReturnType<typeof quoteActivities>>,basePoints:number){
 if(order.status!=='completed')return []
 const selectedIds=new Set<string>()
 if(quote.applied?.kind==='activity')selectedIds.add(quote.applied.id)
 quote.entitlements.forEach(p=>selectedIds.add(p.activity.id))
 for(const id of [...selectedIds].sort()){const a=quote.entitlements.find(p=>p.activity.id===id)?.activity||(await listActivities(order.storeId,tx)).find(a=>a.id===id);if(a){if((quote as any).offline){if(quote.applied?.id===id&&!quote.entitlements.some(p=>p.activity.id===id))continue;try{await reserveActivity(tx,order.storeId,a,quote.context.now)}catch(error:any){if(error.message!=='ACTIVITY_PRICE_CHANGED')throw error;quote.entitlements=quote.entitlements.filter(p=>p.activity.id!==id)}}else await reserveActivity(tx,order.storeId,a)}}
 if(quote.couponId){const memberCoupon=await tx.memberCoupon.findUnique({where:{id:quote.couponId},include:{coupon:true}})
 const c=memberCoupon?.coupon;if(!c)throw Error('ACTIVITY_COUPON_UNAVAILABLE')
 const changed=await tx.memberCoupon.updateMany({where:{id:quote.couponId,memberId:order.memberId,status:'unused'},data:{status:'used',usedAt:new Date(),orderId:order.id}});if(changed.count!==1)throw Error('ACTIVITY_COUPON_UNAVAILABLE')
 const claimed=await tx.coupon.updateMany({where:{id:c.id,status:'active',...(c.usageLimit?{usedCount:{lt:c.usageLimit}}:{})},data:{usedCount:{increment:1}}});if(claimed.count!==1)throw Error('ACTIVITY_COUPON_UNAVAILABLE')
 }
 if(quote.groupId){const row=await tx.config.findUnique({where:{storeId_key:{storeId:order.storeId,key:ACTIVITY_PREFIX+'group.'+quote.groupId}}});if(!row)throw Error('ACTIVITY_GROUP_NOT_FORMED');const g=decode<any>(row.value);if(g.status!=='formed')throw Error('ACTIVITY_GROUP_ALREADY_PAID');await casRecord(tx,row,{...g,status:'paid',orderId:order.id})}
 const grants:any[]=[]
 for(const plan of quote.entitlements){const a=plan.activity;const id=`${order.id}.${a.id}`
 const grant={id,orderId:order.id,orderNumber:order.pickupNumber||order.orderNumber,storeId:order.storeId,memberId:order.memberId,activityId:a.id,activityVersion:a.version,status:'pending',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+365*86400000).toISOString(),eventExpiresAt:new Date(Date.now()+86400000).toISOString(),paidAmount:quote.finalAmount,basePoints,plan,attempts:0}
 await putRecord(tx,order.storeId,ACTIVITY_PREFIX+'grant.'+id,grant);grants.push({id,activityId:a.id,name:a.name,type:a.type,status:'pending'})}
 await putRecord(tx,order.storeId,ACTIVITY_PREFIX+'order.'+order.id,{signature:quote.signature,applied:quote.applied,couponId:quote.couponId,memberId:order.memberId,paidAmount:quote.finalAmount,items:quote.items,entitlementIds:grants.map(g=>g.id)})
 return grants
}
export async function publicActivities(storeId:string,channel=''){
 const now=new Date(),all=await listActivities(storeId),products=await prisma.product.findMany({where:{storeId,status:'active'},include:{specs:true}})
 const rewards=await prisma.rewardCatalog.findMany({where:{storeId,isActive:true,validFrom:{lte:now},validUntil:{gt:now},OR:[{stock:null},{stock:{gt:0}}]}})
 const availableRewards=new Set(rewards.map(r=>r.id))
 const entries=all.filter(a=>a.showOnTv&&activityEligible(a,{now,channel},false)&&(!a.rule.rewardIds?.length||a.rule.rewardIds.some(id=>availableRewards.has(id)))&&(a.type!=='lottery'||a.rule.prizes?.some(p=>p.weight>0&&(p.remaining===undefined||p.remaining>0)&&(!p.rewardId||availableRewards.has(p.rewardId))))).map(a=>({id:a.id,version:a.version,name:a.name,description:a.description,summary:activitySummary(a),type:a.type,startsAt:a.startsAt,endsAt:a.endsAt,weekdays:a.weekdays,dailyStart:a.dailyStart,dailyEnd:a.dailyEnd,timezone:a.timezone,channels:a.channels,paymentMethods:a.paymentMethods,memberOnly:a.memberOnly||['member_price','birthday','welcome'].includes(a.type),memberLevels:a.memberLevels,rule:{price:a.rule.price,percent:a.rule.percent,amount:a.rule.amount,minAmount:a.rule.minAmount,maxDiscount:a.rule.maxDiscount,nth:a.rule.nth,buy:a.rule.buy,get:a.rule.get,participants:a.rule.participants},rewardNames:rewards.filter(r=>a.rule.rewardIds?.includes(r.id)).map(r=>r.name),imageUrl:a.imageUrl,products:products.filter(p=>a.productIds.includes(p.id)||a.rule.components?.some(c=>c.productId===p.id)).map(p=>({id:p.id,name:p.name,image:p.image,quantity:a.rule.components?.find(c=>c.productId===p.id)?.quantity,specs:p.specs.filter(s=>!a.specIds.length||a.specIds.includes(s.id)).map(s=>({id:s.id,name:s.name,price:s.price}))}))}))
 return {version:all.reduce((s,a)=>s+a.version+a.used,0),evaluatedAt:now.toISOString(),activities:entries}
}

async function issueCoupon(tx:any,storeId:string,templateId:string,memberId:string|undefined,orderId:string){
 const c=await tx.coupon.findFirst({where:{id:templateId,storeId,status:'active'}})
 if(!c||c.validUntil<=new Date())throw Error('ACTIVITY_COUPON_UNAVAILABLE')
 const coupon=await tx.coupon.create({data:{storeId,code:'ACT-'+randomUUID(),type:c.type,value:c.value,minOrder:c.minOrder,maxDiscount:c.maxDiscount,validFrom:c.validFrom>new Date()?c.validFrom:new Date(),validUntil:c.validUntil,usageLimit:1,status:'active'}})
 if(memberId)await tx.memberCoupon.create({data:{memberId,couponId:coupon.id,status:'unused'}})
 return {id:coupon.id,code:coupon.code}
}
export async function processActivityGrant(storeId:string,id:string){
 const result=await prisma.$transaction(async tx=>{
 const initial=await tx.config.findUnique({where:{storeId_key:{storeId,key:ACTIVITY_PREFIX+'grant.'+id}}})
 if(!initial)return null
 const first=decode<any>(initial.value)
 // Serialize workers, fulfilment and refunds on the existing order, before reading mutable state.
 await tx.order.updateMany({where:{id:first.orderId,storeId},data:{updatedAt:new Date()}})
 const row=await tx.config.findUniqueOrThrow({where:{storeId_key:{storeId,key:ACTIVITY_PREFIX+'grant.'+id}}})
 const g=decode<any>(row.value)
 if(g.status!=='pending')return g
 const order=await tx.order.findUnique({where:{id:g.orderId}})
 if(order?.status!=='completed'){await casRecord(tx,row,{...g,status:'cancelled'});return null}
 const plan:EntitlementPlan=g.plan,a=plan.activity
 if(g.memberId)await tx.member.updateMany({where:{id:g.memberId,storeId},data:{points:{increment:0}}})
 let rewardId=plan.rewardId,couponId=plan.couponId
 if(a.type==='stamps'&&rewardId){const row=await tx.config.findUnique({where:{storeId_key:{storeId,key:ACTIVITY_PREFIX+`stamps.${a.id}.${g.memberId}`}}});const count=row?decode<any>(row.value).count:0;if(count+(plan.stamps||0)<(a.rule.stampsRequired||1))rewardId=undefined}
 if(a.type==='lottery'){
 const poolKey=ACTIVITY_PREFIX+`prizes.${a.id}.${a.version}`;let poolRow=await tx.config.findUnique({where:{storeId_key:{storeId,key:poolKey}}});if(!poolRow){await putRecord(tx,storeId,poolKey,{prizes:a.rule.prizes});poolRow=await tx.config.findUniqueOrThrow({where:{storeId_key:{storeId,key:poolKey}}})}
 const pool=decode<any>(poolRow.value)
 const prizes=pool.prizes as NonNullable<Activity['rule']['prizes']>
 const available=[] as typeof prizes
 for(const p of prizes){if(p.weight<=0||p.remaining!==undefined&&p.remaining<=0)continue
 if(p.rewardId){const r=await tx.rewardCatalog.findFirst({where:{id:p.rewardId,storeId,isActive:true,validUntil:{gt:new Date()},OR:[{stock:null},{stock:{gt:0}}]}});if(!r)continue}
 available.push(p)}
 const sum=available.reduce((s,p)=>s+p.weight,0)
 if(!sum){await casRecord(tx,row,{...g,status:'unavailable',failure:'Prize pool exhausted'});return null}
 let pick=randomInt(sum),chosen=available[available.length-1]
 for(const p of available){pick-=p.weight;if(pick<0){chosen=p;break}}
 g.prize=chosen;g.prizeIndex=prizes.findIndex(p=>p.id===chosen.id);g.prizes=prizes
 rewardId=chosen.rewardId;couponId=chosen.couponId
 if(chosen.remaining!==undefined){pool.prizes[g.prizeIndex].remaining=chosen.remaining-1;await casRecord(tx,poolRow,pool);const liveRow=await tx.config.findUnique({where:{storeId_key:{storeId,key:activityKey(a.id)}}});if(liveRow){const live=decode<Activity>(liveRow.value);if(live.version===a.version){live.rule.prizes=pool.prizes;await casRecord(tx,liveRow,live)}}}
 }
 if(rewardId){const reward=await tx.rewardCatalog.findFirst({where:{id:rewardId,storeId,isActive:true,validFrom:{lte:new Date()},validUntil:{gt:new Date()}}})
 if(!reward)throw Error('ACTIVITY_REWARD_UNAVAILABLE')
 if(reward.stock!==null){const claimed=await tx.rewardCatalog.updateMany({where:{id:reward.id,stock:{gt:0}},data:{stock:{decrement:1}}});if(claimed.count!==1)throw Error('ACTIVITY_REWARD_UNAVAILABLE')}
 g.expiresAt=reward.validUntil.toISOString()
 g.reward={id:reward.id,name:reward.name,productId:reward.productId,addonId:reward.addonId,type:reward.type};g.stockReserved=reward.stock!==null
 }
 if(couponId){g.coupon=await issueCoupon(tx,storeId,couponId,g.memberId,g.orderId);if(!g.reward){const c=await tx.coupon.findUniqueOrThrow({where:{id:g.coupon.id}});g.expiresAt=c.validUntil.toISOString()}}
 const bonus=(plan.points||0)+(a.type==='points'?Math.round(g.basePoints*Math.max(0,(a.rule.multiplier||1)-1)):0)
 if(bonus&&g.memberId){await tx.member.update({where:{id:g.memberId},data:{points:{increment:bonus}}});await tx.pointLog.create({data:{memberId:g.memberId,orderId:g.orderId,type:'activity_earn',points:bonus,note:`Activity ${g.id}`}});g.pointsAwarded=bonus}
 if(plan.inviterId&&plan.inviterPoints){await tx.member.update({where:{id:plan.inviterId},data:{points:{increment:plan.inviterPoints}}});await tx.pointLog.create({data:{memberId:plan.inviterId,orderId:g.orderId,type:'activity_earn',points:plan.inviterPoints,note:`Activity referral ${g.id}`}});g.inviterId=plan.inviterId;g.inviterPoints=plan.inviterPoints}
 if(plan.stamps&&g.memberId){const key=ACTIVITY_PREFIX+`stamps.${a.id}.${g.memberId}`;const previous=await tx.config.findUnique({where:{storeId_key:{storeId,key}}});const stamp=previous?decode<any>(previous.value):{count:0}
 const used=g.reward?a.rule.stampsRequired||0:0;const next={count:stamp.count+plan.stamps-used}
 if(previous)await casRecord(tx,previous,next);else await putRecord(tx,storeId,key,next)
 g.stampsAwarded=plan.stamps;g.stampsConsumed=used;g.stampsBefore=stamp.count
 }
 g.status=g.reward||g.prize?'ready':'issued';g.processedAt=new Date().toISOString();g.attempts++
 await casRecord(tx,row,g);return g
 })
 if(result?.prize){socketManager.emitTVLotteryTrigger(storeId,{eventId:result.id,orderNumber:result.orderNumber,prizeName:result.prize.name,prizeIndex:result.prizeIndex,prizes:displayPrizes(result.prizes)});socketManager.emitToStore(storeId,'marketing:entitlements:updated',{orderId:result.orderId})}
 if(result)notifyActivities(storeId)
 return result
}
export async function fulfilActivityGrant(storeId:string,id:string){
 return prisma.$transaction(async tx=>{
 const initial=await tx.config.findUnique({where:{storeId_key:{storeId,key:ACTIVITY_PREFIX+'grant.'+id}}});if(!initial)throw Error('ACTIVITY_GRANT_NOT_FOUND')
 const first=decode<any>(initial.value);await tx.order.updateMany({where:{id:first.orderId,storeId},data:{updatedAt:new Date()}})
 const row=await tx.config.findUniqueOrThrow({where:{storeId_key:{storeId,key:ACTIVITY_PREFIX+'grant.'+id}}});const g=decode<any>(row.value)
 if(g.status==='fulfilled')return g
 if(g.status!=='ready'||g.expiresAt<=new Date().toISOString())throw Error('ACTIVITY_GRANT_NOT_READY')
 const order=await tx.order.findUnique({where:{id:g.orderId}});if(order?.status!=='completed')throw Error('ACTIVITY_ORDER_REFUNDED')
 if(g.reward?.productId){const inventory=await deductInventory(storeId,g.orderId,[{productId:g.reward.productId,quantity:1}],tx,{allowNegative:false});if(!inventory.success)throw Error('ACTIVITY_REWARD_INVENTORY_INSUFFICIENT')}
 g.status='fulfilled';g.fulfilledAt=new Date().toISOString();await casRecord(tx,row,g);return g
 })
}
export async function reverseActivityGrants(tx:any,storeId:string,orderId:string,remainingPaid:number,remainingItems:QuoteItem[]=[]){
 if(remainingPaid===0){const quoteRow=await tx.config.findUnique({where:{storeId_key:{storeId,key:ACTIVITY_PREFIX+'order.'+orderId}}});if(quoteRow){const quote=decode<any>(quoteRow.value);if(quote.couponId&&!quote.couponRestored){const coupon=await tx.memberCoupon.findFirst({where:{id:quote.couponId,orderId},include:{coupon:true}});if(coupon&&coupon.coupon.storeId===storeId){await tx.coupon.updateMany({where:{id:coupon.couponId,usedCount:{gt:0}},data:{usedCount:{decrement:1}}});await tx.memberCoupon.update({where:{id:coupon.id},data:{status:'unused',usedAt:null,orderId:null}})}await casRecord(tx,quoteRow,{...quote,couponRestored:true})}}}
 const grants=await records<any>(tx,storeId,'grant.'+orderId+'.')
 for(const g of grants){if(['revoked','cancelled','manual_review'].includes(g.status))continue
 const a:Activity=g.plan.activity,minimum=a.rule.minAmount||0
 const matching=remainingItems.filter(i=>matchesActivityItem(a,i)),remainingStamps=matching.reduce((sum,i)=>sum+i.quantity,0)
 const itemCondition=!(a.productIds.length||a.specIds.length||a.excludedProductIds?.length)||remainingStamps>0
 const qualifies=remainingPaid>0&&remainingPaid>=minimum&&itemCondition
 const row=await tx.config.findUniqueOrThrow({where:{storeId_key:{storeId,key:ACTIVITY_PREFIX+'grant.'+g.id}}})
 const originalPaid=g.originalPaidAmount??g.paidAmount;g.originalPaidAmount=originalPaid
 const retainedBase=Math.floor((g.originalBasePoints??g.basePoints)*Math.min(1,remainingPaid/Math.max(1,originalPaid)))
 g.originalBasePoints=g.originalBasePoints??g.basePoints
 if(g.status==='pending'&&qualifies){g.paidAmount=remainingPaid;g.basePoints=retainedBase;if(g.plan.stamps)g.plan.stamps=remainingStamps;await casRecord(tx,row,g);continue}
 const usedCoupon=g.coupon?await tx.memberCoupon.findFirst({where:{couponId:g.coupon.id,status:'used'}}):null
 const stampRewardValid=a.type!=='stamps'||!g.reward||(g.stampsBefore||0)+remainingStamps>=(a.rule.stampsRequired||1)
 const retain=qualifies&&stampRewardValid,manual=!retain&&(g.status==='fulfilled'||!!usedCoupon)
 const retainedPoints=retain?(g.plan.points||0)+(a.type==='points'?Math.round(retainedBase*Math.max(0,(a.rule.multiplier||1)-1)):0):0
 const pointReversal=Math.max(0,(g.pointsAwarded||0)-retainedPoints)
 if(pointReversal&&g.memberId){await tx.member.update({where:{id:g.memberId},data:{points:{decrement:pointReversal}}});await tx.pointLog.create({data:{memberId:g.memberId,orderId,type:'activity_reverse',points:-pointReversal,note:`Reverse ${g.id}`}});g.pointsAwarded-=pointReversal}
 if(!retain&&g.inviterPoints&&g.inviterId){await tx.member.update({where:{id:g.inviterId},data:{points:{decrement:g.inviterPoints}}});await tx.pointLog.create({data:{memberId:g.inviterId,orderId,type:'activity_reverse',points:-g.inviterPoints,note:`Reverse referral ${g.id}`}});g.inviterPoints=0}
 if(g.stampsAwarded&&g.memberId){const kept=qualifies?remainingStamps:0,key=ACTIVITY_PREFIX+`stamps.${g.activityId}.${g.memberId}`;const stampRow=await tx.config.findUnique({where:{storeId_key:{storeId,key}}});if(stampRow){const stamp=decode<any>(stampRow.value);const restored=!retain&&!manual?(g.stampsConsumed||0):0;await casRecord(tx,stampRow,{count:stamp.count-(g.stampsAwarded-kept)+restored});if(restored)g.stampsConsumed=0}g.stampsAwarded=kept}
 if(!retain&&g.coupon&&!usedCoupon){await tx.coupon.update({where:{id:g.coupon.id},data:{status:'cancelled'}});await tx.memberCoupon.updateMany({where:{couponId:g.coupon.id,status:'unused'},data:{status:'expired'}})}
 if(!retain&&g.stockReserved&&g.reward&&!manual)await tx.rewardCatalog.update({where:{id:g.reward.id},data:{stock:{increment:1}}})
 g.paidAmount=remainingPaid;g.basePoints=retainedBase
 await casRecord(tx,row,retain?g:{...g,status:manual?'manual_review':'revoked',revokedAt:new Date().toISOString(),reason:'Refund invalidated eligibility'})
 }
}
export async function createActivityGroup(storeId:string,activityId:string,memberIds:string[]){
 return prisma.$transaction(async tx=>{
 const a=(await listActivities(storeId,tx)).find(a=>a.id===activityId&&a.type==='group')
 if(!a||activityState(a)!=='active')throw Error('ACTIVITY_GROUP_UNAVAILABLE')
 const unique=[...new Set(memberIds)]
 if((await tx.member.count({where:{id:{in:unique},storeId,status:'active'}}))!==unique.length)throw Error('ACTIVITY_MEMBER_STORE_MISMATCH')
 const g={id:randomUUID(),activityId,memberIds:unique,status:unique.length>=a.rule.participants!?'formed':'forming',createdAt:new Date().toISOString()}
 await putRecord(tx,storeId,ACTIVITY_PREFIX+'group.'+g.id,g);return g
 })
}
export async function joinActivityGroup(storeId:string,id:string,memberId:string){return prisma.$transaction(async tx=>{
 const row=await tx.config.findUnique({where:{storeId_key:{storeId,key:ACTIVITY_PREFIX+'group.'+id}}});if(!row)throw Error('ACTIVITY_GROUP_NOT_FOUND')
 const g=decode<any>(row.value);if(!['forming','formed'].includes(g.status))throw Error('ACTIVITY_GROUP_ALREADY_PAID')
 const member=await tx.member.findFirst({where:{id:memberId,storeId,status:'active'}});if(!member)throw Error('ACTIVITY_MEMBER_STORE_MISMATCH')
 const a=(await listActivities(storeId,tx)).find(a=>a.id===g.activityId);if(!a||activityState(a)!=='active')throw Error('ACTIVITY_GROUP_UNAVAILABLE')
 if(!g.memberIds.includes(memberId))g.memberIds.push(memberId)
 if(g.memberIds.length>=a.rule.participants!)g.status='formed'
 await casRecord(tx,row,g);return g
 })}
let workerPromise:Promise<void>|null=null
export function runActivityJobs():Promise<void>{
 if(workerPromise)return workerPromise
 workerPromise=runActivityJobBatch().finally(()=>{workerPromise=null})
 return workerPromise
}
async function runActivityJobBatch(){
 const rows=await prisma.config.findMany({where:{key:{startsWith:ACTIVITY_PREFIX+'grant.'},category:'activity_grant_pending'},orderBy:{createdAt:'asc'},take:200})
 for(const row of rows){const g=decode<any>(row.value);if(g.status!=='pending'||g.nextAttemptAt&&Date.parse(g.nextAttemptAt)>Date.now())continue
 try{await processActivityGrant(row.storeId,g.id)}catch(error:any){
  console.error('[Activity job]',g.id,error.message)
  try{await prisma.$transaction(async tx=>{
    await tx.order.updateMany({where:{id:g.orderId,storeId:row.storeId},data:{updatedAt:new Date()}})
    const current=await tx.config.findUnique({where:{id:row.id}});if(!current)return
    const state=decode<any>(current.value);if(state.status!=='pending')return
    state.attempts=(state.attempts||0)+1;state.failure=String(error.message).slice(0,1000);state.nextAttemptAt=new Date(Date.now()+Math.min(300000,15000*state.attempts)).toISOString()
    if(['ACTIVITY_REWARD_UNAVAILABLE','ACTIVITY_COUPON_UNAVAILABLE'].includes(error.message))state.status='unavailable'
    await casRecord(tx,current,state)
  })}catch(retryError){console.error('[Activity job retry ledger]',g.id)}
 }
 }
}
export function startActivityWorker(){void runActivityJobs().catch(console.error);const timer=setInterval(()=>void runActivityJobs().catch(console.error),15000);timer.unref();return timer}

export async function claimActivityCoupon(storeId:string,activityId:string,memberId:string,requestId:string){return prisma.$transaction(async tx=>{
 const member=await tx.member.findFirst({where:{id:memberId,storeId,status:'active'}});if(!member)throw Error('ACTIVITY_MEMBER_STORE_MISMATCH')
 await tx.member.updateMany({where:{id:memberId,storeId},data:{points:{increment:0}}})
 const key=ACTIVITY_PREFIX+`claim.${requestId}`;const previous=await tx.config.findUnique({where:{storeId_key:{storeId,key}}})
 if(previous){const p=decode<any>(previous.value);if(p.memberId!==memberId||p.activityId!==activityId)throw Error('ACTIVITY_CLAIM_CONFLICT');return p}
 const a=(await listActivities(storeId,tx)).find(a=>a.id===activityId&&a.type==='coupon'&&a.rule.couponTrigger==='claim')
 if(!a||!activityEligible(a,{channel:'',member:{id:member.id,level:member.level}}))throw Error('ACTIVITY_CLAIM_UNAVAILABLE')
 const claims=await records<any>(tx,storeId,'claim.');if(claims.filter(c=>c.activityId===a.id&&c.memberId===member.id).length>=(a.rule.perMemberLimit||1))throw Error('ACTIVITY_CLAIM_LIMIT')
 await reserveActivity(tx,storeId,a)
 const coupon=await issueCoupon(tx,storeId,a.rule.couponId!,memberId,'')
 const result={id:requestId,activityId,memberId,coupon,createdAt:new Date().toISOString()};await putRecord(tx,storeId,key,result);return result
 })}
export async function linkActivityReferral(storeId:string,memberId:string,inviterCode:string){return prisma.$transaction(async tx=>{
 let member=await tx.member.findFirst({where:{id:memberId,storeId,status:'active'}});const inviter=await tx.member.findFirst({where:{storeId,referralCode:inviterCode,status:'active'}})
 if(!member||!inviter||member.id===inviter.id)throw Error('ACTIVITY_REFERRAL_INVALID')
 await tx.member.updateMany({where:{id:memberId,storeId},data:{points:{increment:0}}})
 member=await tx.member.findFirstOrThrow({where:{id:memberId,storeId,status:'active'}})
 if(member.referredByMemberId){if(member.referredByMemberId===inviter.id)return {linked:true};throw Error('ACTIVITY_REFERRAL_ALREADY_LINKED')}
 if(await tx.order.findFirst({where:{storeId,memberId,status:'completed'}}))throw Error('ACTIVITY_REFERRAL_FIRST_ORDER_REQUIRED')
 await tx.member.update({where:{id:memberId},data:{referredByMemberId:inviter.id}});return {linked:true}
 })}
