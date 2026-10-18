const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const pos=fs.readFileSync('client-pos/src/pages/POSPage.tsx','utf8');
const admin=fs.readFileSync('client-admin/src/pages/settings/POSSettingsPage.tsx','utf8');
const source=file=>fs.readFileSync('client-admin/src/pages/finance/'+file,'utf8');
function expression(text,pattern,vars){const match=text.match(pattern);assert.ok(match,'production expression exists');return vm.runInNewContext(match[1],vars)}
test('saved false image visibility and zero logout timeout survive POS hydration',()=>{
 assert.equal(expression(pos,/productImage: (posLayoutData[^,]+),/,{posLayoutData:{productImage:false},prev:{productImage:'thumb'}}),false);
 assert.equal(expression(pos,/const timeoutMinutes = ([^\n]+)/,{displaySettings:{autoLogoutMinutes:0}}),0);
 assert.equal(expression(pos,/const timeoutMinutes = ([^\n]+)/,{displaySettings:{}}),30);
});
test('every exposed POS layout value rehydrates, retaining old partial hotkeys',()=>{
 const block=admin.slice(admin.indexOf('if (configs.posLayout)'),admin.indexOf('// Load toolbar settings'));
 const initial={gridCols:'4',showPrice:true,productImage:true,hotkeys:{newOrder:'F1',quickPay:'F4'}};
 const configs={posLayout:{gridCols:'6',showPrice:false,productImage:false,hotkeys:{newOrder:'F9'}}};
 let actual;vm.runInNewContext(block,{configs,setPosLayout:fn=>{actual=fn(initial)}});
 assert.equal(actual.gridCols,'6');assert.equal(actual.showPrice,false);assert.equal(actual.productImage,false);assert.equal(actual.hotkeys.newOrder,'F9');assert.equal(actual.hotkeys.quickPay,'F4');
 configs.posLayout.productImage='hidden';vm.runInNewContext(block,{configs,setPosLayout:fn=>{actual=fn(initial)}});assert.equal(actual.productImage,false);
});
test('disabled quick amounts render none; all configured amounts remain available',()=>{
 const pattern=/\{\((quickAmounts.enabled[^\n]+?)\)\.map\(amount/;
 assert.equal(expression(pos,pattern,{quickAmounts:{enabled:false,amounts:[10000]}}).length,0);
 assert.equal(expression(pos,pattern,{quickAmounts:{enabled:true,amounts:[10000,20000,50000,100000]}}).length,4);
});
async function loadFinance(file,fixtures,props={}){
 const text=source(file);const start=text.indexOf('const loadSettings = async () => {')+'const loadSettings = async () => {'.length;const end=text.indexOf('\n  }',start);
 let actual;const context={user:{storeId:'store-a'},configApi:{get:async store=>{assert.equal(store,'store-a');return{data:{code:200,data:fixtures}}}},setSettings:v=>{actual=v},setIsLoading:()=>{},console,DEFAULT_SETTINGS:{ppnRate:11,ppnEnabled:true},...props};
 await vm.runInNewContext(ts.transpileModule('(async()=>{'+text.slice(start,end)+'})()', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);return actual;
}
test('finance settings consume the real key-value response and preserve disabled/zero values',async()=>{
 const data={'finance.settings':{enableAccounts:false,accountingMode:'simple',currency:'IDR'},'finance.ppnRate':0,'finance.ppnEnabled':false};
 const actual=await loadFinance('FinanceSettingsPage.tsx',data);assert.equal(actual.enableAccounts,false);assert.equal(actual.ppnRate,0);assert.equal(actual.ppnEnabled,false);
 const index=await loadFinance('FinanceIndexPage.tsx',data);assert.equal(index.enableAccounts,false);
});
test('tax modal reopens all saved values from the real API contract',async()=>{
 const text=source('TaxConfigModal.tsx');const start=text.indexOf('const loadConfig = async () => {')+'const loadConfig = async () => {'.length,end=text.indexOf('\n  }',start);let actual;
 const data={'finance.ppnEnabled':false,'finance.ppnRate':0,'finance.taxExemptCategories':['food'],'finance.taxableRatio':0};
 await vm.runInNewContext('(async()=>{'+text.slice(start,end)+'})()',{user:{storeId:'a'},setIsLoading:()=>{},setConfig:v=>{actual=v},configApi:{get:async()=>({data:{data}})},console});
 assert.equal(actual.ppnEnabled,false);assert.equal(actual.ppnRate,0);assert.equal(actual.taxableRatio,0);assert.equal(actual.taxExemptCategories[0],'food');
});
test('category readers request the same store as the writer and isolate response cache shape',()=>{
 for(const file of ['InventoryPage','InventoryCategoryPage']){const text=fs.readFileSync('client-admin/src/pages/inventory/'+file+'.tsx','utf8');assert.match(text,/configApi\.get\(user\?\.storeId \|\| undefined\)/);assert.match(text,/['"]inventory-categories['"]/)}
});
