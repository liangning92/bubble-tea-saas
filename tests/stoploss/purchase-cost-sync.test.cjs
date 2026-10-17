const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path, dependencies = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const module = {exports:{}};
  new Function('require','module','exports',...Object.keys(globals),code)(name=>dependencies[name],module,module.exports,...Object.values(globals));
  return module.exports;
}
const utils = load('client-admin/src/utils/costSync.ts');
test('only committed receipt/reversal responses trigger immediate sync',()=>{
  for(const action of ['receive','reverse-receipt']) assert.equal(utils.isCostMutation('post',`/purchase-orders/order/${action}`),true);
  for(const url of ['/purchase-orders','/purchase-orders/order/confirm-payment','/purchase-orders/order/refund','/purchase-orders/order/receive-other']) assert.equal(utils.isCostMutation('post',url),false);
  assert.equal(utils.isCostMutation('get','/purchase-orders/order/receive'),false);
});
test('active read queries refresh, drafts remain untouched; cleanup and reconnect work',()=>{
  let cleanup, tick, options, closed=false, message;
  const listeners=new Map(), docListeners=new Map();
  const queryClient={invalidateQueries:(opts)=>{options=opts; return Promise.resolve();}};
  const document={visibilityState:'visible',addEventListener:(name,fn)=>docListeners.set(name,fn),removeEventListener:name=>docListeners.delete(name)};
  const navigator={onLine:true};
  const window={setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>{tick=null;},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  class Channel { constructor(){message=this;} postMessage(value){this.sent=value;}close(){closed=true;} }
  const {CostSync}=load('client-admin/src/components/CostSync.tsx',{
    react:{useEffect:fn=>{cleanup=fn();}},'@tanstack/react-query':{useQueryClient:()=>queryClient},
    '../stores/auth':{useAuthStore:fn=>fn({token:'valid',user:{storeId:'store-a'}})},'../utils/costSync':utils
  },{window,document,navigator,BroadcastChannel:Channel});
  CostSync();tick();assert.equal(options.refetchType,'active');
  for(const key of ['products','inventory','process-recipes','bom-product']) assert.equal(options.predicate({queryKey:[key,'id']}),true);
  for(const key of ['product','process-recipe','orders','product-list-sales']) assert.equal(options.predicate({queryKey:[key]}),false);
  options=null; document.visibilityState='hidden'; tick();assert.equal(options,null);
  document.visibilityState='visible';navigator.onLine=false;tick();assert.equal(options,null);
  navigator.onLine=true;listeners.get('online')();assert.ok(options);
  options=null;message.onmessage({data:{storeId:'other'}});assert.equal(options,null);
  listeners.get(utils.COST_SYNC_EVENT)();assert.deepEqual(message.sent,{storeId:'store-a'});assert.ok(options);
  cleanup();assert.equal(tick,null);assert.equal(closed,true);assert.equal(listeners.size,0);assert.equal(docListeners.size,0);
});
