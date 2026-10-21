/* Adversarial private-stdio frames against the actual TypeScript adapter.
 * Fake process/filesystem only; no Hermes, model, network or credentials. */
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{EventEmitter}=require('node:events');
const root=path.resolve(__dirname,'../..'),ts=require(root+'/server/node_modules/typescript');
const js=ts.transpileModule(fs.readFileSync(root+'/server/src/services/teamAgentBridge/employeeRuntimeChild.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function scenario(mode){
 let outputCalls=0,unknownCalls=0,writes=0;
 const ticket={protocol:'employee_work_trace_v1',executionId:'00000000-0000-4000-8000-000000000001',requestId:'00000000-0000-4000-8000-000000000002',traceVersion:1};
 const emit=(child,method,params)=>setImmediate(()=>child.stdout.emit('data',Buffer.from(JSON.stringify({protocol:ticket.protocol,method,params})+'\n')));
 function fakeSpawn(){const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.kill=()=>setImmediate(()=>child.emit('close',1));child.stdin.write=()=>{
  writes++;
  if(writes===1){if(mode==='forged'){emit(child,'finished',{stored:{requestId:ticket.requestId,traceVersion:1}});setImmediate(()=>child.emit('close',0))}
   else emit(child,'recordOutput',{executionId:ticket.executionId,expectedTraceVersion:1,providerRequestId:'synthetic-final',providerMessage:{role:'assistant',content:'Observed final report'}})
  }else if(writes===2){emit(child,'finished',{stored:{requestId:ticket.requestId,traceVersion:mode==='wrong-version'?1:2}});setImmediate(()=>child.emit('close',0))}
 };return child}
 const exports={},sandbox={exports,require:n=>n==='child_process'?{spawn:fakeSpawn}:n==='fs/promises'?{stat:async()=>({isFile:()=>true,isDirectory:()=>true,mode:0o700}),realpath:async p=>p}:n==='./employeeRuntimeContract'?{EMPLOYEE_RUNTIME_PROTOCOL:ticket.protocol}:require(n),setTimeout,clearTimeout,Buffer,Promise};vm.runInNewContext(js,sandbox);
 const result=await exports.runEmployeeRuntimeChild(ticket,{recordOutput:async()=>{outputCalls++;if(mode==='rejected')throw Error('SYNTHETIC_PERSIST_FAILED');return {traceVersion:mode==='bad-port-version'?1:2,requestId:ticket.requestId,text:'Observed final report'}},markUnknown:async()=>{unknownCalls++}},{python:'/fixture/python',repository:'/fixture/repo',hermesSource:'/fixture/hermes',hermesExpectedSha:'a'.repeat(40),isolatedRoot:'/fixture/root',providerBaseUrl:'http://127.0.0.1:1/v1',providerCredential:'synthetic-only',deadlineAt:new Date(Date.now()+1000).toISOString()});
 return {state:result.state,outputCalls,unknownCalls}
}
test('matching finished frame without a successful host output commit is unknown',async()=>{assert.deepEqual(await scenario('forged'),{state:'unknown',outputCalls:0,unknownCalls:1})});
test('failed output persistence cannot become complete through child finished',async()=>{assert.deepEqual(await scenario('rejected'),{state:'unknown',outputCalls:1,unknownCalls:1})});
test('successful output RPC and matching finished version are both required',async()=>{assert.deepEqual(await scenario('complete'),{state:'complete',outputCalls:1,unknownCalls:0});assert.deepEqual(await scenario('wrong-version'),{state:'unknown',outputCalls:1,unknownCalls:1})});

test('malformed host receipt cannot be treated as a successful output commit',async()=>{assert.deepEqual(await scenario('bad-port-version'),{state:'unknown',outputCalls:1,unknownCalls:1})});
