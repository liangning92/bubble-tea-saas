const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const file='shared/utils/offlineMemberPricing.ts',source=fs.readFileSync(file,'utf8'),context={exports:{},Intl,Date,Error,Number,Math,JSON};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context);
const {offlineEarnedPoints,offlineMemberCandidates}=context.exports;
test('client and API share the exact historical offline member arithmetic',()=>assert.equal(source,fs.readFileSync('server/src/utils/offlineMemberPricing.ts','utf8')));
test('points use occurrence day in Jakarta and the original tier/rule',()=>{
 const rule={isActive:true,pointsPerRupiah:1000,minPurchase:1000,birthdayMultiplier:2,tierMultiplier:'{"gold":1.5}'},member={birthday:'2000-01-02T00:00:00+07:00',level:'gold'};
 assert.equal(offlineEarnedPoints(9900,member,rule,'2026-01-01T17:01:00Z'),27);
 assert.equal(offlineEarnedPoints(9900,member,rule,'2026-01-01T16:59:00Z'),13);
 assert.equal(offlineEarnedPoints(9900,member,{...rule,isActive:false},'2026-01-01T17:01:00Z'),0);
 assert.equal(offlineEarnedPoints(999,member,rule,'2026-01-01T17:01:00Z'),0);
});
test('points never exceed the projected local balance or integer rupiah amount',()=>{
 const input={memberId:'m',pointsRequested:99999},evidence={member:{id:'m',status:'active',points:550},coupons:[]};
 const candidate=offlineMemberCandidates(evidence,input,[{unitPrice:10000,quantity:1}],new Date())[0];assert.equal(candidate.pointsRedeemed,500);assert.equal(candidate.discount,5);
 assert.throws(()=>offlineMemberCandidates({...evidence,member:{...evidence.member,points:-1}},input,[],new Date()),/MEMBER_UNAVAILABLE/);
});
test('coupon identity, date, threshold and one-use state remain binding offline',()=>{
 const now=new Date('2026-10-15T05:00:00Z'),coupon={id:'c',code:'OWNED',status:'active',type:'discount_percent',value:10,minOrder:10000,maxDiscount:500,validFrom:'2026-10-15T00:00:00Z',validUntil:'2026-10-16T00:00:00Z',usageLimit:1,usedCount:0};
 const evidence={member:{id:'m',status:'active',points:0},coupons:[{id:'mc',status:'unused',coupon}]},input={memberId:'m',couponId:'mc'},items=[{unitPrice:10000,quantity:1,addons:[{price:2000}]}];
 assert.equal(offlineMemberCandidates(evidence,input,items,now)[0].discount,500);
 for(const invalid of [{status:'used'},{coupon:{...coupon,usedCount:1}},{coupon:{...coupon,validUntil:now.toISOString()}},{coupon:{...coupon,minOrder:13000}}])assert.throws(()=>offlineMemberCandidates({...evidence,coupons:[{...evidence.coupons[0],...invalid}]},input,items,now),/COUPON_UNAVAILABLE/);
});
