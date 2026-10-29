import {renderActivityPoster} from '../../shared/utils/activityPoster'
import {test,expect,jest} from '@jest/globals'
import {saveActivityInTransaction} from '../src/services/ActivityService'
import {executeDailySpecial} from '../src/services/teamAgentBridge/employeeDailySpecials'
import {posterVisionMessages,publicProductPosterUrls} from '../src/services/teamAgentBridge/employeePosterPreview'
import {assertPublicationContext} from '../src/services/teamAgentBridge/employeeOperationAuthority'
function fixture(){
 const rows:any[]=[],p={id:'p',storeId:'store',status:'active',name:'Brown Sugar Pearl Sundae',image:'/uploads/p.webp',specs:[{id:'spec',name:'Regular',price:16000,isDefault:true}],images:[]}
 const match=(r:any,w:any)=>Object.entries(w||{}).every(([k,v]:any)=>v&&typeof v==='object'?v.startsWith?r[k]?.startsWith(v.startsWith):true:r[k]===v)
 const db:any={config:{findMany:async({where}:any)=>rows.filter(r=>match(r,where)),findUnique:async({where}:any)=>rows.find(r=>match(r,where.storeId_key)),create:async({data}:any)=>{if(rows.some(r=>r.key===data.key))throw Error('DUPLICATE');rows.push({id:String(rows.length),...data});return data},upsert:async({where,create,update}:any)=>{const r=rows.find(r=>match(r,where.storeId_key));if(r){Object.assign(r,update);return r}const n={id:String(rows.length),...create};rows.push(n);return n},updateMany:async({where,data}:any)=>{const r=rows.filter(r=>match(r,where));r.forEach(r=>Object.assign(r,data));return {count:r.length}}},
 store:{update:async()=>({id:'store'})},product:{findFirst:async({where}:any)=>where.id==='p'&&where.storeId==='store'?p:null,count:async()=>1},
 spec:{count:async()=>1,findFirst:async()=>({...p.specs[0],productId:'p'})},member:{findFirst:async({where}:any)=>where.id==='active'?{id:'active',status:'active',storeId:'store',level:'bronze',points:0}:where.id==='pending'?{id:'pending',status:'pending',storeId:'store',points:0}:null},
 channel:{findFirst:async()=>null},order:{findFirst:async()=>null},productChannelPrice:{findFirst:async()=>null}}
 return {db,rows,p}
}
const input={action:'upsert_daily_special',productIds:['p'],weekday:4,discountValue:4000,memberOnly:true}
test('uses the same unified activity, with per-cup price, real spec and member-only enforcement',async()=>{
 const f=fixture(),r:any=await executeDailySpecial(f.db,'store',input)
 expect(r.ok).toBe(true);expect(r.activity.type).toBe('special_price');expect(r.activity.rule).toEqual({price:12000});expect(r.activity.memberOnly).toBe(true);expect(r.activity.weekdays).toEqual([4]);expect(r.activity.specIds).toEqual(['spec']);expect(r.readbackVerified).toBe(true)
 const repeat:any=await executeDailySpecial(f.db,'store',input);expect(repeat.code).toBe('DAILY_SPECIAL_REUSE_REQUIRED');expect((await executeDailySpecial(f.db,'store',{action:'list_all'}) as any).activities).toHaveLength(1)
})
test('does not publish arbitrary model-authored copy or change unrelated products',async()=>{
 const f=fixture();expect((await executeDailySpecial(f.db,'store',{...input,description:'private costs'}) as any).ok).toBe(false);expect(f.rows).toHaveLength(0)
 await expect(assertPublicationContext({} as any,{} as any,{} as any,'employee_manage_marketing',input)).resolves.toBeUndefined()
 expect((await executeDailySpecial(f.db,'store',{...input,productIds:['other']}) as any).ok).toBe(false)
})
test('zero-match pause fails and a stale version cannot update; paused records remain visible',async()=>{
 const f=fixture(),r:any=await executeDailySpecial(f.db,'store',input)
 expect((await executeDailySpecial(f.db,'store',{action:'pause_activity',activityId:'fake',expectedVersion:1}) as any).ok).toBe(false)
 expect((await executeDailySpecial(f.db,'store',{action:'pause_activity',activityId:r.activity.id,expectedVersion:99}) as any).code).toBe('ACTIVITY_VERSION_CHANGED')
 const paused:any=await executeDailySpecial(f.db,'store',{action:'pause_activity',activityId:r.activity.id,expectedVersion:1});expect(paused.affectedActivities).toBe(1)
 expect((await executeDailySpecial(f.db,'store',{action:'list_all'}) as any).activities[0].status).toBe('paused')
})
test('existing campaign source resolves to unified ID without fuzzy name cancellation',async()=>{
 const f=fixture(),r:any=await executeDailySpecial(f.db,'store',input),row=f.rows.find(r=>r.key.startsWith('marketing.unified.activity.'));const a=JSON.parse(row.value);a.source='campaign:old-campaign';row.value=JSON.stringify(a)
 expect((await executeDailySpecial(f.db,'store',{action:'get_activity',activityId:'old-campaign'}) as any).activity.id).toBe(r.activity.id)
 expect((await executeDailySpecial(f.db,'store',{action:'get_activity',activityId:'Promo'}) as any).ok).toBe(false)
})
test('vision payload is an actual image part, not base64 embedded as text',()=>{
 const value={ok:true,poster:{activityId:'a',displayImage:{dataUrl:'data:image/jpeg;base64,AA==',sha256:'hash'}}}
 const r=posterVisionMessages([{role:'tool',tool_call_id:'x',content:JSON.stringify(value)}])
 expect(r).toHaveLength(2);expect(r[0].content).not.toContain('base64');expect(r[1].content[1].type).toBe('image_url');expect(posterVisionMessages(r)).toEqual(r)
})

test('actual checkout engine excludes nonmembers and pending; charges each designated cup only',async()=>{
 const f=fixture(),r:any=await executeDailySpecial(f.db,'store',input)
 for(const [memberId,quantity,expected] of [[undefined,1,16000],[undefined,2,32000],['pending',1,16000],['pending',2,32000],['active',1,12000],['active',2,24000]] as any[]){
 const q:any=await executeDailySpecial(f.db,'store',{action:'quote_daily_special',activityId:r.activity.id,expectedVersion:1,asOf:'2026-10-29T12:00:00+07:00',memberId,quantity})
 expect(q.finalAmount).toBe(expected);expect(q.targetApplied).toBe(memberId==='active');expect(q.ordersCreated).toBe(0);expect(q.cashierQuoteVerified).toBe(false)
 }
 const bad:any=await executeDailySpecial(f.db,'store',{action:'quote_daily_special',activityId:r.activity.id,expectedVersion:99});expect(bad.code).toBe('ACTIVITY_VERSION_CHANGED')
})
test('legacy basket or multiweekday discounts must be reviewed rather than silently overlap',async()=>{
 const f=fixture();f.rows.push({id:'old',storeId:'store',key:'marketing.unified.activity.old',value:JSON.stringify({id:'old',storeId:'store',type:'fixed',status:'published',weekdays:[],productIds:[],version:1,rule:{amount:4000}})})
 const r:any=await executeDailySpecial(f.db,'store',input);expect(r.code).toBe('ACTIVITY_DAILY_SPECIAL_CONFLICT');expect(r.conflictingActivityId).toBe('old')
})

test('shared editor and Hermes service agree about non-price offers and overnight conflicts',async()=>{
 const f=fixture(),r:any=await executeDailySpecial(f.db,'store',input)
 const row=f.rows.find(r=>r.key.startsWith('marketing.unified.activity.')),a=JSON.parse(row.value);a.weekdays=[1];a.dailyStart='23:00';a.dailyEnd='01:00';row.value=JSON.stringify(a)
 await expect(saveActivityInTransaction(f.db,'store',{name:'Points',type:'points',status:'published',productIds:['p'],rule:{multiplier:2}})).resolves.toMatchObject({type:'points'})
 await expect(saveActivityInTransaction(f.db,'store',{name:'Conflict',type:'fixed',status:'published',productIds:['p'],weekdays:[2],dailyStart:'00:30',dailyEnd:'00:45',rule:{amount:500}})).rejects.toThrow('ACTIVITY_DAILY_SPECIAL_CONFLICT')
 await expect(saveActivityInTransaction(f.db,'store',{name:'Earlier Monday',type:'fixed',status:'published',productIds:['p'],weekdays:[1],dailyStart:'00:30',dailyEnd:'00:45',rule:{amount:500}})).resolves.toMatchObject({type:'fixed'})
})
test('shared conflicts honor expiry, channel and excluded product scopes',async()=>{
 for(const change of [{endsAt:'2020-01-01T00:00:00Z'},{channels:['TAKEAWAY']},{excludedProductIds:['p']},{specIds:['other-spec']}]){
 const f=fixture(),r:any=await executeDailySpecial(f.db,'store',input);const row=f.rows.find(r=>r.key.startsWith('marketing.unified.activity.'));const a={...JSON.parse(row.value),...change};row.value=JSON.stringify(a)
 await expect(saveActivityInTransaction(f.db,'store',{name:'Separate scope',type:'fixed',status:'published',productIds:['p'],specIds:['spec'],channels:['DINE_IN'],startsAt:'2026-10-29T00:00:00Z',rule:{amount:500}})).resolves.toMatchObject({type:'fixed'})
 }
})

test('poster preview cannot read private attachments or an unlinked activity image',()=>{
 expect(()=>publicProductPosterUrls({imageUrl:'/uploads/foreign.png'},{image:'/uploads/actual.png'})).toThrow('POSTER_LOCAL_LINKED_IMAGE_REQUIRED')
 for(const image of ['/uploads/.employee-private/id','/uploads/.training-private/id','/uploads/%2eemployee-private/id','/uploads/media/../.employee-private/id'])expect(publicProductPosterUrls({imageUrl:image},{image})).toEqual([])
 expect(publicProductPosterUrls({imageUrl:'/uploads/media/actual.webp'},{image:'/uploads/media/actual.webp'})).toEqual(['/uploads/media/actual.webp'])
})

test('legacy creation receipt IDs can be inspected and paused with exact store/fingerprint CAS',async()=>{
 const f=fixture(),record:any={id:'legacy-campaign',storeId:'store',name:'Old duplicate',status:'active',actions:'{}',updatedAt:new Date('2026-10-28T00:00:00Z')}
 f.db.campaign={findFirst:async({where}:any)=>where.id===record.id&&where.storeId===record.storeId?{id:record.id,name:record.name,status:record.status,actions:record.actions,updatedAt:record.updatedAt}:null,updateMany:async({where,data}:any)=>{expect(where.storeId).toBe('store');if(where.id!==record.id||where.status!==record.status||where.updatedAt!==record.updatedAt)return {count:0};Object.assign(record,data);return {count:1}}}
 const read:any=await executeDailySpecial(f.db,'store',{action:'get_activity',activityId:record.id});expect(read.legacy.kind).toBe('campaign')
 const stale:any=await executeDailySpecial(f.db,'store',{action:'pause_activity',activityId:record.id,expectedLegacyFingerprint:'0'.repeat(64)});expect(stale.ok).toBe(false);expect(record.status).toBe('active')
 const paused:any=await executeDailySpecial(f.db,'store',{action:'pause_activity',activityId:record.id,expectedLegacyFingerprint:read.legacy.legacyFingerprint});expect(paused.affectedActivities).toBe(1);expect(paused.readbackVerified).toBe(true);expect(record.status).toBe('paused')
})

test('daily posters pin the explicit SKU primary instead of an unrelated portrait and keep the active badge color',async()=>{
 const f=fixture();f.p.image='/uploads/actual-product.webp';(f.p.images as any[]).push({media:{name:'Other Product_9x16.jpg',url:'/uploads/shared-other-product.webp'}})
 const r:any=await executeDailySpecial(f.db,'store',input)
 expect(r.ok).toBe(true);expect(r.activity.imageUrl).toBe(f.p.image)
 expect(r.activity.posterConfig.cardItems[0]).toMatchObject({imageUrl:f.p.image,imageMode:'manual'})
 const products=[{id:'p',name:f.p.name,image:'/uploads/shared-other-product.webp',image9x16:'/uploads/shared-other-product.webp',imageVariants:[{url:'/uploads/shared-other-product.webp',width:720,height:1280}],price:16000}]
 const badge=(html:string)=>/class="badge[^"]*" style="background:([^;"]+)/.exec(html)?.[1]
 for(const day of [4,5]){
  const html=renderActivityPoster({...r.activity,products},{language:2,day,aspectRatio:1080/1350})
  expect(html).toContain('src="/uploads/actual-product.webp"');expect(html).not.toContain('src="/uploads/shared-other-product.webp"')
  expect(badge(html)).toBe('#9f1239')
 }
})

test('an exact legacy fingerprint retires its raw record even when an ended unified activity links the same ID',async()=>{
 const f=fixture(),r:any=await executeDailySpecial(f.db,'store',input),row=f.rows.find(x=>x.key.startsWith('marketing.unified.activity.'))
 const linked={...r.activity,status:'ended',source:'campaign:raw-linked'};row.value=JSON.stringify(linked)
 const raw:any={id:'raw-linked',name:'Previous daily special',status:'active',type:'seasonal',actions:'{}',updatedAt:new Date('2026-10-24T00:00:00Z')}
 const project=(select:any)=>Object.fromEntries(Object.keys(select).filter(k=>raw[k]!==undefined).map(k=>[k,raw[k]]))
 f.db.campaign={findMany:async({select}:any)=>[project(select)],findFirst:async({where,select}:any)=>where.id===raw.id&&where.storeId==='store'?project(select):null,
 updateMany:async({where,data}:any)=>{expect(where.storeId).toBe('store');if(where.id!==raw.id||where.status!==raw.status||where.updatedAt!==raw.updatedAt)return {count:0};Object.assign(raw,data);return {count:1}}}
 const all:any=await executeDailySpecial(f.db,'store',{action:'list_all'}),legacy=all.legacyRecords.find((x:any)=>x.id===raw.id)
 const ordinary:any=await executeDailySpecial(f.db,'store',{action:'get_activity',activityId:raw.id});expect(ordinary.activity.status).toBe('ended')
 const stopped:any=await executeDailySpecial(f.db,'store',{action:'pause_activity',activityId:raw.id,expectedLegacyFingerprint:legacy.legacyFingerprint})
 expect(stopped).toMatchObject({ok:true,affectedActivities:1,readbackVerified:true,legacy:{id:raw.id,status:'paused'}})
 expect(JSON.parse(row.value).status).toBe('ended')
})
