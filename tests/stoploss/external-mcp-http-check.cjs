/* Official v2 and v1 MCP clients over loopback HTTP, actual JWT signatures + disposable Postgres. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {randomUUID,generateKeyPairSync}=require('node:crypto'),root=path.resolve(__dirname,'../..');
const {PrismaClient}=require(root+'/server/node_modules/@prisma/client'),jwt=require(root+'/server/node_modules/jsonwebtoken');
const modern=require(root+'/server/node_modules/@modelcontextprotocol/client'),{Client:LegacyClient}=require(root+'/server/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const {StreamableHTTPClientTransport:LegacyTransport}=require(root+'/server/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js');
const {toNodeHandler}=require(root+'/server/node_modules/@modelcontextprotocol/node');
const {externalMcpHandler}=require(root+'/server/dist/services/externalMcp/handler'),{jwtAccessVerifier}=require(root+'/server/dist/services/externalMcp/auth');
const {bindingKey,tokenHash}=require(root+'/server/dist/services/externalMcp/store');
const {externalAccess}=require(root+'/server/dist/services/externalAccess/service'),{postgresExternalRepository}=require(root+'/server/dist/services/externalAccess/postgresRepository');
const dbUrl=new URL(process.env.DATABASE_URL);assert.equal(dbUrl.hostname,'127.0.0.1');assert.equal(dbUrl.pathname,'/team_test');assert.equal(process.env.NODE_ENV,'test');assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));
const db=new PrismaClient(),out=root+'/output/external-mcp';fs.mkdirSync(out,{recursive:true});
const keys=generateKeyPairSync('rsa',{modulusLength:2048}),otherKeys=generateKeyPairSync('rsa',{modulusLength:2048});
const issuer='https://isolated-issuer.invalid',who={issuer,clientId:'synthetic-mcp-client',subject:'synthetic-delegated-subject',tokenId:'fixture-token-one'};
const channelId=randomUUID(),otherChannel=randomUUID(),taskId=randomUUID(),oldTaskId=randomUUID(),otherTaskId=randomUUID();
let server,handler,nodeHandler,resource,registration,binding,baseState,modernClient,legacyClient;const results=[],wire=[],security=[];
async function check(name,fn){await fn();results.push(name);console.log('PASS '+name)}
async function config(key,value,storeId='mcp-store'){await db.config.upsert({where:{storeId_key:{storeId,key}},create:{storeId,key,value:JSON.stringify(value),category:'externalAgent'},update:{value:JSON.stringify(value)}})}
async function restore(){await config('externalAgent.access.v1',baseState);await config(bindingKey(who),binding)}
function sign(overrides={},options={}){const now=Math.floor(Date.now()/1000);return jwt.sign(JSON.parse(JSON.stringify({iss:issuer,aud:resource.href,sub:who.subject,client_id:who.clientId,jti:who.tokenId,scope:'tasks.read',iat:now,exp:now+120,...overrides})),options.privateKey||keys.privateKey,{algorithm:options.algorithm||'RS256',header:{typ:options.typ||'at+jwt'}})}
async function safeFetch(input,init){const url=new URL(typeof input==='string'?input:input.url||input);assert.equal(url.origin,resource.origin,'External network forbidden');if(typeof init?.body==='string'){const b=JSON.parse(init.body);wire.push(b.method)}return fetch(input,init)}
async function connect(token,legacy=false){const C=legacy?LegacyClient:modern.Client,T=legacy?LegacyTransport:modern.StreamableHTTPClientTransport;
 const c=new C({name:legacy?'official-v1-fixture':'official-v2-fixture',version:'1.0.0'});await c.connect(new T(resource,{requestInit:{headers:{Authorization:'Bearer '+token}},fetch:safeFetch}));return c}
async function rejected(token,status){const r=await raw('POST',{Authorization:'Bearer '+token},{jsonrpc:'2.0',id:1,method:'tools/list',params:{}});assert.equal(r.status,status);await assert.rejects(()=>connect(token))}
async function raw(method='GET',headers={},body){return fetch(resource,{method,headers:{...(body?{'Content-Type':'application/json',Accept:'application/json, text/event-stream'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})})}
async function call(c,args={channelId,taskId}){return c.callTool({name:'read_task',arguments:args})}
(async()=>{try{
 const tenant=await db.tenant.create({data:{name:'Isolated MCP fixtures'}});for(const storeId of ['mcp-store','mcp-other'])await db.store.create({data:{id:storeId,name:storeId,tenantId:tenant.id}});
 for(const [id,role]of [['owner','admin'],['delegate','staff']])await db.user.create({data:{id,phone:'0899000'+id,password:'not-a-login-password',role,storeId:'mcp-store',staff:{create:{id:'staff-'+id,storeId:'mcp-store',name:id,employeeNumber:'MCP-'+id}}}});
 const control=externalAccess(postgresExternalRepository(db));registration=await control.save({id:'owner',storeId:'mcp-store'},{expectedVersion:0,name:'Synthetic MCP fixture',clientType:'mcp_compatible',storeIds:['mcp-store'],channelIds:[channelId],tools:['tasks.read'],approvalRequired:true});
 baseState=JSON.parse((await db.config.findUnique({where:{storeId_key:{storeId:'mcp-store',key:'externalAgent.access.v1'}}})).value);
 binding={registrationId:registration.id,userId:'delegate',staffId:'staff-delegate',version:1,authVersion:registration.authVersion,clientRevision:registration.clientRevision,taskIds:[taskId,oldTaskId],revoked:false,revokedTokenHashes:[],environment:'isolated-test'};await config(bindingKey(who),binding);
 const channel={id:channelId,title:'PRIVATE_CHANNEL_TITLE',kind:'group',ownerId:'staff-owner',members:[{staffId:'staff-owner',fromSeq:1},{staffId:'staff-delegate',fromSeq:10}],lastSeq:20,version:1,archived:false,round:null,createdAt:new Date().toISOString()};await config('team.communication.channel.'+channelId,channel);
 const task={id:taskId,channelId,roundId:randomUUID(),minuteVersion:1,actionIndex:0,text:'ONLY_ALLOWED_TASK_TEXT',ownerId:'staff-owner',dueDate:'2026-11-01',sourceSeq:[10],fromSeq:10,status:'assigned',version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),events:[{note:'SECRET_EVIDENCE_NOT_RETURNED'}],privateField:'SECRET_PRIVATE_FIELD'};
 for(const [id,fromSeq]of [[taskId,10],[oldTaskId,1],[otherTaskId,10]])await config('team.communication.task.'+channelId+'.'+id,{...task,id,fromSeq});
 const before=await db.config.findMany({where:{key:{startsWith:'team.communication.'}},orderBy:{key:'asc'},select:{storeId:true,key:true,value:true}});
 server=http.createServer((req,res)=>nodeHandler?void nodeHandler(req,res):(res.writeHead(503),res.end()));await new Promise(r=>server.listen(0,'127.0.0.1',r));resource=new URL('http://127.0.0.1:'+server.address().port+'/mcp');
 const verifier=jwtAccessVerifier({issuer,resource,publicKey:keys.publicKey}),issuerMetadata={issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',response_types_supported:['code'],code_challenge_methods_supported:['S256']};
 const options={resource,verifier,issuerMetadata,securityAudit:async e=>security.push(e)};
 await check('production-disabled handler refuses even a valid test token, without database activation',async()=>{const disabled=externalMcpHandler(options);assert.equal((await disabled.fetch(new Request(resource,{headers:{Authorization:'Bearer '+sign()}}))).status,503);await disabled.close()});
 handler=externalMcpHandler({...options,mode:'isolated-test'});nodeHandler=toNodeHandler(handler,{maxRequestBodySize:16384});
 await check('unauthenticated HTTP returns standard 401 challenge and discoverable resource metadata',async()=>{const r=await raw();assert.equal(r.status,401);const challenge=r.headers.get('www-authenticate');assert(challenge.includes('resource_metadata='));const metadataUrl=new URL(challenge.match(/resource_metadata="([^"]+)"/)[1]);assert.equal(metadataUrl.origin,resource.origin);const m=await (await fetch(metadataUrl)).json();assert.equal(m.resource,resource.href);assert.deepEqual(m.scopes_supported,['tasks.read']);assert.deepEqual(m.authorization_servers,[issuer])});
 await check('official v2 client connects, lists exactly one read-only tool and calls over real HTTP',async()=>{modernClient=await connect(sign());const list=await modernClient.listTools();assert.deepEqual(list.tools.map(t=>t.name),['read_task']);assert.equal(list.tools[0].annotations.readOnlyHint,true);const r=await call(modernClient);assert(!r.isError);assert.deepEqual(r.structuredContent.task,{id:taskId,version:1,status:'assigned',text:'ONLY_ALLOWED_TASK_TEXT',dueDate:'2026-11-01'});assert(wire.includes('tools/list'));assert(wire.includes('tools/call'))});
 await check('official maintained v1 client completes initialize then listTools and callTool via SDK legacy compatibility',async()=>{legacyClient=await connect(sign(),true);assert(wire.includes('initialize'));assert.deepEqual((await legacyClient.listTools()).tools.map(t=>t.name),['read_task']);assert(!(await call(legacyClient)).isError)});
 await check('token signature, issuer, audience, expiry, token type and missing expiry fail before tools',async()=>{
  for(const [overrides,opts]of [[{iss:'https://wrong.invalid'},{}],[{aud:'https://wrong.invalid/mcp'},{}],[{exp:Math.floor(Date.now()/1000)-1},{}],[{}, {privateKey:otherKeys.privateKey}],[{}, {typ:'JWT'}],[{exp:undefined},{}]])await rejected(sign(overrides,opts),401);
 });
 await check('insufficient token scope gives 403, unregistered subject/client and duplicate store binding are refused',async()=>{
  await rejected(sign({scope:'messages.read'}),403);await rejected(sign({sub:'not-enrolled'}),403);await rejected(sign({client_id:'other-client'}),403);
  await config(bindingKey(who),binding,'mcp-other');await rejected(sign(),403);await db.config.delete({where:{storeId_key:{storeId:'mcp-other',key:bindingKey(who)}}});
 });
 await check('ungranted task/channel, arbitrary store argument and old fromSeq are denied without data',async()=>{for(const args of [{channelId,taskId:otherTaskId},{channelId:otherChannel,taskId},{channelId,taskId,storeId:'mcp-other'},{channelId,taskId:oldTaskId},{channelId,taskId:'invalid-uuid'}]){const r=await call(modernClient,args).catch(e=>({transportDenied:true,message:e.message}));assert(r.isError||r.transportDenied);assert(!JSON.stringify(r).includes('ONLY_ALLOWED_TASK_TEXT'))}});
 await check('every call re-checks current channel membership and active delegated staff',async()=>{
  await config('team.communication.channel.'+channelId,{...channel,members:channel.members.filter(m=>m.staffId!=='staff-delegate')});assert((await call(modernClient)).isError);await config('team.communication.channel.'+channelId,channel);
  await config('team.communication.channel.'+channelId,{...channel,members:channel.members.map(m=>m.staffId==='staff-delegate'?{...m,fromSeq:11}:m)});assert((await call(modernClient)).isError);await config('team.communication.channel.'+channelId,channel);
  await db.staff.update({where:{id:'staff-delegate'},data:{status:'inactive'}});await assert.rejects(()=>call(modernClient));await db.staff.update({where:{id:'staff-delegate'},data:{status:'active'}});
 });
 await check('expiry is checked again after official client initialization; unknown tools cannot execute',async()=>{
  const expires=Math.floor(Date.now()/1000)+2,short=await connect(sign({exp:expires}));assert(!(await call(short)).isError);await new Promise(r=>setTimeout(r,2300));await assert.rejects(()=>call(short));await short.close();
  const result=await modernClient.callTool({name:'sql',arguments:{}}).catch(e=>({rejected:true}));assert(result.isError||result.rejected);
 });
 await check('token and whole binding revocation apply after initialization without session bypass',async()=>{
  await config(bindingKey(who),{...binding,revokedTokenHashes:[tokenHash(who.tokenId)]});await assert.rejects(()=>call(modernClient));const other=await connect(sign({jti:'other-test-token'}));assert(!(await call(other)).isError);await other.close();
  await config(bindingKey(who),{...binding,revoked:true});await assert.rejects(()=>legacyClient.listTools());await restore();
 });
 await check('saved registration changes and revocation fence existing clients',async()=>{
  await control.save({id:'owner',storeId:'mcp-store'},{expectedVersion:1,name:'Replacement client',clientType:'mcp_compatible',storeIds:['mcp-store'],channelIds:[channelId],tools:['tasks.read'],approvalRequired:true},registration.id);await assert.rejects(()=>call(modernClient));await restore();
  await control.revoke({id:'owner',storeId:'mcp-store'},registration.id,1);await assert.rejects(()=>call(modernClient));await restore();
 });
 await check('Origin, Host, unsupported methods and oversized bodies are bounded by SDK adapters',async()=>{
  assert.equal((await raw('POST',{Authorization:'Bearer '+sign(),Origin:'https://evil.invalid'},{jsonrpc:'2.0',id:1,method:'tools/list'})).status,403);
  const hostStatus=await new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:resource.port,path:'/mcp',method:'GET',headers:{Host:'evil.invalid',Authorization:'Bearer '+sign()}},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject);req.end()});assert.equal(hostStatus,403);
  assert.equal((await raw('DELETE',{Authorization:'Bearer '+sign()})).status,405);
  assert.equal((await raw('POST',{Authorization:'Bearer '+sign()},{padding:'x'.repeat(17000)})).status,413);
 });
 await check('task response is minimized; business facts unchanged; durable audit identifies delegated actor without secrets',async()=>{
  const result=await call(modernClient);const serialized=JSON.stringify(result);for(const secret of ['PRIVATE_CHANNEL_TITLE','SECRET_EVIDENCE','SECRET_PRIVATE_FIELD','staff-owner','sourceSeq','events'])assert(!serialized.includes(secret));
  const after=await db.config.findMany({where:{key:{startsWith:'team.communication.'}},orderBy:{key:'asc'},select:{storeId:true,key:true,value:true}});assert.deepEqual(after,before);
  const audit=await db.config.findMany({where:{key:{startsWith:'externalAgent.mcp.audit.v1.'}}});assert(audit.length>0);const rows=audit.map(r=>JSON.parse(r.value));assert(rows.some(r=>r.action==='task.read'&&r.result==='denied'));assert(rows.some(r=>r.action==='task.read'&&r.result==='allowed'&&r.userId==='delegate'&&r.staffId==='staff-delegate'&&r.subjectHash===tokenHash(who.subject)));
  const auditText=JSON.stringify(rows);for(const secret of [sign(),who.tokenId,who.subject,who.clientId,'ONLY_ALLOWED_TASK_TEXT','SECRET_EVIDENCE'])assert(!auditText.includes(secret));assert(security.some(e=>e.status===401));assert(security.some(e=>e.status===403));
 });
 fs.writeFileSync(out+'/results.json',JSON.stringify({passed:results,wireMethods:[...new Set(wire)],actualHttp:true,actualPostgres:true,officialClients:['@modelcontextprotocol/client@2.3.1','@modelcontextprotocol/sdk@1.32.1'],productionEnabled:false,externalRequests:0},null,2)+'\n');
}finally{await modernClient?.close();await legacyClient?.close();await handler?.close();if(server)await new Promise(r=>server.close(r));await db.$disconnect()}})().catch(e=>{console.error(e.message);process.exitCode=1});
