const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto');
function actual(file,dependencies={}) {
 const exports={}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,{exports,require:id=>dependencies[id]||require(id),Date,Buffer,JSON});return exports;
}
const numbers=actual('client-pos/src/utils/orderNumber.ts');
const {orderSyncPayload}=actual('client-pos/src/utils/orderSyncPayload.ts',{'./orderNumber':numbers});
const serverNumbers=actual('server/src/utils/orderNumber.ts',{'./dateUtils':actual('server/src/utils/dateUtils.ts')});
test('POS online/offline numbers follow the compact server format',()=>{
 const id='LOCAL-420e621f-f0eb-4e8c-9209-91b7720efe12';
 const before=new Date('2026-10-08T16:59:59Z'),after=new Date('2026-10-08T17:00:00Z');
 assert.match(numbers.posOrderNumber(id,before),/^[0-9A-V]{10}$/);
 assert.match(numbers.posOrderNumber(id,after),/^[0-9A-V]{10}$/);
 assert.match(serverNumbers.orderNumberCandidate(after),/^[0-9A-V]{10}$/);
 for(let i=0;i<100;i++)assert.ok(numbers.syncOrderNumberPattern.test(numbers.posOrderNumber('LOCAL-'+crypto.randomUUID(),after)));
});
test('new receipts and historical UUID receipts keep their original identity on retry',()=>{
 const id='LOCAL-420e621f-f0eb-4e8c-9209-91b7720efe12',date=new Date('2026-10-09T04:04:56Z');
 for(const number of [numbers.posOrderNumber(id,date),'ORD20261009-'+numbers.posOrderNumber(id,date),'OFFLINE-'+id.slice(6)]) {
  assert.equal(numbers.matchesCheckoutNumber(number,id,date),true);
  const request={storeId:'store',orderNumber:number,items:[{productId:'tea',quantity:1}]};
  const row={storeId:'store',orderNumber:number,checkoutRequest:request};
  assert.deepEqual(orderSyncPayload(row),request);assert.deepEqual(orderSyncPayload(row),request);
 }
 assert.equal(numbers.matchesCheckoutNumber('ORD20261009-0000000000',id,date),false);
});
const page=fs.readFileSync('client-pos/src/pages/POSPage.tsx','utf8');
const cacheCode=page.slice(page.indexOf('  // Cache the actual enabled template image'),page.indexOf('  // 根据 channelSettings'));
function logoFixture({templateLogo='/uploads/template.png',storeLogo='/uploads/store.png',cache=new Map(),api='https://store.example/api'}={}) {
 const images=[],effects=[];const context={receiptTemplate:{blocks:[{type:'logo',enabled:false,config:{url:'/disabled.png'}},...(templateLogo?[{type:'logo',enabled:true,config:{url:templateLogo}}]:[])]},posReceipt:{storeLogo},storeInfo:{storeLogo:'/uploads/fallback.png'},getApiUrl:()=>api,useRef:()=>({current:''}),useEffect:fn=>effects.push(fn),useCallback:fn=>fn,db:{config:{get:async key=>cache.has(key)?{value:cache.get(key)}:undefined,put:async row=>cache.set(row.key,row.value)}},document:{createElement:()=>({getContext:()=>({drawImage:()=>{}}),toDataURL:()=> 'data:image/png;base64,VALID_CACHED_IMAGE'})},Image:class {constructor(){images.push(this);this.width=64;this.height=64;}}};
 vm.runInNewContext(ts.transpileModule(cacheCode+'\nglobalThis.getLogo=getPrintLogo;globalThis.getBlocks=getPrintBlocks',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,context);
 return {context,images,cache,start:()=>effects[0](),get:()=>context.getLogo()};
}
test('enabled template logo takes precedence and its absolute image is retained across an offline restart',async()=>{
 const f=logoFixture(),cleanup=f.start();assert.equal(f.images[0].src,'https://store.example/uploads/template.png');
 f.images[0].onload();assert.equal(f.get(),'data:image/png;base64,VALID_CACHED_IMAGE');assert.equal(f.context.getBlocks()[1].config.url,f.get());await Promise.resolve();cleanup();
 const offline=logoFixture({cache:f.cache});offline.start();await new Promise(r=>setImmediate(r));assert.equal(offline.get(),f.get());
 const otherStore=logoFixture({cache:f.cache,api:'https://other.example/api'});otherStore.start();await new Promise(r=>setImmediate(r));assert.equal(otherStore.get(),'https://other.example/uploads/template.png');
});
test('missing template source falls back to configured store image, and cancelled downloads cannot replace it',()=>{
 const f=logoFixture({templateLogo:'',storeLogo:''}),cleanup=f.start();assert.equal(f.get(),'https://store.example/uploads/fallback.png');
 const late=f.images[0].onload;cleanup();late();assert.equal(f.cache.size,0);assert.equal(f.get(),'https://store.example/uploads/fallback.png');
});
