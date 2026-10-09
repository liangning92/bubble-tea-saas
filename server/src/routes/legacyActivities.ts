import { Router } from 'express'
import prisma from '../config/database'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { ensureMigrated, listActivities, saveActivity, records } from '../services/ActivityService'
import { Activity, activityState } from '../utils/activities'
const router=Router()
const defaults={description:'',priority:0,timezone:'Asia/Jakarta',weekdays:[],channels:[],paymentMethods:[],productIds:[],specIds:[],memberOnly:false,memberLevels:[],showOnTv:true}
const array=(v:any)=>{if(Array.isArray(v))return v;try{return JSON.parse(v||'[]')}catch{return []}}
const editable=(a:Activity)=>{const {id,storeId,version,used,source,conflict,...data}=a;return data}
function legacy(a:Activity,kind:string):any{
 const active=activityState(a)==='active'
 if(kind==='discount-rules')return {id:a.id,storeId:a.storeId,name:a.name,status:active?'active':'inactive',discountType:({nth_cup:'second_half',buy_get:'bogo',percent:'percent',fixed:'fixed'} as any)[a.type],minOrderAmount:a.rule.minAmount||0,discountValue:a.rule.amount??a.rule.percent??0,maxDiscount:a.rule.maxDiscount,applicableChannels:a.channels,applicableProducts:a.productIds,excludeProducts:a.excludedProductIds||[],validFrom:a.startsAt,validUntil:a.endsAt,priority:a.priority}
 if(kind==='timed-specials')return {id:a.id,storeId:a.storeId,name:a.name,status:active?'active':'inactive',productId:a.productIds[0],specialPrice:a.rule.price,startTime:a.startsAt,endTime:a.endsAt,daysOfWeek:a.weekdays,applicableChannels:a.channels}
 return {id:a.id,name:a.name,description:a.description,type:a.type,status:a.status,startDate:a.startsAt,endDate:a.endsAt,actions:JSON.stringify({couponId:a.rule.couponId}),triggerType:'automatic'}
}
for(const kind of ['discount-rules','timed-specials','campaigns']){
 const types=kind==='discount-rules'?['nth_cup','buy_get','percent','fixed']:kind==='timed-specials'?['special_price']:['birthday','welcome','coupon','points','referral','stamps','lottery','gift','bundle','group','member_price','upgrade','addon','tiered']
 const handle=(fn:(req:AuthRequest)=>Promise<any>)=>async(req:AuthRequest,res:any)=>{try{if(req.query.storeId&&req.query.storeId!==req.user!.storeId)throw Error('Store access denied');await ensureMigrated(req.user!.storeId);res.json({code:200,data:await fn(req)})}catch(e:any){res.status(409).json({code:409,message:e.message})}}
 router.get('/'+kind,authenticate,authorize('admin','manager','cashier','staff'),handle(async req=>{let all=(await listActivities(req.user!.storeId)).filter(a=>types.includes(a.type));if(req.query.status==='active')all=all.filter(a=>activityState(a)==='active');const list=all.map(a=>legacy(a,kind));return kind==='campaigns'?{list,total:list.length}:list}))
 router.get('/'+kind+'/:id',authenticate,authorize('admin','manager','cashier','staff'),handle(async req=>{const a=(await listActivities(req.user!.storeId)).find(a=>types.includes(a.type)&&(a.id===req.params.id||a.source===`${kind==='discount-rules'?'discount':kind==='timed-specials'?'special':'campaign'}:${req.params.id}`));if(!a)throw Error('ACTIVITY_NOT_FOUND');return legacy(a,kind)}))
 if(kind==='campaigns')router.get('/campaigns/:id/stats',authenticate,authorize('admin','manager'),handle(async req=>{const a=(await listActivities(req.user!.storeId)).find(a=>a.id===req.params.id||a.source==='campaign:'+req.params.id);if(!a)throw Error('ACTIVITY_NOT_FOUND');const grants=(await records<any>(prisma,req.user!.storeId,'grant.')).filter(g=>g.activityId===a.id);return {campaignId:a.id,campaignName:a.name,status:a.status,couponsIssued:grants.filter(g=>g.coupon).length,couponsUsed:await prisma.memberCoupon.count({where:{couponId:{in:grants.filter(g=>g.coupon).map(g=>g.coupon.id)},status:'used'}}),totalValue:null,valueEvidenceAvailable:false}}))
 const save=async(req:AuthRequest)=>{
 const old=req.params.id?(await listActivities(req.user!.storeId)).find(a=>a.id===req.params.id||a.source===`${kind==='discount-rules'?'discount':kind==='timed-specials'?'special':'campaign'}:${req.params.id}`):undefined
 if(req.params.id&&!old)throw Error('ACTIVITY_NOT_FOUND')
 const d={...(old?legacy(old,kind):{}),...req.body};let data:any
 if(kind==='discount-rules')data={...defaults,name:d.name,type:({second_half:'nth_cup',bogo:'buy_get',percent:'percent',fixed:'fixed'} as any)[d.discountType]||'fixed',status:d.status==='inactive'?'paused':'published',priority:d.priority||0,startsAt:d.validFrom?new Date(d.validFrom).toISOString():undefined,endsAt:d.validUntil?new Date(d.validUntil).toISOString():undefined,channels:array(d.applicableChannels).map((c:string)=>c.toUpperCase()),productIds:array(d.applicableProducts),excludedProductIds:array(d.excludeProducts),rule:{minAmount:d.minOrderAmount||0,...(d.discountType==='second_half'?{nth:2,percent:50}:d.discountType==='bogo'?{buy:1,get:1}:d.discountType==='percent'?{percent:d.discountValue}:{amount:d.discountValue}),...(d.maxDiscount?{maxDiscount:d.maxDiscount}:{})}}
 else if(kind==='timed-specials')data={...defaults,name:d.name,type:'special_price',status:d.status==='inactive'?'paused':'published',productIds:[d.productId],startsAt:d.startTime?new Date(d.startTime).toISOString():undefined,endsAt:d.endTime?new Date(d.endTime).toISOString():undefined,channels:array(d.applicableChannels).map((c:string)=>c.toUpperCase()),weekdays:array(d.daysOfWeek),rule:{price:d.specialPrice}}
 else {const actions=typeof d.actions==='string'?JSON.parse(d.actions):d.actions||{};data={...defaults,name:d.name,description:d.description||'',type:['birthday','welcome'].includes(d.type)?d.type:'coupon',status:d.status==='paused'?'paused':'published',memberOnly:true,startsAt:d.startDate?new Date(d.startDate).toISOString():undefined,endsAt:d.endDate?new Date(d.endDate).toISOString():undefined,rule:{couponId:actions.couponId,perMemberLimit:1}}}
 if(old)data={...editable(old),...data}
 return legacy(await saveActivity(req.user!.storeId,data,old?.id,old?.version),kind)
 }
 router.post('/'+kind,authenticate,authorize('admin','manager'),handle(save))
 router.put('/'+kind+'/:id',authenticate,authorize('admin','manager'),handle(save))
 router.delete('/'+kind+'/:id',authenticate,authorize('admin','manager'),handle(async req=>{const a=(await listActivities(req.user!.storeId)).find(a=>a.id===req.params.id||a.source?.endsWith(':'+req.params.id));if(!a)throw Error('ACTIVITY_NOT_FOUND');return saveActivity(req.user!.storeId,{...editable(a),status:'ended'},a.id,a.version)}))
}
export {router as legacyActivitiesRouter}
