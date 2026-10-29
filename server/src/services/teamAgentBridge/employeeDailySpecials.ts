import { createHash } from 'crypto'
import { renderDailyPoster } from './employeePosterPreview'
import { z } from 'zod'
import { ACTIVITY_PREFIX, listActivities, saveActivityInTransaction, quoteActivities } from '../ActivityService'
import { membershipPolicy, paidAmountMeetsMembershipPolicy } from '../MembershipQualificationService'
import { resolveProductImageByRatio } from '../../utils/mediaResolver'

const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
export const dailyActions=['list_all','get_activity','upsert_daily_special','pause_activity','quote_daily_special','inspect_membership','render_daily_poster'] as const
export const dailyAgentActions=dailyActions.filter(action=>action!=='quote_daily_special')
export const dailyProperties={
  activityId:{type:'string'}, expectedVersion:{type:'integer',minimum:1},
  specId:{type:'string'}, weekday:{type:'integer',minimum:1,maximum:5},
  memberOnly:{type:'boolean'}, status:{type:'string',enum:['draft','published','paused']},
  format:{type:'string',enum:['portrait','tv'],description:'Formal admin/TV renderer preview format'},
}
export const dailyInput=z.object({
  action:z.enum(dailyActions),activityId:z.string().min(1).optional(),expectedVersion:z.number().int().positive().optional(),
  productIds:z.array(z.string().min(1)).max(1).optional(),specId:z.string().min(1).optional(),
  weekday:z.number().int().min(1).max(5).optional(),discountValue:z.literal(4000).optional(),memberOnly:z.literal(true).optional(),
  format:z.enum(['portrait','tv']).optional(),asOf:z.string().datetime({offset:true}).optional(),status:z.enum(['draft','published','paused']).optional(),memberId:z.string().optional(),quantity:z.number().int().min(1).max(20).optional(),
}).strict()
const inputOf=(a:any)=>Object.fromEntries(Object.entries(a).filter(([k])=>!['id','storeId','version','used','source','conflict'].includes(k)))

/** The exact ActivityService used by the admin editor and checkout. The caller owns
 * the transaction and authorization; no second campaign/discount database is written. */
export async function executeDailySpecial(db:any,storeId:string,raw:unknown){
  const parsed=dailyInput.safeParse(raw)
  if(!parsed.success)return {ok:false,code:'DAILY_SPECIAL_INPUT_INVALID',details:parsed.error.flatten()}
  const v=parsed.data
  if(['upsert_daily_special','pause_activity'].includes(v.action))await db.store.update({where:{id:storeId},data:{updatedAt:new Date()}})
  const all=await listActivities(storeId,db)
  if(v.action==='inspect_membership')return {ok:true,policy:await membershipPolicy(storeId,db),qualificationChanged:false}
  if(v.action==='list_all'){
    const campaigns=db.campaign?.findMany?await db.campaign.findMany({where:{storeId},select:{id:true,name:true,status:true,actions:true}}):[]
    const rules=db.discountRule?.findMany?await db.discountRule.findMany({where:{storeId},select:{id:true,name:true,status:true}}):[]
    return {ok:true,activities:all,legacyRecords:[...campaigns.map((c:any)=>({...c,kind:'campaign'})),...rules.map((r:any)=>({...r,kind:'discount'}))],complete:true,scope:'all_statuses_in_this_store',fingerprint:hash(all),warning:'Legacy IDs without an explicit source link are not resolved automatically. Select the exact unified ID/version from this list; compare product, rule and dates before pausing.'}
  }
  const byId=(id:string)=>all.find(a=>a.id===id||a.source==='campaign:'+id||a.source==='discount:'+id||a.source==='special:'+id)
  if(v.action==='get_activity'||v.action==='pause_activity'){
    const a=v.activityId?byId(v.activityId):undefined
    if(!a)return {ok:false,code:'ACTIVITY_NOT_FOUND',affectedActivities:0}
    if(v.action==='get_activity')return {ok:true,activity:a,fingerprint:hash(a)}
    if(v.expectedVersion!==a.version)return {ok:false,code:'ACTIVITY_VERSION_CHANGED',currentVersion:a.version,affectedActivities:0}
    if(a.status==='paused'||a.status==='ended')return {ok:true,alreadyPaused:true,activity:a,affectedActivities:0}
    const saved=await saveActivityInTransaction(db,storeId,{...inputOf(a),status:'paused'},a.id,a.version)
    return {ok:true,activity:saved,affectedActivities:1,fingerprint:hash(saved)}
  }
  if(v.action==='render_daily_poster'){
    const a=v.activityId?byId(v.activityId):undefined
    if(!a||a.type!=='special_price'||a.productIds.length!==1)return {ok:false,code:'DAILY_SPECIAL_REQUIRED'}
    if(v.expectedVersion!==a.version)return {ok:false,code:'ACTIVITY_VERSION_CHANGED',currentVersion:a.version}
    const product=await db.product.findFirst({where:{id:a.productIds[0],storeId,deletedAt:null,status:'active'},include:{specs:true,images:{include:{media:true}}}})
    if(!product)return {ok:false,code:'ACTIVITY_PRODUCT_NOT_FOUND'}
    return {ok:true,poster:await renderDailyPoster(a,product,v.format),newSpendCents:0}
  }
  if(v.action==='quote_daily_special'){
    const a=v.activityId?byId(v.activityId):undefined
    if(!a||a.type!=='special_price'||a.productIds.length!==1)return {ok:false,code:'DAILY_SPECIAL_REQUIRED'}
    if(v.expectedVersion!==a.version)return {ok:false,code:'ACTIVITY_VERSION_CHANGED',currentVersion:a.version}
    const p=await db.product.findFirst({where:{id:a.productIds[0],storeId,deletedAt:null,status:'active'},include:{specs:true}})
    const spec=p?.specs.find((s:any)=>a.specIds?.includes(s.id))||p?.specs.find((s:any)=>s.isDefault)||p?.specs[0]
    if(!spec)return {ok:false,code:'ACTIVITY_SPEC_NOT_FOUND'}
    const result=await quoteActivities(storeId,{items:[{productId:p.id,specId:spec.id,quantity:v.quantity||1,unitPrice:0}],memberId:v.memberId,channel:'DINE_IN',taxEnabled:false},db,v.asOf?new Date(v.asOf):new Date())
    const policy=await membershipPolicy(storeId,db)
    // Do not expose member PII or manufacture an order/payment to test admission.
    return {ok:true,sideEffectFree:true,evidenceType:v.asOf?'scheduled_rule_quote_not_actual_cashier_transaction':'current_checkout_engine_quote_not_payment',activityId:a.id,activityVersion:a.version,subtotal:result.subtotal,discount:result.discount,finalAmount:result.finalAmount,applied:result.applied,signature:result.signature,evaluatedAt:result.evaluatedAt,
      thresholdChecks:[29999,30000].map(amount=>({amount,qualifies:paidAmountMeetsMembershipPolicy(amount,policy),evidenceType:'rule_check_not_payment'})),
      pricingEngineInvoked:true,targetApplied:result.applied?.id===a.id,targetState:a.status,memberStatus:v.memberId?(await db.member.findFirst({where:{id:v.memberId,storeId},select:{status:true}}))?.status:'none',cashierQuoteVerified:false,actualPaidQualificationVerified:false,ordersCreated:0,paymentsCreated:0,inventoryMutations:0}
  }
  if(!v.productIds?.length||!v.weekday||v.discountValue!==4000||v.memberOnly!==true)
    return {ok:false,code:'DAILY_SPECIAL_EXPLICIT_RULE_REQUIRED',message:'Provide one product, weekday 1–5, discountValue 4000 and memberOnly true. The Rp30,000 entry policy is separate.'}
  const p=await db.product.findFirst({where:{id:v.productIds[0],storeId,deletedAt:null,status:'active'},include:{specs:true,images:{include:{media:true}}}})
  const spec=p?.specs.find((s:any)=>s.id===v.specId)||(!v.specId&&(p?.specs.find((s:any)=>s.isDefault)||p?.specs[0]))
  if(!spec||!Number.isSafeInteger(spec.price)||spec.price<4000)return {ok:false,code:'DAILY_SPECIAL_ACTUAL_PRICE_REQUIRED'}
  const candidates=all.filter(a=>a.type==='special_price'&&a.productIds.length===1&&a.productIds[0]===p.id&&a.weekdays.length===1&&a.weekdays[0]===v.weekday&&a.status!=='ended')
  const old=v.activityId?byId(v.activityId):undefined
  if(v.activityId&&!old)return {ok:false,code:'ACTIVITY_NOT_FOUND'}
  if(!old&&candidates.length)return {ok:false,code:'DAILY_SPECIAL_REUSE_REQUIRED',activities:candidates.map(a=>({id:a.id,version:a.version,status:a.status}))}
  if(old&&v.expectedVersion!==old.version)return {ok:false,code:'ACTIVITY_VERSION_CHANGED',currentVersion:old.version}
  const overlaps=all.filter(a=>a.id!==old?.id&&a.status==='published'&&['special_price','fixed','percent','nth_cup','buy_get','member_price'].includes(a.type)&&(!a.productIds.length||a.productIds.includes(p.id))&&(!a.weekdays.length||a.weekdays.includes(v.weekday!)))
  if(overlaps.length&&(v.status||'published')==='published')return {ok:false,code:'DAILY_SPECIAL_DUPLICATE_REVIEW_REQUIRED',activities:overlaps.map(a=>({id:a.id,version:a.version,status:a.status,type:a.type}))}
  const image=resolveProductImageByRatio(p,'9:16')
  if(!image)return {ok:false,code:'DAILY_SPECIAL_PRODUCT_IMAGE_REQUIRED',productId:p.id}
  const days=['','Senin','Selasa','Rabu','Kamis','Jumat']
  const description='Hanya untuk member. Belanja Rp30.000 dalam satu transaksi untuk menjadi member. Harga member berlaku untuk pembelian berikutnya tanpa minimum belanja berulang.'
  const input={name:`Promo Member ${days[v.weekday]}`,description,type:'special_price',status:v.status||'published',memberOnly:true,
    productIds:[p.id],specIds:[spec.id],weekdays:[v.weekday],timezone:'Asia/Jakarta',showOnTv:true,imageUrl:image,rule:{price:spec.price-4000},
    posterConfig:{template:'daily_specials',headline:'Hanya untuk Member',subheadline:'Belanja Rp30.000 sekali untuk jadi member. Nikmati harga member pada pembelian berikutnya.',backgroundColor:'#fff7fa',columns:1,rows:1,
      layoutMode:'row_cards',designConfig:{cardLayout:'standard',titlePosition:'top',imageFit:'contain',titleFontSize:32,priceFontSize:48,normalPriceFontSize:24,savingFontSize:24,textShadow:false,subheadlineFontSize:26,headlineFontSize:42,highlightScale:1,highlightMode:'border_only',normalPriceColor:'#475569',savingColor:'#166534',headlineColor:'#9f1239',dayBadgeBg:'#9f1239',priceColor:'#9f1239',titleColor:'#111827',subheadlineColor:'#111827',priceBoxBg:'#ffffff',priceBoxTextColor:'#9f1239',imageHeightRatio:55},
      cardItems:[{id:p.id,productId:p.id,productName:p.name,specName:spec.name,imageUrl:image,originalPrice:spec.price,specialPrice:spec.price-4000,saving:4000,dayOfWeek:v.weekday,dayLabel:days[v.weekday]}]}}
  const current=old&&inputOf(old)
  if(current&&hash(current)===hash({...current,...input}))return {ok:true,alreadyConfigured:true,activity:old,fingerprint:hash(old)}
  const receiptKey='hermes.daily-special.operation.'+hash({storeId,raw:v})
  const receiptRow=await db.config.findUnique({where:{storeId_key:{storeId,key:receiptKey}}})
  if(receiptRow){const prior=JSON.parse(receiptRow.value),actual=all.find(a=>a.id===prior.activityId);if(actual&&hash(actual)===prior.fingerprint)return {ok:true,alreadyConfigured:true,activity:actual,fingerprint:prior.fingerprint,readbackVerified:true};return {ok:false,code:'DAILY_SPECIAL_RECEIPT_CHANGED',activityId:prior.activityId}}
  const saved=await saveActivityInTransaction(db,storeId,{...(current||{}),...input},old?.id,old?.version)
  await db.config.create({data:{storeId,key:receiptKey,category:'marketing',value:JSON.stringify({activityId:saved.id,fingerprint:hash(saved)})}})
  const readback=(await listActivities(storeId,db)).find(a=>a.id===saved.id)
  if(hash(readback)!==hash(saved))throw Error('DAILY_SPECIAL_READBACK_MISMATCH')
  return {ok:true,activity:readback,fingerprint:hash(readback),readbackVerified:true,posterVisualVerified:false,cashierVerified:false,actualPaidQualificationVerified:false,
    detailsUrl:'/marketing/promotions/activities',newSpendCents:0}
}
