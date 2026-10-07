const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function fixture(){
 const state={target:'https://original.invalid/api',writes:[],events:[],retry:0},storage=new Map(),exports={};let tick;
 const normalizeApiUrl=value=>value.replace(/\/$/,'');
 const config={getApiUrl:()=>state.target,setApiUrl:value=>{state.writes.push(value);state.target=value;},normalizeApiUrl};
 const context={exports,require:name=>name==='../config'?config:{backendAuthHeaders:()=>({})},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},navigator:{onLine:true},window:{setInterval:callback=>{tick=callback;return 1;},addEventListener:()=>{}},clearInterval:()=>{},setTimeout,clearTimeout,AbortController,fetch:async()=>({ok:false}),console,Date};
 const code=ts.transpileModule(fs.readFileSync('client-pos/src/services/ConnectionManager.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,context);const manager=exports.connectionManager;manager.addListener(event=>state.events.push(event));manager.retryWithBackoff=async()=>{state.retry++;};
 return{state,manager,tick:()=>tick()};
}
test('periodic health result for a previous target cannot change identity or state',async()=>{
 for(const success of [true,false]){const f=fixture();let resolve;f.manager.healthCheck=()=>new Promise(done=>resolve=done);f.manager.startHealthCheck();const pending=f.tick();f.state.target='https://selected.invalid/api';resolve({success,url:'https://original.invalid/api',latency:1});await pending;assert.equal(f.manager.getCurrentUrl(),f.state.target);assert.equal(f.manager.getState(),'disconnected');assert.deepEqual(f.state.writes,[]);assert.deepEqual(f.state.events,[]);assert.equal(f.state.retry,0);}
});
test('current target health preserves recovery and retry without writing business URL',async()=>{
 const f=fixture();f.manager.healthCheck=async()=>({success:true,url:f.state.target,latency:1});f.manager.startHealthCheck();await f.tick();assert.equal(f.manager.getState(),'connected');assert.deepEqual(f.state.writes,[]);f.manager.healthCheck=async()=>({success:false,url:f.state.target,latency:-1});await f.tick();assert.equal(f.state.retry,1);assert.deepEqual(f.state.writes,[]);
});
test('manual connection failure keeps selected target despite configured alternatives',async()=>{
 const f=fixture();f.manager.healthCheck=async()=>({success:false,url:f.state.target,latency:-1});assert.equal(await f.manager.connect(),f.state.target);assert.equal(f.manager.getState(),'offline');assert.deepEqual(f.state.writes,[]);
});
