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

async function nativeScenario(forged=false){
 const rootId='00000000-0000-4000-8000-000000000011',childId='00000000-0000-4000-8000-000000000012';
 const ticket={protocol:'employee_work_trace_v1',executionId:rootId,requestId:'root-request',traceVersion:1,compartmentKey:'a'.repeat(64),native:{delivery:'channel'}};
 const childTicket={...ticket,executionId:childId,requestId:'child-request',native:{delivery:'parent_only',parentExecutionId:rootId,parentToolCallId:'delegate-call'}};
 const output=(executionId,version)=>({executionId,expectedTraceVersion:version,providerRequestId:'observed-'+executionId,providerMessage:{role:'assistant',content:executionId===rootId?'root answer':'child artifact'}});
 const frames=forged?[['recordOutput',output(childId,1)]]:[['beginChild',{executionId:rootId,expectedTraceVersion:1,toolCallId:'delegate-call'}],['recordOutput',output(childId,1)],['recordOutput',output(rootId,2)],['finished',{stored:{requestId:ticket.requestId,traceVersion:3}}]];
 let index=0,unknownCalls=0;const outputs=[];
 function fakeSpawn(){const process=new EventEmitter();process.stdout=new EventEmitter();process.stderr=new EventEmitter();process.stdin=new EventEmitter();process.kill=()=>setImmediate(()=>process.emit('close',1));process.stdin.write=()=>{
  const next=frames[index++];if(!next)return;
  setImmediate(()=>{process.stdout.emit('data',Buffer.from(JSON.stringify({protocol:ticket.protocol,method:next[0],params:next[1]})+'\n'));if(next[0]==='finished')setImmediate(()=>process.emit('close',0))});
 };return process}
 const exports={},sandbox={exports,require:n=>n==='child_process'?{spawn:fakeSpawn}:n==='fs/promises'?{stat:async()=>({isFile:()=>true,isDirectory:()=>true,mode:0o700}),realpath:async p=>p}:n==='./employeeRuntimeContract'?{EMPLOYEE_RUNTIME_PROTOCOL:ticket.protocol}:require(n),setTimeout,clearTimeout,Buffer,Promise};vm.runInNewContext(js,sandbox);
 const result=await exports.runEmployeeRuntimeChild(ticket,{beginChild:async()=>({traceVersion:2,ticket:childTicket}),recordOutput:async p=>{outputs.push(p.executionId);return {traceVersion:p.expectedTraceVersion+1,requestId:p.executionId===rootId?ticket.requestId:childTicket.requestId,text:p.providerMessage.content}},markUnknown:async()=>{unknownCalls++}},
  {python:'/fixture/python',repository:'/fixture/repo',hermesSource:'/fixture/hermes',hermesExpectedSha:'a'.repeat(40),isolatedRoot:'/fixture/root',providerBaseUrl:'http://127.0.0.1:1/v1',providerCredential:'synthetic-only',deadlineAt:new Date(Date.now()+1000).toISOString()});
 return {state:result.state,outputs,unknownCalls};
}
test('native child frames have their own versions and cannot be mistaken for the root reply',async()=>{
 const result=await nativeScenario();assert.equal(result.state,'complete');assert.deepEqual(result.outputs,['00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000011']);assert.equal(result.unknownCalls,0);
});
test('an unregistered child execution cannot inject an output into another conversation',async()=>{
 const result=await nativeScenario(true);assert.equal(result.state,'unknown');assert.deepEqual(result.outputs,[]);assert.equal(result.unknownCalls,1);
});
