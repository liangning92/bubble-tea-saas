/* One isolated real native backend for the archived-Hermes full-loop fixture.
 * TLS/JWT/AS/provider are synthetic; no production host configuration is relaxed. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const {randomUUID,generateKeyPairSync}=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),lib=n=>require(root+'/server/node_modules/'+n),built=n=>require(root+'/server/dist/services/'+n);
const dir=process.env.HERMES_LOOP_DIR,dburl=new URL(process.env.DATABASE_URL);
assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));assert(dir?.includes(process.env.BT_TEST_RUN));assert.equal(dburl.hostname,'127.0.0.1');assert.equal(dburl.pathname,'/hermes_loop_test');
const {PrismaClient}=lib('@prisma/client'),jwt=lib('jsonwebtoken'),express=lib('express');
const {createMcpHandler,McpServer}=lib('@modelcontextprotocol/server');
const {createAgentTaskTools}=built('externalMcp/agentTools'),{jwtAccessVerifier,identity}=built('externalMcp/auth');
const {productionAgentBindings,productionAgentBindingKey}=built('externalMcp/productionAgentBindings'),{agentIdentityHash}=built('externalMcp/agentBindings');
const {createAgentTaskService}=built('agentTasks/service'),{createAgentModelRelay}=built('agentTasks/modelRelay');
const {teamCommunication}=built('TeamCommunicationService'),{AGENT_PILOT_KEY}=built('agentTasks/pilot');
const db=new PrismaClient(),storeId='synthetic-hermes-loop',keys=generateKeyPairSync('rsa',{modulusLength:2048}),scopes=['executor.claim','executor.evidence','executor.report'];
let server,sdk,origin,issuer,resource,bindings,service,relay,task,channel,stamp,manager,executorId,tokenCount=0,modelCount=0,mcpCalls=0,reportCalls=0;
const violations=[],modelRequests=[];
const nativeFetch=global.fetch;global.fetch=()=>{throw Error('REAL_NETWORK_FETCH_FORBIDDEN')};
const file=(n,v)=>fs.writeFileSync(path.join(dir,n),typeof v==='string'?v:JSON.stringify(v),{mode:0o600});
async function put(key,value){await db.config.upsert({where:{storeId_key:{storeId,key}},create:{storeId,key,value:JSON.stringify(value),category:'isolated-test'},update:{value:JSON.stringify(value)}})}
const who=role=>({issuer,clientId:'synthetic-'+role,subject:'synthetic-'+role,tokenId:'token-'+role});
function sign(role){const now=Math.floor(Date.now()/1000);return jwt.sign({iss:issuer,aud:resource,sub:who(role).subject,client_id:who(role).clientId,azp:who(role).clientId,jti:who(role).tokenId,scope:(role==='executor'?scopes:['management.assign','management.read','management.review']).join(' '),iat:now,exp:now+300},keys.privateKey,{algorithm:'RS256',header:{typ:'at+jwt',kid:'synthetic-key'}})}
async function finish(){
 const live=await service.get(manager,{taskId:task.taskId,authVersion:1});
 assert.equal(live.state,'awaiting_review',JSON.stringify({state:live.state,error:live.error}));assert.equal(live.report.outcome,'completed');assert(live.report.rawReport.includes('unverified'));
 assert.equal(modelCount,1);assert.equal(reportCalls,1);assert(tokenCount>=1);assert(mcpCalls>=4);
 const inv=await db.inventory.findFirst({where:{storeId}});assert.equal(inv.currentStock,12);
 const receipts=await db.config.findMany({where:{storeId,key:{startsWith:'team.communication.agent.request.'}}});
 file('backend-result.json',{actualNativeCore:true,actualRestrictedRelay:true,actualProvider:false,actualAS:false,modelCount,reportCalls,mcpCalls,tokenCount,state:live.state,reportVerified:false,stockUnchanged:true,receipts:receipts.length,violations});
}
(async()=>{try{
 const app=express();app.use(express.text({type:'*/*',limit:'128kb'}));
 server=https.createServer({key:fs.readFileSync(path.join(dir,'tls.key')),cert:fs.readFileSync(path.join(dir,'tls.crt'))},app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 origin='https://localhost:'+server.address().port;issuer=origin+'/identity/realms/store-agents';resource=origin+'/mcp/agent-tasks';
 const t=await db.tenant.create({data:{name:'Synthetic Hermes loop'}});await db.store.create({data:{id:storeId,name:'Synthetic Hermes loop',tenantId:t.id}});
 const adminId=randomUUID(),staffId=randomUUID();await db.user.create({data:{id:adminId,storeId,role:'admin',phone:'08960002222',password:'synthetic-unused',staff:{create:{id:staffId,storeId,name:'Synthetic owner',employeeNumber:'SYN-LOOP'}}}});
 channel=await teamCommunication(db).create({id:adminId,storeId,staffId,role:'admin'},{requestId:randomUUID(),title:'Synthetic read-only loop',kind:'public',members:[staffId]});await db.inventory.create({data:{storeId,name:'Synthetic cups',category:'packaging',unit:'pcs',currentStock:12}});
 const now=Date.now();stamp={id:randomUUID(),startedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now-1000+86400000).toISOString()};await put(AGENT_PILOT_KEY,{stamp,storeId,channelId:channel.id,taskCode:'STOCK-RO-001',enabled:true,version:1});await put(AGENT_PILOT_KEY+'.anchor.'+stamp.id,stamp);
 const records=['manager','executor'].map(role=>({identityHash:agentIdentityHash(who(role)),agentId:randomUUID(),role,grantVersion:1,clientRevision:1,scopes:role==='executor'?scopes:['management.assign','management.read','management.review'],channelIds:[channel.id],revoked:false,revokedTokenHashes:[],environment:'production',pilotId:stamp.id,expiresAt:stamp.expiresAt}));executorId=records[1].agentId;await put(productionAgentBindingKey,records);
 await put('team.communication.ai.settings',{enabled:true,provider:'minimax',region:'cn',model:'MiniMax-M3.1-Flash',version:5,secret:'synthetic-unusable-provider'});await put('team.communication.ai.connection',{status:'ready',configVersion:5,model:'MiniMax-M3.1-Flash',region:'cn',checkRevision:2,checkedAt:new Date().toISOString(),requestId:randomUUID(),ownerStaffId:staffId});
 bindings=productionAgentBindings(db,{storeId});service=createAgentTaskService(db,{authorize:bindings.authorize,executorFor:bindings.executorFor});manager=await bindings.resolve(who('manager'),records[0].scopes,'management.assign');
 task=await service.assign(manager,{requestId:randomUUID(),authVersion:1,channelId:channel.id,taskCode:'STOCK-RO-001',expectedVersion:0,plan:{objective:'Synthetic native stock read-only test',scope:'stock_readonly_v1',constraints:['No business writes or employee contact'],deadlineAt:stamp.expiresAt,firstReportWithinMs:600000,evidenceRequired:'Cite sealed native stock facts',criteria:[{id:'source',standard:'Use authoritative snapshot only'}]}});
 const verifier=jwtAccessVerifier({issuer,resource:new URL(resource),publicKey:keys.publicKey});
 sdk=createMcpHandler(async({authInfo})=>{const p=await bindings.resolve(identity(authInfo),authInfo.scopes);const s=new McpServer({name:'isolated-native-store',version:'1'});createAgentTaskTools(s,service,scope=>bindings.resolve(identity(authInfo),authInfo.scopes,scope),p.role,p.scopes);return s},{legacy:'stateless',responseMode:'json',maxRequestBodySize:131072});
 async function auth(req){const token=(req.headers.authorization||'').replace(/^Bearer /,'');return verifier.verifyAccessToken(token)}
 app.all('/mcp/agent-tasks',async(req,res)=>{try{const info=await auth(req);const raw=typeof req.body==='string'?req.body:'';if(raw){const body=JSON.parse(raw);if(body.method==='tools/call'){mcpCalls++;if(body.params.name==='store_task_report')reportCalls++;}}const headers=new Headers(req.headers);const request=new Request(resource,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:raw}:{})});const out=await sdk.fetch(request,{authInfo:info});res.status(out.status);out.headers.forEach((v,k)=>res.set(k,v));res.end(Buffer.from(await out.arrayBuffer()))}catch(e){res.status(403).json({error:'ISOLATED_AUTH_OR_PROTOCOL_REJECTED'})}});
 relay=createAgentModelRelay(db,{authorize:bindings.authorize},{enabled:true,transport:async(store,version,request,beforeSend)=>{await beforeSend();modelCount++;assert.equal(store,storeId);assert.equal(version,5);assert.equal(request.reasoning_effort,'low');assert(!('max_tokens'in request));modelRequests.push(request);const sealed=JSON.parse(request.messages.find(m=>m.role==='user').content);assert.equal(sealed.task.taskId,task.taskId);assert(!JSON.stringify(request).includes('leaseToken'));return {id:'synthetic-model',choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'synthetic-report',type:'function',function:{name:'store_task_report',arguments:JSON.stringify({requestId:randomUUID(),outcome:'completed',rawReport:'Synthetic book stock evidence is unverified; physical count remains unknown.',sourceRefs:sealed.evidence.items.map(i=>i.sourceId)})}}]}}],usage:{prompt_tokens:40,completion_tokens:20}}}});
 app.post('/agent-model/v1/chat/completions',async(req,res)=>{try{const info=await auth(req),p=await bindings.resolve(identity(info),info.scopes,'executor.evidence'),body=JSON.parse(req.body);assert(!('authVersion'in body));res.json(await relay.complete(p,{...body,authVersion:p.grantVersion}))}catch(e){res.status(e.status||409).json({error:'ISOLATED_RELAY_REJECTED'})}});
 app.post('/identity/realms/store-agents/protocol/openid-connect/token',(req,res)=>{const body=new URLSearchParams(req.body);assert.equal(req.headers.authorization,'Basic '+Buffer.from('synthetic-executor:synthetic-secret').toString('base64'));assert.equal(body.get('grant_type'),'client_credentials');assert.deepEqual(new Set(body.get('scope').split(' ')),new Set(scopes));tokenCount++;res.json({access_token:sign('executor'),token_type:'Bearer',expires_in:300,scope:scopes.join(' ')})});
 app.get('/identity/realms/store-agents/protocol/openid-connect/certs',(_req,res)=>res.json({keys:[{...keys.publicKey.export({format:'jwk'}),kid:'synthetic-key',use:'sig',alg:'RS256'}]}));
 const dispatch={schemaVersion:1,references:{taskCode:'STOCK-RO-001',taskId:task.taskId,backendRunId:task.runId,eventId:task.dispatch.eventId,executorId,round:task.round,taskVersion:task.taskVersion,leaseVersion:task.leaseVersion}};
 file('backend-ready.json',{endpoints:{api_origin:origin,issuer,resource},pilot:stamp,dispatch});
 console.log('ISOLATED_BACKEND_READY');
 process.stdin.setEncoding('utf8');let input='';for await(const part of process.stdin){input+=part;if(input.includes('\n'))break}assert.equal(JSON.parse(input).command,'finish');await finish();console.log('ISOLATED_NATIVE_REPORT_VERIFIED');
 }finally{global.fetch=nativeFetch;if(sdk)await sdk.close();if(server)await new Promise(r=>server.close(r));await db.$disconnect();}
})().catch(e=>{file('backend-failure.json',{code:'ISOLATED_FULL_LOOP_BACKEND_FAILED',detail:e.message});console.error('ISOLATED_FULL_LOOP_BACKEND_FAILED',e.message);process.exitCode=1});
