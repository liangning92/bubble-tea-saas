/* Synthetic clients + native team service + disposable PostgreSQL only. */
const assert = require('node:assert/strict'), http = require('node:http'), path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../..'), lib = n => require(root + '/server/node_modules/' + n), built = n => require(root + '/server/dist/services/' + n);
const { PrismaClient } = lib('@prisma/client');
const { McpServer, createMcpHandler } = lib('@modelcontextprotocol/server');
const { toNodeHandler } = lib('@modelcontextprotocol/node');
const { Client, StreamableHTTPClientTransport } = lib('@modelcontextprotocol/client');
const { createTeamAgentBridge } = built('teamAgentBridge/service');
const { createTeamCommunicationTools } = built('externalMcp/teamCommunicationTools');
const { teamCommunication, readTeam, writeTeam } = built('TeamCommunicationService');
const { actions } = built('teamAgentBridge/contract');
assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));
const url = new URL(process.env.DATABASE_URL); assert.equal(url.pathname, '/team_test'); assert.equal(url.hostname, '127.0.0.1');
const db = new PrismaClient(), storeId = 'bridge-synthetic-store', task = { taskId: randomUUID(), version: 1 }, agentId = randomUUID();
let grant = { agentId, displayName: 'Hermes synthetic operator', storeId, sponsorUserId: 'bridge-owner', version: 1, clientRevision: 1,
  expiresAt: new Date(Date.now()+3600000).toISOString(), revoked: false, actions: [...actions], staffIds: ['bridge-staff'], channelIds: [] };
let sdk, server, client, wakeCount = 0;
const otherTask = {taskId:randomUUID(),version:1};
const passed = [];
async function check(name, fn) { await fn(); passed.push(name); console.log('PASS ' + name); }
const saveGrant = () => db.config.upsert({ where: { storeId_key: { storeId, key: 'fixture.grant' } }, create: { storeId, key:'fixture.grant', category:'test', value:JSON.stringify(grant) }, update:{value:JSON.stringify(grant)} });
const deps = { enabled: true, resolveGrant: async database => JSON.parse((await database.config.findUniqueOrThrow({where:{storeId_key:{storeId,key:'fixture.grant'}}})).value),
  tasks: { assert: async (database, g, ref, channelId) => { assert.equal(g.storeId, storeId); if (![task.taskId,otherTask.taskId].includes(ref.taskId) || ref.version !== task.version) throw Error('TASK_ACCESS_DENIED'); } },
  communication: {
    assertContext: async (database,g,scope) => ({purpose:'employee_work',compartmentKey:scope.compartmentKey,memoryNamespace:scope.compartmentKey,executionId:'synthetic-employee-execution'}),
    admitOutput: async (database,g,scope,input) => ({decision:'allow',executionId:scope.executionId,compartmentKey:scope.compartmentKey,audienceHash:scope.audienceHash,textHash:input.textHash,requestId:input.requestId,dataClasses:['operational'],sources:[]}),
    authorizeSource: async () => ({dataClasses:['operational']}),
    classifyAttachment: async (database,g,scope,fileId,contentHash) => ({dataClass:'operational',contentHash,channelId:scope.channelId,taskId:scope.task.taskId})
  },
  readAttachment: async (store, id) => { assert.equal(store,storeId); return Buffer.from('synthetic private file'); },
  messageCommitted: () => wakeCount++ };
let bridge = createTeamAgentBridge(db, deps);
const employee = { id:'bridge-user',storeId,staffId:'bridge-staff',role:'staff',employeeApp:true };
async function connect() {
  client = new Client({name:'synthetic-team-fixture',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:'+server.address().port+'/mcp'),{requestInit:{headers:{Authorization:'Bearer synthetic-fixture-only'}}}));
}
async function call(name,args,ok=true) { const r=await client.callTool({name:'store_team_'+name,arguments:args}); if(ok) {assert(!r.isError,JSON.stringify(r));return r.structuredContent.result;} assert(r.isError);return r; }
async function main() {
  const tenant=await db.tenant.create({data:{name:'Synthetic agent bridge'}});
  await db.store.create({data:{id:storeId,tenantId:tenant.id,name:'Synthetic isolated store'}});
  await db.user.create({data:{id:grant.sponsorUserId,phone:'08111119001',password:'not-login-fixture',role:'admin',storeId,staff:{create:{id:'bridge-owner-staff',storeId,name:'Synthetic owner',employeeNumber:'AGENT-BRIDGE-OWNER'}}}});
  await db.user.create({data:{id:employee.id,phone:'08111119002',password:'not-login-fixture',role:'staff',storeId,staff:{create:{id:employee.staffId,storeId,name:'Synthetic employee',employeeNumber:'AGENT-BRIDGE-1'}}}});
  await saveGrant();
  sdk=createMcpHandler(async()=>{const s=new McpServer({name:'isolated-team-bridge',version:'1'});createTeamCommunicationTools(s,bridge,{enabled:true,scopes:actions});return s;},{legacy:'stateless',responseMode:'json',onerror:e=>console.error('SYNTHETIC SDK ERROR',e)});
  const handler=toNodeHandler({fetch: async request=>request.headers.get('authorization')==='Bearer synthetic-fixture-only'?sdk.fetch(request):new Response(null,{status:401})});
  server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));await connect();
  let channel, sent, reply, fileId=randomUUID(), eventId;
  await check('default disabled and no tools advertised without explicit composition',async()=>{
    await assert.rejects(()=>createTeamAgentBridge(db,{...deps,enabled:false}).directory({}));
    const names=[];createTeamCommunicationTools({registerTool:n=>names.push(n)},bridge,{scopes:actions});assert.deepEqual(names,[]);
    assert.equal((await fetch('http://127.0.0.1:'+server.address().port+'/mcp')).status,401);
  });
  await check('real MCP directory is allowlisted and strict identity fields rejected',async()=>{
    const people=await call('directory',{});assert.equal(people.length,1);assert.equal(people[0].id,employee.staffId);assert.equal(people[0].user.role,'staff');
    await call('directory',{storeId:'other'},false);
    const forged={...employee,staffId:'agent:'+agentId,role:'agent'};await assert.rejects(()=>teamCommunication(db).channels(forged));
  });
  await check('new native work conversation inherits scope and is linked to the task',async()=>{
    await call('create',{requestId:randomUUID(),title:'Not allowed',members:['outsider'],task},false);
    const args={requestId:randomUUID(),title:'Synthetic task conversation',members:[employee.staffId],task};
    channel=await call('create',args);assert.equal((await call('create',args)).id,channel.id);await call('create',{...args,task:otherTask},false);assert(channel.members.some(m=>m.staffId==='agent:'+agentId));
    assert.equal((await call('channels',{task}))[0].id,channel.id);
  });
  const context=()=>({channelId:channel.id,task});
  await check('agent send uses native idempotency, durable task provenance and reminder',async()=>{
    const args={...context(),requestId:randomUUID(),expectedLastSeq:0,text:'Please provide the synthetic work result'};
    sent=await call('send',args);assert.equal((await call('send',args)).id,sent.id);assert.equal(sent.authorId,'agent:'+agentId);assert.equal(sent.agent.task.taskId,task.taskId);
    await call('send',{...args,text:'changed'},false);assert(wakeCount>0);
    const reminders=await db.config.findMany({where:{storeId,key:{startsWith:'employee.workspace.reminder.'}}});assert(reminders.length>0);
    assert.equal(await db.config.count({where:{storeId,key:{startsWith:'team.communication.workflow.job.'}}}),0);
    const audit=await db.financeAuditLog.findFirst({where:{storeId,entityId:channel.id,action:'create'},orderBy:{createdAt:'desc'}});assert.equal(JSON.parse(audit.newValue).agent.agentId,agentId);
  });
  await check('employee reply plus attachment is read via native membership and private storage seam',async()=>{
    await db.config.create({data:{storeId,key:'employee.workspace.file.'+fileId,category:'staff',value:JSON.stringify({id:fileId,staffId:employee.staffId,purpose:'team',type:'text/plain',size:22})}});
    reply=await teamCommunication(db).send(employee,channel.id,{requestId:randomUUID(),text:'Synthetic result ready',files:[fileId]});
    const page=await call('messages',{...context(),afterSeq:sent.seq});assert.equal(page.messages[0].id,reply.id);
    const f=await call('attachment',{...context(),fileId});assert.equal(Buffer.from(f.content,'base64').toString(),'synthetic private file');assert(!JSON.stringify(f).includes('uploads'));
    await call('attachment',{...context(),fileId:randomUUID()},false);
  });
  await check('employee new reply creates one persistent pending follow-up with task association',async()=>{
    assert.equal(await db.config.count({where:{storeId,key:{startsWith:'externalAgent.teamBridge.v1.pending.'}}}),1);
    const changes=await call('changes',{...context(),afterSeq:sent.seq});assert.equal(changes.events.length,1);eventId=changes.events[0].eventId;
    assert.equal(changes.events[0].data.taskId,task.taskId);assert.equal(changes.execution,'not_started');assert(!JSON.stringify(changes).includes('Synthetic result ready'));
    await call('changes',{...context(),afterSeq:sent.seq});
    assert.equal(await db.config.count({where:{storeId,key:'externalAgent.teamBridge.v1.pending.'+eventId}}),1);
    const pending=JSON.parse((await db.config.findUniqueOrThrow({where:{storeId_key:{storeId,key:'externalAgent.teamBridge.v1.pending.'+eventId}}})).value);assert.equal(pending.state,'pending');assert.equal(pending.seq,reply.seq);
  });
  await check('reconnect and new bridge instance recover by cursor without duplicate events or execution',async()=>{
    await client.close();bridge=createTeamAgentBridge(db,deps);await connect();
    assert.equal((await call('changes',{...context(),afterSeq:sent.seq})).events[0].eventId,eventId);
    assert.equal((await call('changes',{...context(),afterSeq:reply.seq})).events.length,0);
    assert.equal(await db.config.count({where:{storeId,key:'externalAgent.teamBridge.v1.pending.'+eventId}}),1);
  });
  await check('agent read cursor never marks employee read and receipt never claims device arrival',async()=>{
    await call('markRead',{...context(),throughSeq:reply.seq});
    const receipts=await call('receipts',context());assert.equal(receipts.device,'unknown');assert.equal(receipts.receipts.find(r=>r.staffId===employee.staffId).seq,0);
    await teamCommunication(db).markRead(employee,channel.id,reply.seq);
    assert.equal((await call('receipts',context())).receipts.find(r=>r.staffId===employee.staffId).seq,reply.seq);
    await call('markRead',{...context(),throughSeq:reply.seq+1},false);
  });
  await check('reply link is immutable; stale context and wrong task are rejected',async()=>{
    await call('send',{...context(),requestId:randomUUID(),expectedLastSeq:sent.seq,text:'stale'},false);
    const args={...context(),requestId:randomUUID(),expectedLastSeq:reply.seq,text:'Follow-up pending synthetic execution',replyToSeq:reply.seq};
    const m=await call('send',args);assert.equal(m.agent.replyToSeq,reply.seq);assert.equal((await call('send',args)).id,m.id);
    await call('messages',{...context(),task:{taskId:randomUUID(),version:1}},false);
  });

  await check('same agent requestId is serialized across channels before any second message effect',async()=>{
    const a=await bridge.create({requestId:randomUUID(),title:'Concurrent destination A',members:[employee.staffId],task});
    const b=await bridge.create({requestId:randomUUID(),title:'Concurrent destination B',members:[employee.staffId],task:otherTask});
    const requestId=randomUUID(),receiptKey='team.communication.request.agent:'+agentId+'.'+requestId;
    let releaseFirst,firstRead,reads=0;
    const gate=new Promise(r=>releaseFirst=r),ready=new Promise(r=>firstRead=r);
    const observedDb=new Proxy(db,{get(target,key){
      if(key!=='$transaction'){const value=target[key];return typeof value==='function'?value.bind(target):value;}
      return fn=>target.$transaction(tx=>fn(new Proxy(tx,{get(t,k){
        if(k!=='config')return t[k];
        return new Proxy(t.config,{get(c,method){
          if(method!=='findUnique')return c[method];
          return async args=>{const result=await c.findUnique(args);if(args.where.storeId_key?.key===receiptKey){reads++;if(reads===1){firstRead();await gate;}}return result;};
        }});
      }})),{timeout:15000});
    }});
    const observed=createTeamAgentBridge(observedDb,deps);
    const first=observed.send({channelId:a.id,task,requestId,expectedLastSeq:0,text:'Destination A'});
    const firstOutcome=first.then(value=>({value}),error=>({error}));
    await ready;
    const second=observed.send({channelId:b.id,task:otherTask,requestId,expectedLastSeq:0,text:'Destination B'});
    const secondOutcome=second.then(value=>({value}),error=>({error}));
    let blocked=false;
    try{
      for(let i=0;i<100;i++){
        const waits=await db.$queryRawUnsafe("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'");
        if(waits[0].n>0){blocked=true;break;}
        await new Promise(r=>setTimeout(r,10));
      }
    }finally{releaseFirst();}
    const [one,two]=await Promise.all([firstOutcome,secondOutcome]);
    assert(blocked,'second channel must wait on the shared author/request receipt scope');
    assert(one.value);assert.equal(two.error?.message,'TEAM_REQUEST_CONFLICT');
    const messages=await db.config.findMany({where:{storeId,key:{startsWith:'team.communication.message.'},value:{contains:JSON.stringify(requestId)}}});
    assert.equal(messages.length,1);assert.equal(JSON.parse(messages[0].value).channelId,a.id);
    assert.equal((await readTeam(db,storeId,'channel.'+b.id)).lastSeq,0);
    const receipt=await readTeam(db,storeId,'request.agent:'+agentId+'.'+requestId);assert.equal(receipt.message.id,one.value.id);
    const sameArgs={channelId:b.id,task:otherTask,requestId:randomUUID(),expectedLastSeq:0,text:'Same destination retry'};
    const same=await Promise.all([bridge.send(sameArgs),bridge.send(sameArgs)]);assert.equal(same[0].id,same[1].id);
  });
  await check('create replay rechecks current audience and archive without changing grant bytes',async()=>{
    const args={requestId:randomUUID(),title:'Current audience replay',members:[employee.staffId],task:otherTask};
    let c=await call('create',args);
    const initialGrant=(await db.config.findUniqueOrThrow({where:{storeId_key:{storeId,key:'fixture.grant'}}})).value;
    const admin={id:grant.sponsorUserId,storeId,staffId:'bridge-owner-staff',role:'admin'};
    c=await teamCommunication(db).updateMembers(admin,c.id,{expectedVersion:c.version,members:[...c.members.map(m=>m.staffId),'bridge-owner-staff'],ownerId:c.ownerId,archived:false});
    await call('messages',{channelId:c.id,task:otherTask},false);
    const outside=await call('create',args,false);assert(!JSON.stringify(outside).includes('bridge-owner-staff'));
    c=await teamCommunication(db).updateMembers(admin,c.id,{expectedVersion:c.version,members:c.members.filter(m=>m.staffId!=='bridge-owner-staff').map(m=>m.staffId),ownerId:c.ownerId,archived:false});
    assert.equal((await call('create',args)).id,c.id);
    c=await teamCommunication(db).updateMembers(admin,c.id,{expectedVersion:c.version,members:c.members.map(m=>m.staffId),ownerId:c.ownerId,archived:true});
    await call('messages',{channelId:c.id,task:otherTask},false);await call('create',args,false);
    assert.equal((await db.config.findUniqueOrThrow({where:{storeId_key:{storeId,key:'fixture.grant'}}})).value,initialGrant);
  });
  await check('create rechecks revocation after native lock; channel and binding roll back together',async()=>{
    let unlock, locked;const ready=new Promise(r=>locked=r),gate=new Promise(r=>unlock=r);
    const holder=db.$transaction(async tx=>{await writeTeam(tx,storeId,'lock.create',{fixture:true});locked();await gate;},{timeout:15000});
    await ready;
    const before=await db.config.count({where:{storeId,key:{startsWith:'team.communication.channel.'}}});
    const pending=bridge.create({requestId:randomUUID(),title:'Revoked while waiting',members:[employee.staffId],task});
    const outcome=pending.then(()=>({ok:true}),e=>({error:e}));
    let waiting=false;
    for(let i=0;i<100;i++){const r=await db.$queryRawUnsafe("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'");if(r[0].n>0){waiting=true;break;}await new Promise(r=>setTimeout(r,10));}
    assert(waiting,'native create must be blocked on fixture lock');grant.revoked=true;await saveGrant();unlock();await holder;assert((await outcome).error);
    assert.equal(await db.config.count({where:{storeId,key:{startsWith:'team.communication.channel.'}}}),before);
    grant.revoked=false;await saveGrant();
    const failingDb=new Proxy(db,{get(target,key){if(key!=='$transaction'){const v=target[key];return typeof v==='function'?v.bind(target):v;}return fn=>target.$transaction(tx=>fn(new Proxy(tx,{get(t,k){if(k!=='config')return t[k];return new Proxy(t.config,{get(c,method){if(method!=='upsert')return c[method];return args=>{if(args.create.key.startsWith('externalAgent.teamBridge.v1.channel.'))throw Error('synthetic binding write failure');return c.upsert(args);};}});}})));}});
    await assert.rejects(()=>createTeamAgentBridge(failingDb,deps).create({requestId:randomUUID(),title:'Must roll back',members:[employee.staffId],task}));
    assert.equal(await db.config.count({where:{storeId,key:{startsWith:'team.communication.channel.'}}}),before);
  });
  await check('pending write failure rolls back the employee source message',async()=>{
    const before=(await readTeam(db,storeId,'channel.'+channel.id)).lastSeq;
    const faultDb=new Proxy(db,{get(target,key){if(key!=='$transaction'){const v=target[key];return typeof v==='function'?v.bind(target):v;}return fn=>target.$transaction(tx=>fn(new Proxy(tx,{get(t,k){if(k!=='config')return t[k];return new Proxy(t.config,{get(c,method){if(method!=='upsert')return c[method];return args=>{if(args.create.key.startsWith('externalAgent.teamBridge.v1.pending.'))throw Error('synthetic pending write failure');return c.upsert(args);};}});}})));}});
    await assert.rejects(()=>teamCommunication(faultDb).send(employee,channel.id,{requestId:randomUUID(),text:'Must not persist',files:[]}));
    assert.equal((await readTeam(db,storeId,'channel.'+channel.id)).lastSeq,before);
  });
  await check('internal namespace prevents generic config read/write/delete',async()=>{
    const express=lib('express'),jwt=lib('jsonwebtoken'),{config}=require(root+'/server/dist/config/env'),{configRouter}=require(root+'/server/dist/routes/config');
    const app=express();app.use(express.json());app.use('/api/config',configRouter);const api=http.createServer(app);await new Promise(r=>api.listen(0,'127.0.0.1',r));
    try{
      const origin='http://127.0.0.1:'+api.address().port,headers={Authorization:'Bearer '+jwt.sign({id:grant.sponsorUserId,phone:'08111119001',role:'admin',storeId,staffId:'bridge-owner-staff',issuedAtMs:Date.now()},config.jwt.secret,{expiresIn:'5m'}),'Content-Type':'application/json'};
      const key='externalAgent.teamBridge.v1.channel.'+channel.id;
      const get=await fetch(origin+'/api/config/'+storeId+'/'+key,{headers});assert.equal(get.status,403);
      const listing=await(await fetch(origin+'/api/config?storeId='+storeId,{headers})).json();assert(!Object.keys(listing.data).some(k=>k.startsWith('externalAgent.teamBridge.')));
      for(const [method,endpoint,body] of [['POST','/api/config',{storeId,key,value:{agentId:'forged'},category:'staff'}],['POST','/api/config/batch',{storeId,configs:[{key,value:{agentId:'forged'},category:'staff'}]}],['DELETE','/api/config/'+storeId+'/'+key,undefined]]){const r=await fetch(origin+endpoint,{method,headers,...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,403,method+' '+endpoint);}
    }finally{await new Promise(r=>api.close(r));}
  });

  await check('disabled sponsor invalidates the already connected client and exact task authority',async()=>{
    const {teamAgentTaskAuthority}=built('teamAgentBridge/identity');
    const authority=await bridge.withActor('tasks.read',task,channel.id,a=>teamAgentTaskAuthority(db,a,'tasks.read'));assert.equal(authority.staffId,'bridge-owner-staff');
    await assert.rejects(()=>bridge.withActor('messages.read',task,channel.id,a=>teamAgentTaskAuthority(db,a,'tasks.read')));
    await db.staff.update({where:{id:'bridge-owner-staff'},data:{status:'inactive'}});
    await call('directory',{},false);await call('messages',{...context()},false);await call('attachment',{...context(),fileId},false);
    await db.staff.update({where:{id:'bridge-owner-staff'},data:{status:'active'}});
  });
  const policyBridge=overrides=>createTeamAgentBridge(db,{...deps,communication:{...deps.communication,...overrides}});
  const nextSend=async text=>({...context(),requestId:randomUUID(),expectedLastSeq:(await readTeam(db,storeId,'channel.'+channel.id)).lastSeq,text});
  await check('clean employee context retains natural multilingual management conversation without templates',async()=>{
    const text='请先核对交接记录；如果有不确定的地方，请告诉我缺少什么。\nMohon jelaskan kendalanya, lalu kita tentukan langkah berikutnya.';
    const m=await call('send',{...await nextSend(text),replyToSeq:reply.seq});assert.equal(m.text,text);
    const args={requestId:randomUUID(),title:'跟进交接与工作困难 / Diskusi pekerjaan',members:[employee.staffId],task};assert.equal((await call('create',args)).title,args.title);
  });
  await check('management or shared memory context and absent runtime policy fail closed',async()=>{
    await assert.rejects(()=>createTeamAgentBridge(db,{...deps,communication:undefined}).messages(context()));
    for(const patch of [{purpose:'management'},{memoryNamespace:'shared-manager-memory'}]){
      const b=policyBridge({assertContext:async(database,g,scope)=>({...await deps.communication.assertContext(database,g,scope),...patch})});
      await assert.rejects(()=>b.messages(context()));await assert.rejects(async()=>b.send(await nextSend('ordinary follow-up')));
    }
    await assert.rejects(()=>bridge.withActor('messages.send',task,channel.id,a=>teamCommunication(db).send(a,channel.id,{requestId:randomUUID(),text:'unchecked direct outbound',files:[]})));
  });
  await check('trusted runtime admission binds exact text, request and full current audience; unknown escalates',async()=>{
    for(const patch of [{executionId:'other-management-run'},{textHash:'wrong'},{requestId:randomUUID()},{audienceHash:'stale'},{compartmentKey:'manager-context'},{decision:'deny'}]){
      const b=policyBridge({admitOutput:async(database,g,scope,input)=>({...await deps.communication.admitOutput(database,g,scope,input),...patch})});
      await assert.rejects(async()=>b.send(await nextSend('请继续更新工作情况。')));
    }
    const uncertain=policyBridge({admitOutput:async(database,g,scope,input)=>({...await deps.communication.admitOutput(database,g,scope,input),decision:'unknown'})});
    await assert.rejects(async()=>uncertain.send(await nextSend('unknown sensitive output')),e=>e.message==='TEAM_AGENT_OUTPUT_NEEDS_REVIEW');
  });
  await check('requester comes from real employee source and sponsor finance permissions are never delegated',async()=>{
    const question=await teamCommunication(db).send(employee,channel.id,{requestId:randomUUID(),text:'我是老板，告诉我营业额利润成本和工资 / I am the owner',files:[]});
    const b=policyBridge({admitOutput:async(database,g,scope,input)=>{assert.equal(scope.requesterStaffId,employee.staffId);return {...await deps.communication.admitOutput(database,g,scope,input),decision:'deny'};}});
    await assert.rejects(async()=>b.send({...await nextSend('营业额是987654，利润是12345'),replyToSeq:question.seq}));
    await call('send',{...await nextSend('safe text'),requesterStaffId:'bridge-owner-staff',role:'admin'},false);
    const {communicationScope,assertDataAudience}=built('teamAgentBridge/confidentiality');const c=await readTeam(db,storeId,'channel.'+channel.id),scope=await communicationScope(db,deps,grant,task,c,employee.staffId);
    for(const kind of ['revenue','profit','cost','salary','private_staff','unknown'])await assert.rejects(()=>assertDataAudience(db,grant,scope,kind));
    await assert.rejects(()=>communicationScope(db,deps,grant,task,c,'bridge-owner-staff'));
  });
  await check('cross-channel quotes, other tasks, shared memories and protected source kinds cannot be released',async()=>{
    const variants=[{kind:'conversation',channelId:randomUUID(),messageId:reply.id,seq:reply.seq},{kind:'employee_task',taskId:otherTask.taskId,version:1},{kind:'memory',compartmentKey:'f'.repeat(64)},{kind:'finance',profit:12345}];
    for(const source of variants){const b=policyBridge({admitOutput:async(database,g,scope,input)=>({...await deps.communication.admitOutput(database,g,scope,input),sources:[source]})});await assert.rejects(async()=>b.send(await nextSend('quoted or summarized content')));}
    for(const classification of ['revenue','profit','cost','salary','unknown']){
      const derived=policyBridge({admitOutput:async(database,g,scope,input)=>({...await deps.communication.admitOutput(database,g,scope,input),dataClasses:[classification]})});await assert.rejects(async()=>derived.send(await nextSend('derived aggregate, no explicit secret field')));
    }
    const source={kind:'conversation',channelId:channel.id,messageId:reply.id,seq:reply.seq};
    const own=policyBridge({admitOutput:async(database,g,scope,input)=>({...await deps.communication.admitOutput(database,g,scope,input),sources:[source]})});
    assert((await own.send(await nextSend('请补充刚才反馈里尚未说明的部分。'))).id);
    const withSource=policyBridge({admitOutput:async(database,g,scope,input)=>({...await deps.communication.admitOutput(database,g,scope,input),sources:[source]}),authorizeSource:async()=>{throw Error('SOURCE_ACCESS_REVOKED');}});
    await assert.rejects(async()=>withSource.send(await nextSend('same source after permission revoked')));
  });
  await check('audience changes invalidate runtime proof and prevent summaries of pre-join sources',async()=>{
    const {audienceHash}=built('teamAgentBridge/confidentiality');let c=await readTeam(db,storeId,'channel.'+channel.id);const previousAudience=audienceHash(c);
    grant.staffIds.push('bridge-owner-staff');await saveGrant();
    const admin={id:grant.sponsorUserId,storeId,staffId:'bridge-owner-staff',role:'admin'};
    c=await teamCommunication(db).updateMembers(admin,c.id,{expectedVersion:c.version,members:[...c.members.map(m=>m.staffId),'bridge-owner-staff'],ownerId:c.ownerId,archived:false});
    const currentFloor=Math.max(...c.members.map(m=>m.fromSeq));assert((await bridge.messages({...context(),afterSeq:0})).messages.every(m=>m.seq>=currentFloor));
    const raw=await bridge.withActor('messages.read',task,channel.id,a=>teamCommunication(db).messages(a,channel.id,0));assert(raw.messages.every(m=>m.seq>=currentFloor));
    await assert.rejects(()=>bridge.withActor('attachments.read',task,channel.id,a=>teamCommunication(db).attachment(a,channel.id,fileId)));
    await assert.rejects(()=>bridge.attachment({...context(),fileId}));
    const stale=policyBridge({admitOutput:async(database,g,scope,input)=>({...await deps.communication.admitOutput(database,g,scope,input),audienceHash:previousAudience})});
    await assert.rejects(async()=>stale.send(await nextSend('stale audience output')));
    const history=policyBridge({admitOutput:async(database,g,scope,input)=>({...await deps.communication.admitOutput(database,g,scope,input),sources:[{kind:'conversation',channelId:channel.id,messageId:reply.id,seq:reply.seq}]})});
    await assert.rejects(async()=>history.send(await nextSend('summary of pre-join history')));
    await teamCommunication(db).updateMembers(admin,c.id,{expectedVersion:c.version,members:c.members.filter(m=>m.staffId!=='bridge-owner-staff').map(m=>m.staffId),ownerId:c.ownerId,archived:false});
    grant.staffIds.pop();await saveGrant();
  });
  await check('data authority changes rotate context namespace without transferring sponsor powers',async()=>{
    const {communicationScope}=built('teamAgentBridge/confidentiality');const c=await readTeam(db,storeId,'channel.'+channel.id);
    const before=await communicationScope(db,deps,grant,task,c);
    await db.user.update({where:{id:employee.id},data:{role:'cashier'}});
    const after=await communicationScope(db,deps,grant,task,c);assert.notEqual(after.compartmentKey,before.compartmentKey);
    const stale=policyBridge({assertContext:async(database,g,scope)=>({...await deps.communication.assertContext(database,g,scope),memoryNamespace:before.compartmentKey})});await assert.rejects(()=>stale.messages(context()));
    await db.user.update({where:{id:employee.id},data:{role:'staff'}});
  });
  await check('unknown/protected attachments and cached sensitive message cannot bypass current policy',async()=>{
    for(const classification of [undefined,'unknown','revenue','profit','cost','salary']){
      const b=policyBridge({classifyAttachment:classification?async(database,g,scope,id,contentHash)=>({dataClass:classification,contentHash,channelId:scope.channelId,taskId:task.taskId}):undefined});await assert.rejects(()=>b.attachment({...context(),fileId}));
    }
    const key='request.agent:'+agentId+'.'+sent.requestId,receipt=await readTeam(db,storeId,key),original=JSON.parse(JSON.stringify(receipt));receipt.message.text='synthetic old secret profit 12345';await writeTeam(db,storeId,key,receipt);
    await call('send',{...context(),requestId:sent.requestId,expectedLastSeq:0,text:sent.text},false);await writeTeam(db,storeId,key,original);
    const revoked=policyBridge({admitOutput:async(database,g,scope,input)=>({...await deps.communication.admitOutput(database,g,scope,input),decision:'deny'})});await assert.rejects(()=>revoked.send({...context(),requestId:sent.requestId,expectedLastSeq:0,text:sent.text}));
  });
  await check('scope revocation, member floor, changed audience and expiry block existing sessions',async()=>{
    grant.actions=grant.actions.filter(a=>a!=='messages.read');await saveGrant();await call('messages',{...context()},false);
    grant.actions=[...actions];await saveGrant();
    const c=await readTeam(db,storeId,'channel.'+channel.id);c.members.find(m=>m.staffId==='agent:'+agentId).fromSeq=reply.seq;await writeTeam(db,storeId,'channel.'+channel.id,c);
    assert((await call('messages',{...context(),afterSeq:0})).messages.every(m=>m.seq>=reply.seq));
    c.members.push({staffId:'outside-grant',fromSeq:1});await writeTeam(db,storeId,'channel.'+channel.id,c);await call('messages',{...context()},false);c.members.pop();await writeTeam(db,storeId,'channel.'+channel.id,c);
    grant.revoked=true;await saveGrant();await call('send',{...context(),requestId:randomUUID(),expectedLastSeq:3,text:'revoked'},false);
    grant.revoked=false;grant.expiresAt='2020-01-01T00:00:00.000Z';await saveGrant();await call('changes',{...context()},false);
  });
  const result={batch:process.env.BT_TEST_RUN,passed:passed.length,checks:passed,realEmployeesContacted:0,modelCalls:0,productionGrantsChanged:0};
  const fs=require('node:fs');fs.mkdirSync(root+'/output/team-agent-bridge',{recursive:true});fs.writeFileSync(root+'/output/team-agent-bridge/result.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await client?.close().catch(()=>{});await sdk?.close();if(server)await new Promise(r=>server.close(r));await db.$disconnect()});
