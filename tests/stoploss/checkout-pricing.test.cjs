const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,file);
const {checkoutPriceChanged}=require('../../client-pos/src/utils/checkoutPricing.ts');
const quote={signature:'old',subtotal:28000,discount:0,finalAmount:28000,tax:0,grandTotal:28000,items:[{productId:'tea',specId:'regular',quantity:2,unitPrice:14000,addons:[]}]};
test('quote signatures, activity versions and gifts alone are not a price change',()=>{
 assert.equal(checkoutPriceChanged(quote,{...quote,signature:'fresh',evaluatedAt:'later',entitlements:[{id:'gift',version:2}]}),false);
});
test('prices, tax, discounts, points and item prices still require review',()=>{
 for(const field of ['subtotal','discount','finalAmount','tax','grandTotal','pointsRedeemed'])assert.equal(checkoutPriceChanged(quote,{...quote,[field]:100}),true,field);
 assert.equal(checkoutPriceChanged(quote,{...quote,items:[{...quote.items[0],unitPrice:15000}]}),true);
});
// Execute the real payment guard so regressions cannot hide behind helper tests.
const page=fs.readFileSync('client-pos/src/pages/POSPage.tsx','utf8');
const start=page.indexOf('    let quoteFailure: any');
const stop=page.indexOf('\n    if (paymentIssue)',start);
const guard=ts.transpileModule('async function run(){'+page.slice(start,stop)+';return checkoutQuote}',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
async function verify(value,error){
 const notices=[],dialogs=[],logs=[],updates=[];
 const run=new Function('env','with(env){'+guard+';return run}')({
  currentQuote:quote,quoteInput:{},quoteInputKey:'basket',total:28000,paymentMethod:'cash',
  activitiesApi:{quote:async()=>{if(error)throw error;return {data:{data:value}}}},
  checkoutPriceChanged,logPOSAction:v=>logs.push(v),setActivityRevision:()=>{},setUnifiedQuote:v=>updates.push(v),
  showToast:(...v)=>notices.push(v),t:v=>v,setConfirmModal:v=>dialogs.push(v),
 });
 return {result:await run(),notices,dialogs,logs,updates};
}
test('timeout preserves basket, reports failure and never opens price dialog or submits a sale',async()=>{
 const r=await verify(null,{code:'ETIMEDOUT'});assert.equal(r.result,undefined);assert.equal(r.dialogs.length,0);assert.equal(r.notices[0][0],'activityPricing.unavailable');assert.equal(r.logs[0].metadata.failureCode,'ETIMEDOUT');assert.equal(r.logs[0].metadata.phase,'price_verification');
});
test('same-price signature refresh continues with the new signature; actual price change stops',async()=>{
 const refreshed={...quote,signature:'fresh'};
 const r=await verify(refreshed);assert.equal(r.result.signature,'fresh');assert.equal(r.dialogs.length,0);
 const changed=await verify({...refreshed,grandTotal:30000});assert.equal(changed.result,undefined);assert.equal(changed.dialogs[0].title,'activityPricing.changedTitle');
});
test('new required gift selection pauses checkout without alleging a price change',async()=>{
 const r=await verify({...quote,signature:'fresh',pendingSelections:[{activityId:'gift'}]});assert.equal(r.result,undefined);assert.equal(r.dialogs.length,0);assert.equal(r.notices[0][0],'activityPricing.wait');
});
