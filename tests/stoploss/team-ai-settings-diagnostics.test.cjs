// Pure error-reader tests: no database, credentials, environment file or network.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'../..'),ts=require(root+'/node_modules/typescript');
const filename=root+'/server/src/services/TeamAiDiagnostics.ts',loaded=new Module(filename,module);
loaded.filename=filename;loaded.paths=module.paths;
loaded._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {readProviderDiagnostics:read,visibleProviderDiagnostics:visible}=loaded.exports;
const trace='00112233445566778899aabbccddeeff',secret='abcdef0123456789abcdef0123456789';
const json=(value,status=529,headers={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json',...headers}});
test('529 preserves only known business code, fixed category and response trace',async()=>{
 const result=await read(json({base_resp:{status_code:1033,status_msg:'private message '+secret},trace_id:'ffeeddccbbaa99887766554433221100',error:{message:secret,metadata:{secret}},api_key:secret,employee:{email:'private@example.test'}},529,{trace_id:trace,'x-api-key':secret}),[secret]);
 assert.deepEqual(result,{category:'reported_system',bodyStatus:'json',businessCode:1033,traceId:trace,traceSource:'response_header'});
 assert(!JSON.stringify(result).includes(secret));assert(!JSON.stringify(result).includes('private'));
});
for(const [code,category]of [[1004,'reported_authentication'],[1002,'reported_rate_limit'],[1008,'reported_quota'],[2013,'reported_invalid_request']])test('known provider business code '+code+' has a fixed reported category',async()=>{
 assert.deepEqual(await read(json({base_resp:{status_code:code,status_msg:secret}}),[secret]),{category,bodyStatus:'json',businessCode:code});
});
test('HTTP529 alone is never translated into overload, authentication or quota',async()=>{
 assert.deepEqual(await read(json({base_resp:{status_code:999999999},error:{message:'overloaded; '+secret}}),[secret]),{category:'unknown',bodyStatus:'json'});
 assert.equal((await read(json({error:{type:'overloaded_error',message:secret}}),[secret])).category,'reported_capacity');
});
test('nested secrets and arbitrary allowed-field values cannot become diagnostics',async()=>{
 const result=await read(json({base_resp:{status_code:{secret}},error:{type:secret,code:secret,details:{trace_id:trace}},trace_id:{value:trace},metadata:{trace_id:trace,token:secret}}),[secret]);
 assert.deepEqual(result,{category:'unknown',bodyStatus:'json'});
 for(const code of ['1004','toString','__proto__',null,{},[1004]])assert.equal((await read(json({base_resp:{status_code:code}}),[secret])).businessCode,undefined);
});
test('trace values reject credential, submitted identifier, emails, numbers and overlength',async()=>{
 for(const value of [secret,'private@example.test','1234567890123456','a'.repeat(100),'Bearer '+secret,'<html>']){
  const result=await read(json({trace_id:value},529,{trace_id:value}),[secret]);assert.equal(result.traceId,undefined);
 }
 assert.equal((await read(json({trace_id:trace}),['synthetic submitted identifier '+trace])).traceId,undefined);
 assert.deepEqual(await read(json({trace_id:trace}),[]),{category:'unknown',bodyStatus:'json',traceId:trace,traceSource:'response_body'});
});
for(const body of ['<html>private@example.test '+secret+'</html>','{broken '+secret])test('non-JSON response is never retained: '+body.slice(0,6),async()=>{
 assert.deepEqual(await read(new Response(body,{status:503,headers:{trace_id:trace}}),[secret]),{category:'unknown',bodyStatus:'non_json',traceId:trace,traceSource:'response_header'});
});
test('oversized streamed body cancels early and never parses a prefix',async()=>{
 let pulls=0,cancelled=false;
 const stream=new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(2048).fill(120));},cancel(){cancelled=true;}});
 const result=await read(new Response(stream,{status:529,headers:{trace_id:trace}}),[]);
 assert.equal(result.bodyStatus,'too_large');assert.equal(result.businessCode,undefined);assert.equal(result.traceId,trace);assert(cancelled);assert(pulls<=4);
});
test('broken or never-ending bodies cannot hide the known HTTP outcome or leak errors',async()=>{
 const broken=new ReadableStream({start(controller){controller.error(Error('private '+secret));}});
 assert.deepEqual(await read(new Response(broken,{status:500,headers:{trace_id:trace}}),[secret]),{category:'unknown',bodyStatus:'unavailable',traceId:trace,traceSource:'response_header'});
 let cancelled=false;const hanging=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}}),started=Date.now();
 assert.equal((await read(new Response(hanging,{status:529}),[])).bodyStatus,'unavailable');assert(Date.now()-started<3500);assert(cancelled);
});
test('empty body and legacy diagnostics remain compatible; unknown persisted fields are stripped',async()=>{
 assert.deepEqual(await read(new Response(null,{status:529}),[]),{category:'unknown',bodyStatus:'empty'});
 assert.equal(visible(undefined),undefined);assert.equal(visible({category:'unknown'}),undefined);
 assert.deepEqual(visible({category:'reported_system',bodyStatus:'json',businessCode:1033,traceId:trace,traceSource:'response_header',secret,headers:{token:secret},responseBody:secret}),{category:'reported_system',bodyStatus:'json',businessCode:1033,traceId:trace,traceSource:'response_header'});
 assert.equal(visible({category:secret,bodyStatus:'json'}),undefined);
});
