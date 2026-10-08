const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('client-pos/src/utils/barcodeIdentity.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports});const {decodeScanIdentity,resolveScanProduct,validCatalogSpec,validCatalogPrice}=m.exports;
const store='synthetic-store',scan={version:1,storeId:store,productId:'p1'};
const product=()=>({id:'p1',storeId:store,name:'Same Tea',status:'active',deletedAt:null,specs:[{id:'s1',name:'Regular',price:10000,productId:'p1'}],addons:[]});
test('identity only: stale names/prices/default spec ignored, legacy and cross-store handoffs refused',()=>{
 const decoded=decodeScanIdentity(JSON.stringify({...scan,specId:'old',unitPrice:0,productName:'old'}),store);assert.equal(JSON.stringify(decoded),JSON.stringify(scan));
 for(const value of [{productId:'p1',unitPrice:100},{...scan,storeId:'other'},{...scan,productId:''},null])assert.equal(decodeScanIdentity(JSON.stringify(value),store),null);
 assert.equal(decodeScanIdentity('{',store),null);
});
test('current directory accepts explicit zero only, rejects absent/string/negative/nonfinite/unsafe price and missing spec',()=>{
 const p=product();p.specs[0].price=0;assert.equal(resolveScanProduct(scan,[p],store).specs[0].price,0);
 for(const price of [undefined,null,'0',-1,NaN,Infinity,0.5,Number.MAX_SAFE_INTEGER+1]){p.specs[0].price=price;assert.equal(resolveScanProduct(scan,[p],store),null);}
 p.specs=[];assert.equal(resolveScanProduct(scan,[p],store),null);
});
test('catalog exact IDs, active store and owned spec required; same names do not substitute; ambiguous identities refused',()=>{
 for(const overrides of [{storeId:'other'},{status:'inactive'},{deletedAt:'2026-01-01'},{id:'another'}])assert.equal(resolveScanProduct(scan,[{...product(),...overrides}],store),null);
 const p=product();p.specs[0].productId='other';assert.equal(resolveScanProduct(scan,[p],store),null);
 assert.equal(resolveScanProduct(scan,[product(),product()],store),null);
 const p2={...product(),id:'p2'};assert.equal(resolveScanProduct(scan,[p2,product()],store).id,'p1');
 const duplicates=product();duplicates.specs.push({...duplicates.specs[0]});assert.equal(resolveScanProduct(scan,[duplicates],store),null);
});
test('catalog addon identity/price validated, no missing addon fallback to free',()=>{
 const p=product();p.addons=[{addonId:'a',addon:{id:'a',name:'Boba',price:0}}];assert.ok(resolveScanProduct(scan,[p],store));
 for(const addon of [{id:'a',name:'Boba'},{id:'wrong',name:'Boba',price:10},{id:'a',name:'Boba',price:'10'}]){p.addons[0].addon=addon;assert.equal(resolveScanProduct(scan,[p],store),null);}
});
function extract(file,predicate){const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found;const visit=n=>{if(predicate(n,ast))found=n;ts.forEachChild(n,visit);};visit(ast);assert.ok(found);return {ast,node:found};}
function code(expr){return ts.transpileModule('globalThis.run='+expr,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;}
const entry=extract('client-pos/src/pages/ScanPage.tsx',(n,a)=>ts.isVariableDeclaration(n)&&n.name.getText(a)==='handleAddToCart');
test('actual ScanPage action stores only versioned product/store identity, mismatch stores nothing',()=>{
 const saved=[],errors=[],nav=[];const context={onChooseIdentity:undefined,scannedProduct:{...product(),price:1},user:{storeId:store},localStorage:{setItem:(...x)=>saved.push(x)},setError:x=>errors.push(x),t:k=>k,navigate:x=>nav.push(x)};vm.runInNewContext(code(entry.node.initializer.getText(entry.ast)),context);context.run();assert.equal(JSON.stringify(JSON.parse(saved[0][1])),JSON.stringify(scan));assert.equal(nav.length,1);
 context.scannedProduct.storeId='other';context.run();assert.equal(saved.length,1);assert.equal(nav.length,1);assert.equal(errors[0],'barcodeIdentity.invalid');
});
const effect=extract('client-pos/src/pages/POSPage.tsx',(n,a)=>ts.isCallExpression(n)&&n.expression.getText(a)==='useEffect'&&n.arguments[0]?.getText(a).includes("const raw = localStorage.getItem('scan_to_cart')"));
function fixture(raw=JSON.stringify(scan),online=true){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});const map=new Map([['scan_to_cart',raw]]),opened=[],toasts=[],requests=[],auth={token:'synthetic',user:{storeId:store}};
 const intent={current:0};const context={scanIntentVersion:intent,showScanModal:false,user:{storeId:store},decodeScanIdentity,resolveScanProduct,navigator:{onLine:online},localStorage:{getItem:k=>map.get(k)||null,removeItem:k=>map.delete(k)},useAuthStore:{getState:()=>auth},posApi:{getProducts:async s=>{requests.push(s);return promise;}},openProductOptions:p=>opened.push(p),showToast:k=>toasts.push(k),t:k=>k};vm.runInNewContext(code(effect.node.arguments[0].getText(effect.ast)),context);return {map,opened,toasts,requests,auth,intent,resolve,reject,start:()=>context.run()};}
const flush=()=>new Promise(setImmediate);
test('actual POS effect refetches authenticated store and opens current product; never creates cart row from handoff',async()=>{
 const f=fixture();f.start();assert.equal(f.requests[0],store);assert.equal(f.opened.length,0);f.resolve({data:{data:{list:[product()]}}});await flush();assert.equal(f.opened[0].specs[0].price,10000);assert.equal(f.map.has('scan_to_cart'),false);
});
test('actual POS effect rejects old/cross-store/offline data without catalog fallback or cart mutation',()=>{
 for(const [raw,online] of [[JSON.stringify({productId:'p1',unitPrice:0}),true],[JSON.stringify({...scan,storeId:'other'}),true],[JSON.stringify(scan),false]]){const f=fixture(raw,online);f.start();assert.equal(f.requests.length,0);assert.equal(f.opened.length,0);assert.equal(f.toasts.length,1);}
});
test('actual POS read failure/invalid catalog preserve cart/options and require rescan',async()=>{
 for(const fail of [true,false]){const f=fixture();f.start();if(fail)f.reject(Error('synthetic'));else f.resolve({data:{data:{list:[{...product(),storeId:'other'}]}}});await flush();assert.equal(f.opened.length,0);assert.equal(f.toasts.length,1);assert.equal(f.map.has('scan_to_cart'),false);}
});
test('actual POS canceled/auth-changed/replaced handoff late responses cannot open options or consume newer identity',async()=>{
 for(const mode of ['cancel','auth','token','replace','intent']){const f=fixture();const cleanup=f.start();if(mode==='cancel')cleanup();if(mode==='auth')f.auth.user.storeId='other';if(mode==='token')f.auth.token='changed';if(mode==='intent')f.intent.current++;if(mode==='replace')f.map.set('scan_to_cart',JSON.stringify({...scan,productId:'p2'}));f.resolve({data:{data:{list:[product()]}}});await flush();assert.equal(f.opened.length,0);assert.equal(f.toasts.length,0);assert.equal(f.map.has('scan_to_cart'),true);}
});
const options=extract('client-pos/src/pages/POSPage.tsx',(n,a)=>ts.isVariableDeclaration(n)&&n.name.getText(a)==='openProductOptions');
test('actual shared options: single explicit zero accepted, multiple specs never auto-select even isDefault',()=>{
 const calls=[],warnings=[],removed=[],context={scanIntentVersion:{current:0},localStorage:{removeItem:k=>removed.push(k)},validCatalogSpec,showToast:x=>warnings.push(x),t:k=>k,handleSpecClick:(p,s)=>calls.push([p,s])};vm.runInNewContext(code(options.node.initializer.getText(options.ast)),context);
 const p=product();p.specs[0].price=0;context.run(p);assert.equal(calls[0][1].price,0);p.specs.push({id:'s2',name:'Large',price:15000,isDefault:true});context.run(p);assert.equal(calls[1][1],null);p.specs[0].price=undefined;context.run(p);assert.equal(calls.length,2);assert.equal(warnings.length,1);assert.equal(context.scanIntentVersion.current,3);assert.deepEqual(removed,['scan_to_cart','scan_to_cart','scan_to_cart']);
});

const search=extract('client-pos/src/pages/ScanPage.tsx',(n,a)=>ts.isVariableDeclaration(n)&&n.name.getText(a)==='handleManualScan');
test('actual scanner ignores older barcode response/finally when a newer scan has completed',async()=>{
 const gates={};for(const id of ['first','second']){let resolve;const promise=new Promise(r=>{resolve=r;});gates[id]={resolve,promise};}
 const products=[],errors=[],loading=[];const auth={user:{storeId:store},token:'synthetic'};
 const context={manualInput:'first',user:{storeId:store},scanSearchVersion:{current:0},useAuthStore:{getState:()=>auth},posApi:{getProductByBarcode:id=>gates[id].promise},setLoading:x=>loading.push(x),setError:x=>errors.push(x),setScannedProduct:x=>{if(x)products.push(x.id);},setScannedMember:()=>{},setManualInput:()=>{},inputRef:{current:{focus:()=>{}}},t:k=>k};
 vm.runInNewContext(code(search.node.initializer.getText(search.ast)),context);const first=context.run();context.manualInput='second';const second=context.run();gates.second.resolve({data:{data:{...product(),id:'p2'}}});await second;gates.first.resolve({data:{data:product()}});await first;assert.equal(JSON.stringify(products),JSON.stringify(['p2']));assert.equal(loading.filter(x=>x===false).length,1);
});

const addAction=extract('client-pos/src/pages/POSPage.tsx',(n,a)=>ts.isVariableDeclaration(n)&&n.name.getText(a)==='handleAddToCartWithAddons');
test('actual shared cart merge keeps changed spec/addon quotes separate, identical quote merges quantity',()=>{
 let cart=[];const p=product();const context={getActivityPrice:(_id,price)=>price,selectedProduct:p,selectedSpec:p.specs[0],selectedAddonIds:[],selectedSugar:'normal_sugar',selectedIce:'normal_ice',addonQty:1,validCatalogSpec,validCatalogPrice,SUGAR_LEVELS:[{id:'normal_sugar',nameKey:'normal'}],ICE_LEVELS:[{id:'normal_ice',nameKey:'normal'}],t:k=>k,showToast:()=>{throw Error('Unexpected validation refusal');},setCart:f=>{cart=f(cart);},logPOSAction:()=>{},setShowAddonModal:()=>{},setSelectedProduct:()=>{},setSelectedSpec:()=>{},setAddonQty:()=>{},setSelectedSugar:()=>{},setSelectedIce:()=>{}};
 vm.runInNewContext(code(addAction.node.initializer.getText(addAction.ast)),context);context.run();context.selectedSpec=p.specs[0]={...p.specs[0],price:15500};context.run();context.run();assert.equal(cart.length,2);assert.equal(cart[0].unitPrice,10000);assert.equal(cart[0].quantity,1);assert.equal(cart[1].unitPrice,15500);assert.equal(cart[1].quantity,2);
 context.selectedAddonIds=['boba'];p.addons=[{addonId:'boba',addon:{id:'boba',name:'Boba',price:2000}}];context.run();p.addons[0].addon.price=3000;context.run();assert.equal(cart.length,4);assert.equal(cart[2].addons[0].price,2000);assert.equal(cart[3].addons[0].price,3000);
});
