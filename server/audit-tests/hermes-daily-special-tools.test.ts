import {test,expect,jest} from '@jest/globals'
import {executeDailySpecial} from '../src/services/teamAgentBridge/employeeDailySpecials'
import {posterVisionMessages} from '../src/services/teamAgentBridge/employeePosterPreview'
import {assertPublicationContext} from '../src/services/teamAgentBridge/employeeOperationAuthority'
function fixture(){
 const rows:any[]=[],p={id:'p',storeId:'store',status:'active',name:'Brown Sugar Pearl Sundae',costPrice:4891,image:'/uploads/p.webp',specs:[{id:'spec',name:'Regular',price:16000,isDefault:true}],images:[]}
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
 const r:any=await executeDailySpecial(f.db,'store',input);expect(r.code).toBe('DAILY_SPECIAL_DUPLICATE_REVIEW_REQUIRED');expect(r.activities[0].id).toBe('old')
})
