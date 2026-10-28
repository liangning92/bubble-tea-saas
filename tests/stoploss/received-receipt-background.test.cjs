const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function setup(){
 const target='https://own.invalid/api',auth={token:'synthetic',user:{id:'actor',storeId:'store',staff:{id:'staff'}}},rows=new Map(),calls=[];let send=async body=>({data:{data:{id:'journal',orderNumber:body.orderNumber}}});
 const orders={get:async id=>rows.get(id),update:async(id,changes)=>{Object.assign(rows.get(id),changes)},where:()=>{let filter=()=>true,limit=Infinity;const q={anyOf:(...statuses)=>{filter=row=>statuses.includes(row.status);return q},and:next=>{const before=filter;filter=row=>before(row)&&next(row);return q},limit:value=>{limit=value;return q},toArray:async()=>[...rows.values()].filter(filter).slice(0,limit)};return q}};
 const posApi={retainReceivedReceipt:(body,backend)=>{calls.push({body,backend});return send(body)},createOrder:()=>{throw Error('Backend review must never submit an order')}};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('client-pos/src/utils/receivedReceipt.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:name=>name==='../db/offline'?{db:{orders}}:name==='../services/api'?{posApi}:{currentBackendIdentity:()=>target,readBackendAuth:()=>auth,assertCheckoutBackend:(url,store)=>{assert.equal(url,target);assert.equal(store,'store')}},navigator:{onLine:true},Date,console:{warn:()=>{}}});
 const request={storeId:'store',staffId:'staff',orderNumber:'ORIGINAL',paymentMethod:'cash',items:[{productId:'tea',quantity:1}]},intent={orderId:1,localId:'LOCAL-original',request,backendUrl:target};
 rows.set(1,{id:1,localId:intent.localId,orderNumber:request.orderNumber,storeId:'store',backendUrl:target,status:'sending',finalAmount:10000,checkoutRequest:request});
 return {...exports,rows,calls,intent,orders,target,setSend:fn=>send=fn};
}
test('a stalled backend review copy cannot hold up order admission after local payment evidence commits',{timeout:1000},async()=>{
 const f=setup();let release;f.setSend(()=>new Promise(resolve=>release=resolve));await f.reportReceivedPayment(f.intent,10000,{receivedCash:12000,changeGiven:2000});assert.ok(f.rows.get(1).paymentReportedAt);assert.equal(f.calls.length,1);assert.equal(f.rows.get(1).cloudJournalId,undefined);release({data:{data:{id:'journal',orderNumber:'ORIGINAL'}}});await new Promise(setImmediate);assert.equal(f.rows.get(1).cloudJournalId,'journal');
});
test('failed cloud review upload does not turn a valid locally recorded sale into checkout failure',async()=>{
 const f=setup();f.setSend(async()=>{throw Error('503')});await f.reportReceivedPayment(f.intent,10000);await new Promise(setImmediate);assert.ok(f.rows.get(1).paymentReportedAt);assert.equal(f.rows.get(1).cloudJournalId,undefined);assert.equal(f.rows.get(1).status,'sending');
});
test('actual local payment evidence must still commit before an order can be admitted',async()=>{
 const f=setup();f.orders.update=async()=>{throw Error('storage unavailable')};await assert.rejects(f.reportReceivedPayment(f.intent,10000),/storage unavailable/);assert.equal(f.calls.length,0);
});
test('automatic backend transfer retries only original evidence in its own store/backend and never creates an order',async()=>{
 const f=setup();Object.assign(f.rows.get(1),{status:'quarantined',paymentReportedAt:new Date(),cashTender:{receivedCash:10000,changeGiven:0}});
 f.rows.set(2,{...f.rows.get(1),id:2,localId:'foreign-backend',backendUrl:'https://foreign.invalid/api'});f.rows.set(3,{...f.rows.get(1),id:3,localId:'foreign-store',storeId:'foreign'});
 f.setSend(async()=>{throw Error('offline')});await assert.rejects(f.syncBackendCheckoutReviews(),/offline/);assert.equal(f.calls.length,1);
 f.setSend(async body=>({data:{data:{id:'journal',orderNumber:body.orderNumber}}}));await f.syncBackendCheckoutReviews();assert.equal(f.calls.length,2);assert.deepEqual(f.calls[0],f.calls[1]);assert.equal(f.rows.get(1).status,'quarantined');assert.equal(f.rows.get(1).cloudJournalId,'journal');assert.equal(f.rows.get(2).cloudJournalId,undefined);assert.equal(f.rows.get(3).cloudJournalId,undefined);
});
test('a rejected old review record is retained and cannot stop newer receipt evidence',async()=>{
 const f=setup();Object.assign(f.rows.get(1),{status:'quarantined',paymentReportedAt:new Date()});f.rows.set(2,{...f.rows.get(1),id:2,localId:'LOCAL-next',orderNumber:'NEXT',checkoutRequest:{...f.intent.request,orderNumber:'NEXT'}});
 f.setSend(async body=>{if(body.orderNumber==='ORIGINAL')throw {response:{status:400,data:{message:'RECEIVED_RECEIPT_INVALID'}}};return {data:{data:{id:'next-journal',orderNumber:body.orderNumber}}}});await f.syncBackendCheckoutReviews();assert.ok(f.rows.get(1).backendReviewRejectedAt);assert.equal(f.rows.get(1).status,'quarantined');assert.equal(f.rows.get(2).cloudJournalId,'next-journal');await f.syncBackendCheckoutReviews();assert.equal(f.calls.length,2);
});
