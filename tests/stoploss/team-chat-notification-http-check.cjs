/* Disposable PostgreSQL and mocked Web Push only; never production or real device delivery. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),url=new URL(process.env.DATABASE_URL);
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/team_test');assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));assert(process.env.UPLOADS_PATH?.includes(process.env.BT_TEST_RUN));
const {prisma}=require(root+'/server/dist/config/database'),{teamCommunication,readTeam,writeTeam}=require(root+'/server/dist/services/TeamCommunicationService'),{workflowJobKey}=require(root+'/server/dist/services/TeamWorkflowQueue');
const localFetch=global.fetch;global.fetch=(input,init)=>{assert.equal(new URL(String(input)).hostname,'127.0.0.1');return localFetch(input,init)};
main().catch(e=>{console.error(e);process.exitCode=1});
async function main(){
 const express=require(root+'/server/node_modules/express'),jwt=require(root+'/server/node_modules/jsonwebtoken'),{config}=require(root+'/server/dist/config/env');
 const {authenticateBeforeRouting}=require(root+'/server/dist/middlewares/auth'),{declareAccessRoutes}=require(root+'/server/dist/middlewares/staffAccessV2');
 const {teamCommunicationRouter}=require(root+'/server/dist/routes/teamCommunication'),{employeeWorkspaceRouter}=require(root+'/server/dist/routes/employeeWorkspace');
 const app=express();app.use(express.json());for(const [base,router]of [['/api/team',teamCommunicationRouter],['/api/staff-work',employeeWorkspaceRouter]])app.use(base,authenticateBeforeRouting,declareAccessRoutes(base,router));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,results=[];let n=0,tenant;
 const request=async(person,method,target,data)=>{const token=jwt.sign({...person,issuedAtMs:Date.now()},config.jwt.secret,{expiresIn:'1h'});const r=await fetch(base+'/api'+(target.startsWith('/staff-work/')?'':'/team')+target,{method,headers:{Authorization:'Bearer '+token,...(person.role==='staff'?{'X-Client-App':'employee'}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});return{status:r.status,body:await r.json()}};
 const good=async(...args)=>{const r=await request(...args);assert.equal(r.status,200,JSON.stringify(r));return r.body.data};
 const test=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
 const messages=f=>teamCommunication(prisma).messages(f.owner,f.channel.id,0);
 async function fixture(){
  const i=++n,storeId='chat-notify-store-'+i;await prisma.store.create({data:{id:storeId,tenantId:tenant.id,name:'Synthetic chat '+i}});const people={};
  for(const[key,role]of [['owner','admin'],['employee','staff'],['other','staff']]){const id=`chat-user-${i}-${key}`,staffId=`chat-staff-${i}-${key}`;await prisma.user.create({data:{id,storeId,role,phone:`0866${String(i).padStart(5,'0')}${key==='owner'?0:key==='employee'?1:2}`,password:'synthetic-unused',staff:{create:{id:staffId,storeId,name:'Synthetic '+key,employeeNumber:'CH-'+i+'-'+key}}}});people[key]={id,storeId,staffId,role}}
  const channel=await teamCommunication(prisma).create(people.owner,{requestId:randomUUID(),title:'Synthetic private chat',kind:'direct',members:[people.employee.staffId]});
  await writeTeam(prisma,storeId,'ai.settings',{version:7,enabled:true,provider:'minimax',region:'cn',model:'MiniMax-M3.1-Flash',secret:'v2.cn.synthetic.synthetic.synthetic'});await writeTeam(prisma,storeId,'ai.connection',{requestId:randomUUID(),ownerStaffId:people.owner.staffId,configVersion:7,region:'cn',model:'MiniMax-M3.1-Flash',status:'ready',checkRevision:3,checkedAt:new Date().toISOString()});
  return{storeId,...people,channel};
 }
 const enable=f=>good(f.owner,'PUT',`/channels/${f.channel.id}/workflow/policy`,{expectedVersion:0,enabled:true,paused:false,automaticSend:false,consent:true,employeeIds:[f.employee.staffId],expectedAiConfigVersion:7,expectedAiCheckRevision:3});
 try{tenant=await prisma.tenant.create({data:{name:'Synthetic chat-notification tests'}});
  const {writeWork,readWork,listWork}=require(root+'/server/dist/services/EmployeeWorkspaceStore');
  const {deliver}=require(root+'/server/dist/services/EmployeeReminderService'),{chatReminderRelevant}=require(root+'/server/dist/services/TeamChatReminderService');
  const webpush=require(root+'/server/node_modules/web-push'),oldGenerator=webpush.generateVAPIDKeys;let generatedKeys=0;
  webpush.generateVAPIDKeys=()=>{generatedKeys++;throw Error('CREDENTIAL_CREATION_FORBIDDEN')};
  const preset=async(f,person=f.employee)=>{
   await writeWork(f.storeId,'push-keys',{publicKey:'synthetic-existing-public',privateKey:'synthetic-existing-private'});
   const id='synthetic-sub-'+person.staffId;await writeWork(f.storeId,'subscription.'+id,{id,staffId:person.staffId,userId:person.id,issuedAtMs:Date.now()+1000,active:true,subscription:{endpoint:'https://fcm.googleapis.com/send/'+id,keys:{p256dh:'synthetic',auth:'synthetic'}}});return id;
  };
  const pushMock=(status)=>{const sent=[];return {sent,sendNotification:async(_sub,payload,options)=>{sent.push(JSON.parse(payload));assert.equal(options.vapidDetails.publicKey,'synthetic-existing-public');if(status)throw {statusCode:status};return {statusCode:201}}}};
  const ownerMessage=(f,text='Synthetic private body never shown in notification')=>good(f.owner,'POST',`/channels/${f.channel.id}/messages`,{requestId:randomUUID(),text,files:[]});
  const recipientReminder=async(f,person=f.employee)=>(await listWork(f.storeId,'reminder.'+person.staffId+'.'))[0];
  try{
   await test('chat reminder is atomic with message/queue, excludes sender, is deterministic and carries no message body',async()=>{
    const f=await fixture();await enable(f);const requestId=randomUUID(),data={requestId,text:'siap',files:[]};const m=await good(f.employee,'POST',`/channels/${f.channel.id}/messages`,data);await good(f.employee,'POST',`/channels/${f.channel.id}/messages`,data);
    const rows=await listWork(f.storeId,'reminder.');assert.equal(rows.length,1);assert.equal(rows[0].staffId,f.owner.staffId);assert.equal(rows[0].chat.messageId,m.id);assert(!JSON.stringify(rows[0]).includes('siap'));
    const g=await fixture();await enable(g);const db={...prisma,$transaction:fn=>prisma.$transaction(tx=>fn({...tx,config:new Proxy(tx.config,{get(target,key){if(key==='upsert')return args=>{if(args.create?.key.startsWith('employee.workspace.reminder.'))throw Error('SYNTHETIC_CHAT_OUTBOX_FAIL');return target.upsert(args)};const v=target[key];return typeof v==='function'?v.bind(target):v}})}))};
    await assert.rejects(()=>teamCommunication(db).send(g.employee,g.channel.id,{requestId:randomUUID(),text:'siap',files:[]}),/SYNTHETIC_CHAT_OUTBOX_FAIL/);assert.equal((await messages(g)).messages.length,0);assert.equal((await listWork(g.storeId,'reminder.')).length,0);assert.equal(await prisma.config.count({where:{storeId:g.storeId,key:{startsWith:'team.communication.workflow.job.'}}}),0);
   });
   await test('chat inbox and delivery recheck member/fromSeq/archive/active identity/read receipt; backend denied permissions preserve APP chat',async()=>{
    for(const mutation of ['removed','fromSeq','archived','inactive','read','backend-denied']){
     const f=await fixture();await preset(f);await ownerMessage(f);const r=await recipientReminder(f),mock=pushMock();
     if(['removed','fromSeq','archived'].includes(mutation)){const c=await readTeam(prisma,f.storeId,'channel.'+f.channel.id);if(mutation==='removed')c.members=c.members.filter(x=>x.staffId!==f.employee.staffId);if(mutation==='fromSeq')c.members.find(x=>x.staffId===f.employee.staffId).fromSeq=r.chat.seq+1;if(mutation==='archived')c.archived=true;await writeTeam(prisma,f.storeId,'channel.'+f.channel.id,c)}
     if(mutation==='inactive')await prisma.staff.update({where:{id:f.employee.staffId},data:{status:'inactive'}});
     if(mutation==='read')await teamCommunication(prisma).markRead(f.employee,f.channel.id,r.chat.seq);
     if(mutation==='backend-denied')await prisma.config.create({data:{storeId:f.storeId,key:'staff.access.policy.v2',category:'staff',value:JSON.stringify({version:2,active:true,revision:1,roles:[{id:'denied',name:'Backend denied',description:'',permissions:{'inventory.read':'deny','personal.messages':'deny'}}],assignments:[{staffId:f.employee.staffId,roleId:'denied',overrides:{'personal.messages':'deny'}}]})}});
     assert.equal(await chatReminderRelevant(prisma,f.storeId,r),mutation==='backend-denied');
     const inbox=await request(f.employee,'GET','/staff-work/my/dashboard');if(mutation==='inactive')assert.equal(inbox.status,401);else{assert.equal(inbox.status,200,JSON.stringify(inbox));assert.equal(inbox.body.data.reminders.some(x=>x.id===r.id),mutation==='backend-denied')}
     await deliver(f.storeId,prisma,mock);assert.equal(mock.sent.length,mutation==='backend-denied'?1:0);assert.equal((await recipientReminder(f)).status,mutation==='backend-denied'?'sent':'cancelled');
    }
   });
   await test('unread/read cursors are per conversation and shared across sessions; notification deep links do not grant private channel access',async()=>{
    const f=await fixture(),m=await ownerMessage(f);const c2=await teamCommunication(prisma).create(f.owner,{requestId:randomUUID(),title:'Other synthetic group',kind:'group',members:[f.employee.staffId,f.other.staffId]});const second=await teamCommunication(prisma).send(f.owner,c2.id,{requestId:randomUUID(),text:'Other conversation',files:[]});
    let channels=await good(f.employee,'GET','/channels');assert.equal(channels.find(c=>c.id===f.channel.id).unread,1);assert.equal(channels.find(c=>c.id===c2.id).unread,1);
    await good(f.employee,'PUT',`/channels/${c2.id}/read`,{seq:second.seq});channels=await good(f.employee,'GET','/channels');assert.equal(channels.find(c=>c.id===f.channel.id).unread,1);assert.equal(channels.find(c=>c.id===c2.id).unread,0);
    assert.notEqual((await request(f.other,'GET',`/channels/${f.channel.id}/messages?after=0`)).status,200);
    await good(f.employee,'PUT',`/channels/${f.channel.id}/read`,{seq:m.seq});channels=await good(f.employee,'GET','/channels');assert.equal(channels.find(c=>c.id===f.channel.id).unread,0);const reminders=await listWork(f.storeId,'reminder.'+f.employee.staffId+'.');
    const r=reminders.find(r=>r.chat.channelId===f.channel.id);assert.equal(await chatReminderRelevant(prisma,f.storeId,r),false);
   });
   await test('chat delivery reuses existing keys/subscriptions, deduplicates concurrency, and no subscription/key becomes in-app without generating credentials',async()=>{
    const f=await fixture();await preset(f);await ownerMessage(f);const mock=pushMock();await Promise.all([deliver(f.storeId,prisma,mock),deliver(f.storeId,prisma,mock)]);await deliver(f.storeId,prisma,mock);assert.equal(mock.sent.length,1);assert.equal(mock.sent[0].title,'Pesan kerja baru / 新工作消息');assert.equal(mock.sent[0].url,'/team?channel='+encodeURIComponent(f.channel.id));assert(!JSON.stringify(mock.sent).includes('private body'));
    for(const hasSubscription of [false,true]){const g=await fixture();if(hasSubscription){await preset(g);await prisma.config.deleteMany({where:{storeId:g.storeId,key:'employee.workspace.push-keys'}})}await ownerMessage(g);const none=pushMock();await deliver(g.storeId,prisma,none);assert.equal(none.sent.length,0);assert.equal((await recipientReminder(g)).status,'in_app');assert.equal(await readWork(g.storeId,'push-keys'),null)}
    assert.equal(generatedKeys,0);
   });
   await test('disabled/logout-stale subscriptions and terminal 404/410 endpoints stop pushes; send records are not device delivery proof',async()=>{
    for(const mode of ['disabled','stale',404,410]){const f=await fixture(),id=await preset(f);await ownerMessage(f);const sub=await readWork(f.storeId,'subscription.'+id);
     if(mode==='disabled')await writeWork(f.storeId,'subscription.'+id,{...sub,active:false});if(mode==='stale')await prisma.user.update({where:{id:f.employee.id},data:{updatedAt:new Date(sub.issuedAtMs+1000)}});
     const mock=pushMock(typeof mode==='number'?mode:undefined);await deliver(f.storeId,prisma,mock);await deliver(f.storeId,prisma,mock);assert.equal(mock.sent.length,typeof mode==='number'?1:0);assert.equal((await readWork(f.storeId,'subscription.'+id)).active,false);assert.equal((await recipientReminder(f)).status,'in_app');
    }
    assert.equal(generatedKeys,0);
   });
  }finally{webpush.generateVAPIDKeys=oldGenerator}

  const out=root+'/output/team-chat-notification';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/http-results.json',JSON.stringify({passed:results.length,tests:results,productionAccess:false,realModelCalls:0,realPushCalls:0,credentialsCreated:false,webPushMockTested:true,deviceDeliveryTested:false},null,2));
 }finally{await new Promise(r=>server.close(r));await prisma.$disconnect()}
}
