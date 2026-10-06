// Execute production TypeScript with in-memory API/Prisma stand-ins; no DB or sockets.
const {test}=require('node:test'); const assert=require('node:assert/strict');
const ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
function moduleAt(path, deps){
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,
 {module,exports:module.exports,require:name=>{if(name in deps)return deps[name];throw Error('Unexpected dependency '+name);},console:{error:()=>{}},Date,Set});
 return module.exports;
}
const auth={authenticate:(req,res,next)=>next(),authorize:(...roles)=>(req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({message:'Forbidden'})};
function routes(path,db,extra={}){
 const handlers={};const router={};for(const method of ['get','post','put','delete'])router[method]=(url,...fns)=>{handlers[method+url]=fns;};
 moduleAt(path,{'express':{Router:()=>router},'../middlewares/auth':auth,'../config/database':{__esModule:true,default:db,prisma:db},'../utils/dateUtils':{},'../services/ShiftSummaryEvidence':moduleAt('server/src/services/ShiftSummaryEvidence.ts',{}),...extra});
 return async (key,req)=>{const res={code:200,status(n){this.code=n;return this;},json(data){this.data=data;return this;}};
 const chain=handlers[key];let i=0;async function next(){if(i<chain.length)return chain[i++](req,res,next);}await next();return res;};
}
const user={storeId:'store-a',role:'cashier',staffId:'staff-a'};
test('payment policy: all-off, one method, absent/malformed and store override',async()=>{
 let rows=[],where;
 const {checkPaymentMethod}=moduleAt('server/src/services/POSConfigPolicy.ts',{'../config/database':{__esModule:true,default:{config:{findMany:async q=>{where=q.where;return rows;}}}}});
 for(const [value,method,error] of [['{}','cash','PAYMENT_METHOD_DISABLED'],['{"qris":true,"cash":false,"defaultMethod":"cash"}','qris',null],['{"qris":true}','cash','PAYMENT_METHOD_DISABLED'],['broken','cash','PAYMENT_CONFIG_UNAVAILABLE'],['null','cash','PAYMENT_CONFIG_UNAVAILABLE']]){
  rows=[{storeId:'store-a',value}];assert.equal(await checkPaymentMethod('store-a',method),error);
 }
 rows=[];assert.equal(await checkPaymentMethod('store-a','cash'),'PAYMENT_CONFIG_UNAVAILABLE');
 rows=[{storeId:'',value:'{"cash":true}'},{storeId:'store-a',value:'{"cash":false}'}];assert.equal(await checkPaymentMethod('store-a','cash'),'PAYMENT_METHOD_DISABLED');
 assert.deepEqual(Array.from(where.storeId.in),['','store-a']);
});
test('shift GET is read-only even when all shifts are disabled',async()=>{
 let query;const run=routes('server/src/routes/shift.ts',{shift:{findMany:async q=>{query=q;return [];},create:()=>{throw Error('GET wrote a shift');}}});
 const res=await run('get/',{user});assert.equal(res.code,200);assert.equal(res.data.data.length,0);assert.equal(query.where.storeId,user.storeId);assert.equal(query.where.isActive,true);
});
test('open shift rejects disabled/missing/custom foreign key; permits configured custom shift and uses auth store',async()=>{
 let active=false,writes=0,where;
 const db={shift:{findFirst:async q=>{where=q.where;return active?{key:'custom'}:null;}},shiftSession:{findFirst:async()=>null,create:async()=>{writes++;return {};}},cashEvent:{create:async()=>{writes++;return {};}}};
 const run=routes('server/src/routes/posCash.ts',db);
 for(const role of ['staff']){const r=await run('post/shifts/open',{user:{...user,role},body:{shift:'custom',openFloat:10}});assert.equal(r.code,403);}
 for(const shift of ['morning','evening','custom']){const r=await run('post/shifts/open',{user,body:{storeId:'foreign',shift,openFloat:10}});assert.equal(r.code,409);assert.equal(writes,0);assert.equal(where.storeId,'store-a');assert.equal(where.isActive,true);}
 let r=await run('post/shifts/open',{user,body:{openFloat:10}});assert.equal(r.code,400);
 active=true;r=await run('post/shifts/open',{user,body:{shift:'custom',openFloat:10}});assert.equal(r.code,201);assert.equal(writes,2);
});
test('new order API rejects store mismatch, unauthorized role, disabled payment/shift; historical records untouched',async()=>{
 let paymentError=null,active=true,writes=0;
 const db={shiftSession:{findFirst:async()=>({id:'old',shift:'evening'})},shift:{findFirst:async q=>{assert.equal(q.where.storeId,'store-a');return active?{}:null;}}};
 const run=routes('server/src/routes/order.ts',db,{'zod':require('zod'),'../utils/storeHelper':{},'../utils/validation':{validateBody:()=>auth.authenticate},'../services/POSConfigPolicy':{checkPaymentMethod:async()=>paymentError},'../services/OrderService':{createOrder:async()=>{writes++;return {};}}});
 const request=(body={},role='cashier')=>({user:{...user,role},body:{storeId:'store-a',paymentMethod:'cash',...body}});
 assert.equal((await run('post/',request({storeId:'foreign'}))).code,403);
 assert.equal((await run('post/',request({},'staff'))).code,403);
 paymentError='PAYMENT_METHOD_DISABLED';assert.equal((await run('post/',request())).data.message,paymentError);assert.equal(writes,0);
 paymentError=null;active=false;assert.equal((await run('post/',request())).data.message,'SHIFT_DISABLED');assert.equal(writes,0);
 active=true;assert.equal((await run('post/',request())).code,201);assert.equal(writes,1);
});
function posFixture(){
 const source=fs.readFileSync('client-pos/src/pages/POSPage.tsx','utf8');const ast=ts.createSourceFile('POSPage.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let load,effect;
 function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='loadConfig')load=n.initializer.arguments[0].getText(ast);
 if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0].getText(ast).includes('paymentInitialized.current ||'))effect=n.arguments[0].getText(ast);ts.forEachChild(n,visit);}visit(ast);
 const state={configLoadVersion:{current:0},paymentInitialized:{current:false},user,localStorage:{getItem:()=>null,setItem:()=>{}},t:x=>x,showToast:()=>{},console:{log:()=>{},warn:()=>{},error:()=>{}},showPaymentModal:false,paymentMethod:'cash',paymentMethods:[],paymentConfigReady:false,configuredDefaultMethod:'',response:{},failed:false,posApi:{getDiscountRules:async()=>({data:{data:[]}})}};
 state.posApi.getConfigs=async()=>{if(state.failed)throw Error('read failure');return {data:{data:state.response}};};
 for(const match of source.matchAll(/\b(set[A-Z]\w*)\(/g))state[match[1]]=()=>{};
 for(const key of ['paymentMethods','paymentMethod','paymentConfigReady','configuredDefaultMethod'])state['set'+key[0].toUpperCase()+key.slice(1)]=v=>{state[key]=v;};
 vm.runInNewContext(ts.transpileModule('globalThis.load='+load+';globalThis.reconcile='+effect,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,state);
 return {state,async poll(value){state.response={paymentMethods:value};state.load();await new Promise(setImmediate);state.reconcile();}};
}
test('actual POS config loader: initial enabled default, polling while paying, all-off, disabled default and reconnect',async()=>{
 const f=posFixture(),s=f.state;
 await f.poll({cash:true,qris:true,defaultMethod:'qris'});assert.equal(s.paymentMethod,'qris');
 s.showPaymentModal=true;s.paymentMethod='cash';await f.poll({cash:true,qris:true,defaultMethod:'qris'});assert.equal(s.paymentMethod,'cash');
 await f.poll({qris:true,defaultMethod:'cash'});assert.equal(s.paymentMethod,'cash');assert.equal(s.configuredDefaultMethod,'qris');assert.equal(s.paymentMethods.length,1);
 s.showPaymentModal=false;s.reconcile();assert.equal(s.paymentMethod,'qris');
 await f.poll({cash:false,qris:false});assert.equal(s.paymentMethods.length,0);assert.equal(s.paymentMethod,'');
 s.failed=true;await f.poll({cash:true});assert.equal(s.paymentConfigReady,false);
 s.failed=false;await f.poll({cash:true,defaultMethod:'cash'});assert.equal(s.paymentConfigReady,true);assert.equal(s.paymentMethod,'cash');
 await f.poll(undefined);assert.equal(s.paymentConfigReady,false);assert.equal(s.paymentMethods.length,0);
});
test('admin toggle normalizes a disabled default and repeated saves keep the normalized value',()=>{
 const source=fs.readFileSync('client-admin/src/pages/settings/POSSettingsPage.tsx','utf8');const ast=ts.createSourceFile('admin.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback;
 function visit(n){if(ts.isJsxAttribute(n)&&n.name.getText(ast)==='onChange'&&n.initializer?.expression?.getText(ast).includes('newMethods.defaultMethod'))callback=n.initializer.expression.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(callback);
 const state={paymentMethods:{cash:true,qris:true,defaultMethod:'cash'},method:{key:'cash'},saved:[]};state.setPaymentMethods=v=>state.paymentMethods=v;state.handleSave=(key,value)=>state.saved.push(value);
 vm.runInNewContext(ts.transpileModule('globalThis.toggle='+callback,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,state);
 state.toggle();assert.equal(state.paymentMethods.cash,false);assert.equal(state.paymentMethods.defaultMethod,'qris');state.handleSave('paymentMethods',state.paymentMethods);assert.equal(state.saved[0].defaultMethod,state.saved[1].defaultMethod);
 state.method={key:'qris'};state.toggle();assert.equal(state.paymentMethods.defaultMethod,'');assert.equal(state.paymentMethods.cash,false);assert.equal(state.paymentMethods.qris,false);
});
test('config routes enforce manager store scope and cashier write permission',async()=>{
 let writes=0;const db={config:{upsert:async()=>{writes++;return {key:'paymentMethods'};},findMany:async()=>[]}};
 const run=routes('server/src/routes/config.ts',db,{'zod':require('zod'),'../utils/validation':{validateBody:()=>auth.authenticate},'../services/TrainingLibraryStore':{isTrainingLibraryKey:()=>false,ordinaryConfigWhere:{}},'../services/StaffConfigService':{}});
 const body={storeId:'store-b',key:'paymentMethods',value:{cash:true},category:'pos'};
 assert.equal((await run('post/',{user,body})).code,403);
 assert.equal((await run('post/',{user:{...user,role:'manager'},body})).code,403);
 assert.equal((await run('get/',{user,query:{storeId:'store-b'}})).code,403);
 assert.equal(writes,0);
 assert.equal((await run('post/',{user:{...user,role:'manager'},body:{...body,storeId:'store-a'}})).code,200);assert.equal(writes,1);
});
test('stale config response cannot undo a newer all-off configuration',async()=>{
 const f=posFixture(),s=f.state;let oldResolve;
 s.posApi.getConfigs=()=>new Promise(resolve=>{oldResolve=resolve;});s.load();
 s.posApi.getConfigs=async()=>({data:{data:{paymentMethods:{cash:false}}}});s.load();await new Promise(setImmediate);
 oldResolve({data:{data:{paymentMethods:{cash:true}}}});await new Promise(setImmediate);
 assert.equal(s.paymentMethods.length,0);
});
test('actual main POS shift loader accepts two/custom shifts and keeps historical session on list failure',async()=>{
 const source=fs.readFileSync('client-pos/src/pages/POSPage.tsx','utf8');const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback;
 function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='fetchShiftData')callback=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);
 const state={activeShifts:[],selected:'',shiftData:null,console:{error:()=>{}},shiftApi:{list:async()=>({data:{data:[{key:'off'},{key:'morning'},{key:'evening'}]}})},posApi:{getCurrentShift:async()=>({data:{data:{shift:{shift:'old-disabled'},hasOpenShift:true}}})}};
 state.setActiveShifts=v=>state.activeShifts=v;state.setSelectedShiftType=v=>state.selected=typeof v==='function'?v(state.selected):v;state.setShiftData=v=>state.shiftData=v;
 vm.runInNewContext(ts.transpileModule('globalThis.load='+callback,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,state);
 await state.load();assert.deepEqual(Array.from(state.activeShifts,s=>s.key),['morning','evening']);assert.equal(state.selected,'morning');
 state.shiftApi.list=async()=>({data:{data:[{key:'off'}]}});await state.load();assert.equal(state.selected,'');assert.equal(state.activeShifts.length,0);
 state.shiftApi.list=async()=>({data:{data:[{key:'custom'}]}});await state.load();assert.equal(state.selected,'custom');
 state.shiftApi.list=async()=>{throw Error('offline');};await state.load();assert.equal(state.activeShifts.length,0);assert.equal(state.selected,'');assert.equal(state.shiftData.shift.shift,'old-disabled');assert.equal(state.shiftData.hasOpenShift,true);
});
test('off cannot open or create a new sale even when active',async()=>{
 let writes=0;
 const db={shift:{findFirst:async()=>({key:'off',isActive:true})},shiftSession:{findFirst:async()=>({id:'historic-off',shift:'off'}),create:async()=>{writes++;return {};}},cashEvent:{create:async()=>{writes++;return {};}}};
 const open=routes('server/src/routes/posCash.ts',db);assert.equal((await open('post/shifts/open',{user,body:{shift:'off',openFloat:100}})).data.message,'SHIFT_DISABLED');
 const order=routes('server/src/routes/order.ts',db,{'zod':require('zod'),'../utils/storeHelper':{},'../utils/validation':{validateBody:()=>auth.authenticate},'../services/POSConfigPolicy':{checkPaymentMethod:async()=>null},'../services/OrderService':{createOrder:async()=>{writes++;return {};}}});
 assert.equal((await order('post/',{user,body:{storeId:'store-a',paymentMethod:'cash'}})).data.message,'SHIFT_DISABLED');assert.equal(writes,0);
});
test('historical off session is readable and closable without active configuration',async()=>{
 let updated,events=[];const historic={id:'historic-off',shift:'off',openFloat:100,status:'open',openedAt:new Date()};
 const db={config:{findFirst:async()=>null},shiftSession:{findMany:async()=>[historic],findFirst:async()=>historic,update:async q=>{updated=q;return {...historic,...q.data};}},cashEvent:{findMany:async()=>[],create:async q=>{events.push(q);return {};}},order:{count:async()=>0,aggregate:async()=>({_sum:{}}),groupBy:async()=>[],findMany:async()=>[]},channel:{findMany:async()=>[]}};
 const run=routes('server/src/routes/posCash.ts',db,{'../utils/dateUtils':{startOfTodayJakarta:()=>new Date('2026-10-06T17:00:00Z')}});
 const read=await run('get/shifts/current',{user});assert.equal(read.code,200);assert.equal(read.data.data.shift.shift,'off');assert.equal(read.data.data.hasOpenShift,true);
 const closed=await run('post/shifts/close',{user,body:{actualCash:100}});assert.equal(closed.code,200);assert.equal(updated.where.id,'historic-off');assert.equal(updated.data.status,'closed');assert.equal(events[0].data.shift,'off');
});
