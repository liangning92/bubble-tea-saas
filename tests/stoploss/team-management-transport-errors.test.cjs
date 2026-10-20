/* Native fetch/body failure classification only. No database, real key, network or 25s wait. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),ts=require(root+'/node_modules/typescript'),{z}=require(root+'/server/node_modules/zod');
const transpile=file=>ts.transpileModule(fs.readFileSync(root+'/server/src/services/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const diagnostics={};new Function('exports',transpile('TeamAiDiagnostics.ts'))(diagnostics);
const code=transpile('TeamAiService.ts'),sensitive='synthetic-private-key-and-input';
function fixture(fetcher,signal=AbortSignal.timeout(25000)){
 const out={};class TeamError extends Error{constructor(status,message){super(message);this.status=status}}
 const abort={timeout:ms=>{assert.equal(ms,25000);return signal}};
 new Function('require','exports','fetch','AbortSignal',code+'\nexports.nativeTransport=minimax;')(name=>{
  if(name==='crypto')return crypto;if(name==='path')return path;if(name==='fs/promises')return{};if(name==='zod')return{z};if(name.includes('config/database'))return{default:{}};
  if(name.includes('TeamCommunicationService'))return{TeamError};if(name.includes('TeamAiDiagnostics'))return diagnostics;if(name.includes('TeamManagementContext')||name.includes('TeamManagementPolicy')||name.includes('TeamRoutinePolicy'))return{};throw Error(name);
 },out,fetcher,abort);
 return{call:()=>out.nativeTransport(sensitive,'MiniMax-M3.1-Flash','Synthetic system',sensitive,'cn',null,'low'),TeamError};
}
async function rejects(f,code){await assert.rejects(f.call(),e=>{assert(e instanceof f.TeamError);assert.equal(e.status,502);assert.equal(e.message,code);assert(!JSON.stringify(e).includes(sensitive));assert.equal(e.cause,undefined);return true})}
test('fetch timeout uses only this request signal TimeoutError reason without waiting',async()=>{const c=new AbortController();c.abort(new DOMException(sensitive,'TimeoutError'));await rejects(fixture(async()=>{throw Error(sensitive)},c.signal),'TEAM_AI_PROVIDER_TIMEOUT')});
test('fetch transport failure does not expose raw network error or mislabel unrelated TimeoutError',async()=>{await rejects(fixture(async()=>{throw new TypeError(sensitive)}),'TEAM_AI_PROVIDER_TRANSPORT_FAILED');await rejects(fixture(async()=>{throw new DOMException(sensitive,'TimeoutError')}),'TEAM_AI_PROVIDER_TRANSPORT_FAILED')});
test('non-timeout abort remains transport failure',async()=>{const c=new AbortController();c.abort(new DOMException(sensitive,'AbortError'));await rejects(fixture(async()=>{throw Error(sensitive)},c.signal),'TEAM_AI_PROVIDER_TRANSPORT_FAILED')});
test('response body timeout is distinct from fetch timeout',async()=>{const c=new AbortController();await rejects(fixture(async()=>({ok:true,text:async()=>{c.abort(new DOMException(sensitive,'TimeoutError'));throw Error(sensitive)}}),c.signal),'TEAM_AI_PROVIDER_BODY_TIMEOUT')});
test('response body read failure has a fixed code without retaining text or causes',async()=>{await rejects(fixture(async()=>({ok:true,text:async()=>{throw Error(sensitive)}})),'TEAM_AI_PROVIDER_BODY_READ_FAILED')});
test('oversized successful body keeps the existing bound but now reports its stage',async()=>{await rejects(fixture(async()=>({ok:true,text:async()=>sensitive.repeat(30000)})),'TEAM_AI_PROVIDER_BODY_TOO_LARGE')});
test('invalid successful JSON body has parser code without retaining its contents',async()=>{await rejects(fixture(async()=>new Response('{broken '+sensitive,{status:200})),'TEAM_AI_PROVIDER_INVALID_JSON')});
for(const [status,code,businessCode,category]of [[401,'TEAM_AI_CREDENTIAL_REJECTED',1004,'reported_authentication'],[429,'TEAM_AI_PROVIDER_RATE_LIMIT',1002,'reported_rate_limit'],[529,'TEAM_AI_PROVIDER_FAILED',1033,'reported_system']])test('known HTTP '+status+' retains safe status and diagnostics',async()=>{
 const trace='00112233445566778899aabbccddeeff',f=fixture(async()=>new Response(JSON.stringify({base_resp:{status_code:businessCode,status_msg:sensitive},error:{message:sensitive}}),{status,headers:{trace_id:trace}}));await assert.rejects(f.call(),e=>{assert.equal(e.message,code);assert.equal(e.providerHttpStatus,status);assert.deepEqual(e.diagnostics,{category,bodyStatus:'json',businessCode,traceId:trace,traceSource:'response_header'});assert(!JSON.stringify(e).includes(sensitive));return true});
});
test('known HTTP status survives unreadable error body',async()=>{const f=fixture(async()=>new Response(new ReadableStream({start(controller){controller.error(Error(sensitive))}}),{status:529}));await assert.rejects(f.call(),e=>{assert.equal(e.message,'TEAM_AI_PROVIDER_FAILED');assert.equal(e.providerHttpStatus,529);assert.equal(e.diagnostics.bodyStatus,'unavailable');assert(!JSON.stringify(e).includes(sensitive));return true})});
