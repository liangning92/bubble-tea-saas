/* Real routes/identities/disposable PG; synthetic data and mocked Web Push only.
 * This checks HTTP contracts, not frontend click ordering or actual device receipt.
 * Business lifecycle transitions below are explicitly synthetic fixture updates;
 * no approval, payroll, refund, inventory or model execution is performed. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),database=new URL(process.env.DATABASE_URL||'http://invalid');
assert.equal(database.hostname,'127.0.0.1');assert.equal(database.pathname,'/notification_awareness_test');
assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));assert(process.env.UPLOADS_PATH?.includes(process.env.BT_TEST_RUN));
const build=root+'/server/dist',webpush=require(root+'/server/node_modules/web-push');
let generatedKeys=0,realPushCalls=0;const originalGenerate=webpush.generateVAPIDKeys,originalSend=webpush.sendNotification;
webpush.generateVAPIDKeys=()=>{generatedKeys++;throw Error('NEW_CREDENTIAL_FORBIDDEN')};
webpush.sendNotification=()=>{realPushCalls++;throw Error('REAL_PUSH_FORBIDDEN')};
const localFetch=global.fetch;global.fetch=(input,init)=>{assert.equal(new URL(String(input)).hostname,'127.0.0.1','External HTTP forbidden');return localFetch(input,init)};
const {prisma:db}=require(build+'/config/database'),{config}=require(build+'/config/env');
const {teamCommunication,readTeam,writeTeam}=require(build+'/services/TeamCommunicationService');
const {readWork,writeWork,listWork}=require(build+'/services/EmployeeWorkspaceStore');
const {notificationInbox}=require(build+'/services/NotificationInboxService');
const {collectApprovalNotices,approvalNoticeRelevant}=require(build+'/services/NotificationApprovalService');
const reminderDelivery=require(build+'/services/EmployeeReminderService');
const {deliver,notificationDeliveryWake}=reminderDelivery;
const {defaultRolesV2}=require(build+'/services/StaffPermissionV2Core');
const clone=value=>JSON.parse(JSON.stringify(value)),results=[];let serial=0,server,base,tenant,fastWakeObservation;
async function test(name,fn){await fn();results.push(name);console.log('PASS',name)}
async function request(actor,method,target,body,options={}){
 const jwt=require(root+'/server/node_modules/jsonwebtoken');
 const claims={...actor,issuedAtMs:Date.now()+100,...options.claims};
 const token=options.token||jwt.sign(claims,config.jwt.secret,{expiresIn:'1h'});
 const response=await fetch(base+'/api'+target,{method,headers:{Authorization:'Bearer '+token,'X-Client-App':options.client??(actor.role==='admin'?'admin':'employee'),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return{status:response.status,body:await response.json()};
}
async function good(...args){const result=await request(...args);assert.equal(result.status,200,JSON.stringify(result));return result.body.data}
const inbox=(actor,options)=>good(actor,'GET','/staff-work/my/inbox',undefined,options);
const acknowledge=(actor,id,options)=>good(actor,'POST','/staff-work/my/inbox/'+id+'/read',{},options);
const message=(actor,channel,text='Synthetic private conversation')=>good(actor,'POST',`/team/channels/${channel.id}/messages`,{requestId:randomUUID(),text,files:[]});
const has=(items,domain,id,kind)=>items.find(r=>r.domain===domain&&r.objectId===id&&(!kind||r.kind===kind));
async function fixture(){
 const i=++serial,storeId='notice-store-'+i;await db.store.create({data:{id:storeId,tenantId:tenant.id,name:'Synthetic notice '+i}});const people={};
 for(const [key,role]of [['owner','admin'],['employee','staff'],['other','staff'],['manager','manager'],['auditor','admin']]){
  const id=`notice-user-${i}-${key}`,staffId=`notice-staff-${i}-${key}`;
  await db.user.create({data:{id,storeId,role,phone:id,password:'disabled-synthetic-password',staff:{create:{id:staffId,storeId,name:'Synthetic '+key,employeeNumber:id}}}});people[key]={id,storeId,staffId,role};
 }
 const channel=await teamCommunication(db).create(people.owner,{requestId:randomUUID(),title:'Synthetic private channel',kind:'direct',members:[people.employee.staffId]});
 return{storeId,...people,channel};
}
async function policy(f,overrides={}){
 const value={version:2,active:true,revision:1,roles:clone(defaultRolesV2),assignments:[{staffId:f.manager.staffId,roleId:'manager',overrides},{staffId:f.employee.staffId,roleId:'basic',overrides:{'personal.messages':'deny','personal.training':'deny','inventory.read':'deny'}}]};
 await db.config.upsert({where:{storeId_key:{storeId:f.storeId,key:'staff.access.policy.v2'}},create:{storeId:f.storeId,key:'staff.access.policy.v2',category:'staff',value:JSON.stringify(value)},update:{value:JSON.stringify(value)}});
 return value;
}
async function pendingLeave(f){return db.leave.create({data:{storeId:f.storeId,staffId:f.employee.staffId,leaveType:'unpaid',startDate:new Date(),endDate:new Date(),totalDays:1,reason:'PRIVATE EXCLUDED REQUEST BODY'}})}
async function reminders(f,actor=f.employee){return listWork(f.storeId,'reminder.'+actor.staffId+'.',db)}
async function subscription(f,actor=f.employee){
 await writeWork(f.storeId,'push-keys',{publicKey:'synthetic-existing-public',privateKey:'synthetic-existing-private'},db);
 const id='synthetic-'+actor.staffId;await writeWork(f.storeId,'subscription.'+id,{id,userId:actor.id,staffId:actor.staffId,active:true,issuedAtMs:Date.now()+1000,subscription:{endpoint:'https://fcm.googleapis.com/send/'+id,keys:{p256dh:'synthetic',auth:'synthetic'}}},db);return id;
}
function pushMock(status){const sent=[];return{sent,sendNotification:async(_subscription,payload,options)=>{sent.push(JSON.parse(payload));assert.equal(options.vapidDetails.publicKey,'synthetic-existing-public');if(status)throw{statusCode:status};return{statusCode:201}}}}
async function trainingDraft(f,suffix){
 const edit=await good(f.owner,'GET','/training/library/edit'),catalogue=clone(edit.catalogue);catalogue.modules[0].title.zh+=' '+suffix;
 return good(f.owner,'PUT','/training/library/draft',{requestId:randomUUID(),expectedGeneration:edit.generation,catalogue});
}
async function publish(f,draft){const body={requestId:randomUUID(),expectedGeneration:draft.generation};return{body,result:await good(f.owner,'POST','/training/library/publish',body)}}
function subscriptionLookupBarrier(f,subId,lookupIndex){
 let entered,release,snapshotRead,lookups=0;const gate=new Promise(resolve=>release=resolve),waiting=new Promise(resolve=>entered=resolve),snapshot=new Promise(resolve=>snapshotRead=resolve);
 const facade={...db,$transaction:db.$transaction.bind(db),user:new Proxy(db.user,{get(target,key){if(key==='findUnique')return async args=>{if(args.where?.id===f.employee.id&&++lookups===lookupIndex){entered();await gate}return target.findUnique(args)};const value=target[key];return typeof value==='function'?value.bind(target):value}}),config:new Proxy(db.config,{get(target,key){
  if(key==='findMany')return async args=>{const value=await target.findMany(args);if(lookupIndex===1&&args.where?.key?.startsWith==='employee.workspace.subscription.'&&value.some(row=>row.key==='employee.workspace.subscription.'+subId))snapshotRead();return value};
  if(key==='findUnique')return async args=>{const value=await target.findUnique(args);if(lookupIndex===2&&args.where?.storeId_key?.key==='employee.workspace.subscription.'+subId)snapshotRead();return value};
  const value=target[key];return typeof value==='function'?value.bind(target):value}})};
 return{facade,release,async ready(){let timeout;try{await Promise.race([Promise.all([waiting,snapshot]),new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('SUBSCRIPTION_SNAPSHOT_BARRIER_NOT_REACHED')),5000))])}finally{clearTimeout(timeout)}}};
}
async function httpSubscriptionFixture(f,suffix){
 await writeWork(f.storeId,'push-keys',{publicKey:'synthetic-existing-public',privateKey:'synthetic-existing-private'},db);
 const body={endpoint:'https://fcm.googleapis.com/send/synthetic-'+f.storeId+'-'+suffix,keys:{p256dh:'synthetic-original-public',auth:'synthetic-original-auth'}};
 const {id}=await good(f.employee,'PUT','/staff-work/my/subscription',body);await message(f.owner,f.channel);return{id,body,old:await readWork(f.storeId,'subscription.'+id,db)};
}
async function main(){
 const express=require(root+'/server/node_modules/express'),{authenticateBeforeRouting}=require(build+'/middlewares/auth'),{declareAccessRoutes}=require(build+'/middlewares/staffAccessV2');
 const app=express();app.use(express.json({limit:'4mb'}));
 for(const [route,name,exportName]of [['/api/team','teamCommunication','teamCommunicationRouter'],['/api/staff-work','employeeWorkspace','employeeWorkspaceRouter'],['/api/training','training','trainingRouter']])app.use(route,authenticateBeforeRouting,declareAccessRoutes(route,require(build+'/routes/'+name)[exportName]));
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;
 tenant=await db.tenant.create({data:{name:'Synthetic integrated notification awareness'}});
 await test('inbox opening preserves both conversation cursors; successful selected fetch plus ack clears only that conversation across sessions',async()=>{
  const f=await fixture(),first=await message(f.owner,f.channel),secondChannel=await teamCommunication(db).create(f.owner,{requestId:randomUUID(),title:'Other conversation',kind:'group',members:[f.employee.staffId,f.other.staffId]}),second=await message(f.owner,secondChannel,'Other private conversation');
  const initial=await inbox(f.employee);assert.equal(initial.counts.chatUnread,2);assert.equal(initial.chats.find(c=>c.id===f.channel.id).preview.text,'Synthetic private conversation');
  assert.equal((await inbox(f.employee)).counts.chatUnread,2);assert.equal(await readTeam(db,f.storeId,`read.${f.channel.id}.${f.employee.staffId}`),null);
  const notice=initial.items.find(r=>r.kind==='chat'&&r.url.includes(f.channel.id));assert(notice);assert.equal((await request(f.employee,'POST','/staff-work/my/inbox/'+notice.id+'/read',{})).status,409);
  const fetched=await good(f.employee,'GET',`/team/channels/${f.channel.id}/messages?after=0`);assert(fetched.messages.some(m=>m.id===first.id));assert.equal((await inbox(f.employee)).counts.chatUnread,2);
  await good(f.employee,'PUT',`/team/channels/${f.channel.id}/read`,{seq:first.seq});const otherDevice=await inbox(f.employee);assert.equal(otherDevice.counts.chatUnread,1);assert.equal(otherDevice.chats.find(c=>c.id===secondChannel.id).unread,1);
  await message(f.employee,f.channel,'My own response');assert.equal((await inbox(f.employee)).chats.find(c=>c.id===f.channel.id).unread,0);assert.equal((await inbox(f.employee)).chats.find(c=>c.id===secondChannel.id).unread,1);assert(second.seq>0);
 });
 await test('nonmembers and cross-store/forged identity cannot expose preview or use notification deep links/read IDs',async()=>{
  const f=await fixture(),g=await fixture();await message(f.owner,f.channel,'SECRET PRIVATE PREVIEW');
  const own=await inbox(f.employee),notice=own.items.find(r=>r.kind==='chat');assert(notice);
  assert(!(await inbox(f.other)).chats.some(c=>c.id===f.channel.id));
  assert.equal((await request(f.other,'POST','/staff-work/my/inbox/'+notice.id+'/read',{})).status,404);
  assert.notEqual((await request(f.other,'GET',`/team/channels/${f.channel.id}/messages?after=0`)).status,200);
  assert.notEqual((await request(g.employee,'GET',`/team/channels/${f.channel.id}/messages?after=0`)).status,200);
  const audit=await good(f.auditor,'GET','/team/admin/channels');const listed=audit.find(c=>c.id===f.channel.id);assert(listed);assert.equal(listed.preview,null);assert.equal(listed.unread,0);assert(!JSON.stringify(audit).includes('SECRET PRIVATE PREVIEW'));
  for(const claims of [{role:'admin'},{storeId:g.storeId},{staffId:f.other.staffId}])assert.equal((await request(f.employee,'GET','/staff-work/my/inbox',undefined,{claims})).status,401);
  assert.equal((await request(f.employee,'GET','/staff-work/my/inbox',undefined,{client:'admin'})).status,403);
  assert.equal((await request(f.employee,'GET','/staff-work/my/inbox',undefined,{claims:{issuedAtMs:1}})).status,401);
 });
 await test('backend business deny preserves existing employee APP inbox/chat/training while forged manager grants fail',async()=>{
  const f=await fixture();await policy(f);await message(f.owner,f.channel);const leave=await pendingLeave(f);
  const personal=await inbox(f.employee);assert.equal(personal.counts.chatUnread,1);assert(!has(personal.items,'leave',leave.id));
  await good(f.employee,'GET','/training/library');await good(f.employee,'GET',`/team/channels/${f.channel.id}/messages?after=0`);
  assert.equal((await request(f.employee,'GET','/team/admin/channels',undefined,{client:'admin'})).status,403);
  const forged=await notificationInbox(db).read({...f.employee,role:'admin',accessRole:{version:2,modes:{'attendance.write':'allow'}}});assert(!has(forged.items,'leave',leave.id));
 });
 await test('real training draft stays silent; published content emits deduplicated personal updates and shared read does not complete learning',async()=>{
  const f=await fixture();await policy(f);const before=await good(f.employee,'GET','/staff-work/my/learning'),draft=await trainingDraft(f,'synthetic-published-v1');
  assert.equal((await inbox(f.employee)).counts.trainingUnread,0);const publication=await publish(f,draft),first=await inbox(f.employee),notice=first.items.find(r=>r.kind==='training_update');assert(notice);assert(first.counts.trainingUnread>0);
  const count=(await reminders(f)).filter(r=>r.event.startsWith('training-content:')).length;
  assert.equal((await good(f.owner,'POST','/training/library/publish',publication.body)).replayed,true);assert.equal((await reminders(f)).filter(r=>r.event.startsWith('training-content:')).length,count);
  assert.equal((await request(f.other,'POST','/staff-work/my/inbox/'+notice.id+'/read',{})).status,404);
  await acknowledge(f.employee,notice.id);assert.equal((await inbox(f.employee)).items.find(r=>r.id===notice.id).read,true);
  assert.deepEqual(await good(f.employee,'GET','/staff-work/my/learning'),before);assert.equal(await db.training.count({where:{staffId:f.employee.staffId,status:'completed'}}),0);
  await trainingDraft(f,'unpublished-v2');assert.equal((await inbox(f.employee)).items.find(r=>r.id===notice.id).read,true);
 });
 await test('training newer published revision replaces old relevance; reminder failure rolls back actual HTTP publication/version',async()=>{
  const f=await fixture(),first=await publish(f,await trainingDraft(f,'synthetic-v1')),old=(await inbox(f.employee)).items.find(r=>r.kind==='training_update');assert(old);
  const draft=await trainingDraft(f,'synthetic-v2'),requestId=randomUUID();
  await db.$executeRawUnsafe(`ALTER TABLE "Config" ADD CONSTRAINT notification_publish_failure CHECK ("key" NOT LIKE 'employee.workspace.reminder.%') NOT VALID`);
  try{assert.notEqual((await request(f.owner,'POST','/training/library/publish',{requestId,expectedGeneration:draft.generation})).status,200)}finally{await db.$executeRawUnsafe('ALTER TABLE "Config" DROP CONSTRAINT notification_publish_failure')}
  assert.equal((await good(f.owner,'GET','/training/library/edit')).generation,draft.generation);assert.equal((await good(f.employee,'GET','/training/library')).revision,first.result.revision);
  assert.equal(await db.config.findUnique({where:{storeId_key:{storeId:f.storeId,key:'training.library.revision:'+requestId}}}),null);
  await publish(f,draft);assert(!(await inbox(f.employee)).items.some(r=>r.id===old.id));
 });
 await test('current authorized handler pending survives read across devices; revocation removes inbox and queued-push relevance without altering source',async()=>{
  const f=await fixture();await policy(f);const leave=await pendingLeave(f);await collectApprovalNotices(db,f.storeId);
  const initial=await inbox(f.manager,{client:'admin'}),notice=has(initial.items,'leave',leave.id,'approval_request');assert(notice);assert.equal(initial.counts.approvalPending,1);
  const acknowledged=await acknowledge(f.manager,notice.id,{client:'admin'});assert.equal(acknowledged.pending,true);const second=await inbox(f.manager,{client:'admin'});assert.equal(second.counts.approvalPending,1);assert.equal(second.items.find(r=>r.id===notice.id).read,true);assert.equal((await db.leave.findUnique({where:{id:leave.id}})).status,'pending');
  const stored=(await reminders(f,f.manager)).find(r=>r.id===notice.id);assert(stored);assert(await approvalNoticeRelevant(db,f.storeId,stored));
  await policy(f,{'attendance.write':'deny'});assert.equal((await inbox(f.manager,{client:'admin'})).counts.approvalPending,0);assert.equal(await approvalNoticeRelevant(db,f.storeId,stored),false);
  await subscription(f,f.manager);const mock=pushMock();await deliver(f.storeId,db,mock);assert(!mock.sent.some(p=>p.id===stored.id));assert.equal((await readWork(f.storeId,`reminder.${f.manager.staffId}.${stored.id}`,db)).status,'cancelled');
 });
 await test('fixture node completion removes pending and queued push; only applicant gets result including no-staff administrator in-app',async()=>{
  const f=await fixture();await policy(f);const leave=await pendingLeave(f);await collectApprovalNotices(db,f.storeId);const pending=(await reminders(f,f.manager)).find(r=>r.objectId===leave.id);assert(pending);
  await db.leave.update({where:{id:leave.id},data:{status:'approved',approvedBy:f.owner.id,approvedAt:new Date()}});assert(!has((await inbox(f.manager,{client:'admin'})).items,'leave',leave.id));assert.equal(await approvalNoticeRelevant(db,f.storeId,pending),false);
  await subscription(f,f.manager);const endedPush=pushMock();await deliver(f.storeId,db,endedPush);assert(!endedPush.sent.some(p=>p.id===pending.id));assert.equal((await readWork(f.storeId,`reminder.${f.manager.staffId}.${pending.id}`,db)).status,'cancelled');
  const result=has((await inbox(f.employee)).items,'leave',leave.id,'approval_result');assert(result);assert.equal(result.pending,false);assert(!has((await inbox(f.other)).items,'leave',leave.id));assert(!JSON.stringify(result).includes('PRIVATE'));
  const id='notice-no-staff-'+serial;await db.user.create({data:{id,phone:id,password:'disabled-synthetic',role:'admin',storeId:f.storeId}});const actor={id,role:'admin',storeId:f.storeId,staffId:''};
  const action=await db.staffActionApproval.create({data:{storeId:f.storeId,applicantId:id,action:'orders.discount',targetId:'synthetic-basket',requestId:randomUUID(),fingerprint:'synthetic',payload:'{}',status:'rejected',expiresAt:new Date(Date.now()+3600000)}});
  const ownerResult=has((await inbox(actor)).items,'staffActionApproval',action.id,'approval_result');assert(ownerResult);await acknowledge(actor,ownerResult.id);assert.equal(has((await inbox(actor)).items,'staffActionApproval',action.id).read,true);assert(!has((await inbox(f.other)).items,'staffActionApproval',action.id));
 });
 await test('read committed after delivery lease suppresses transport and cannot be restored to unread',async()=>{
  const f=await fixture();await writeWork(f.storeId,'approval.notice.baseline',{at:'2000-01-01T00:00:00.000Z'},db);
  const leave=await pendingLeave(f);await db.leave.update({where:{id:leave.id},data:{status:'approved'}});await collectApprovalNotices(db,f.storeId);
  const sub=await subscription(f),notice=(await reminders(f)).find(r=>r.objectId===leave.id);assert(notice);
  const key='delivery.'+notice.id+'.'+sub;let entered,release,paused=false;
  const claimed=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
  const delayed=new Proxy(db,{get(target,name){if(name==='$transaction')return async(...args)=>{
    const value=await target.$transaction(...args),lease=await readWork(f.storeId,key,db);
    if(!paused&&lease?.leaseUntil){paused=true;entered();await gate}return value;
   };const value=target[name];return typeof value==='function'?value.bind(target):value}});
  const mock=pushMock(),sending=deliver(f.storeId,delayed,mock);let timeout;
  try{
   await Promise.race([claimed,new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('LEASE_BARRIER_NOT_REACHED')),5000))]);
   await acknowledge(f.employee,notice.id);assert.equal((await readWork(f.storeId,'reminder.'+f.employee.staffId+'.'+notice.id,db)).read,true);
  }finally{clearTimeout(timeout);release()}
  await sending;assert.equal(mock.sent.length,0);
  const saved=await readWork(f.storeId,'reminder.'+f.employee.staffId+'.'+notice.id,db);
  assert.equal(saved.read,true);assert.equal(saved.status,'in_app');assert.equal((await readWork(f.storeId,key,db)).status,'skipped_read');
  assert.equal((await db.leave.findUnique({where:{id:leave.id}})).status,'approved');assert.equal((await inbox(f.employee)).items.find(r=>r.id===notice.id).read,true);
 });
 await test('read committed during an already-started mocked transport survives final delivery status merge',async()=>{
  const f=await fixture();await writeWork(f.storeId,'approval.notice.baseline',{at:'2000-01-01T00:00:00.000Z'},db);
  const leave=await pendingLeave(f);await db.leave.update({where:{id:leave.id},data:{status:'approved'}});await collectApprovalNotices(db,f.storeId);
  const sub=await subscription(f),notice=(await reminders(f)).find(r=>r.objectId===leave.id);assert(notice);let calls=0;
  const mock={sendNotification:async()=>{calls++;await acknowledge(f.employee,notice.id);return{statusCode:201}}};
  await deliver(f.storeId,db,mock);assert.equal(calls,1,'An already-started transport cannot be recalled');
  const saved=await readWork(f.storeId,'reminder.'+f.employee.staffId+'.'+notice.id,db);
  assert.equal(saved.read,true);assert.equal(saved.status,'in_app');assert.equal((await readWork(f.storeId,'delivery.'+notice.id+'.'+sub,db)).status,'sent');
  await deliver(f.storeId,db,mock);assert.equal(calls,1);assert.equal((await db.leave.findUnique({where:{id:leave.id}})).status,'approved');
 });
 await test('logout or session revocation committed after the lease prevents transport without marking the notice read',async()=>{
  for(const mode of ['logout','stale-session']){
   const f=await fixture();await writeWork(f.storeId,'approval.notice.baseline',{at:'2000-01-01T00:00:00.000Z'},db);
   const leave=await pendingLeave(f);await db.leave.update({where:{id:leave.id},data:{status:'approved'}});await collectApprovalNotices(db,f.storeId);
   const sub=await subscription(f),notice=(await reminders(f)).find(r=>r.objectId===leave.id),key='delivery.'+notice.id+'.'+sub;let entered,release,paused=false;
   const claimed=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
   const delayed=new Proxy(db,{get(target,name){if(name==='$transaction')return async(...args)=>{
    const value=await target.$transaction(...args);if(!paused&&(await readWork(f.storeId,key,db))?.leaseUntil){paused=true;entered();await gate}return value;
   };const value=target[name];return typeof value==='function'?value.bind(target):value}});
   const mock=pushMock(),sending=deliver(f.storeId,delayed,mock);let timeout;
   try{
    await Promise.race([claimed,new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('LEASE_BARRIER_NOT_REACHED')),5000))]);
    if(mode==='logout')await good(f.employee,'DELETE','/staff-work/my/subscription',{id:sub});
    else{const row=await readWork(f.storeId,'subscription.'+sub,db);await db.user.update({where:{id:f.employee.id},data:{updatedAt:new Date(row.issuedAtMs+1000)}})}
   }finally{clearTimeout(timeout);release()}
   await sending;assert.equal(mock.sent.length,0);assert.equal((await readWork(f.storeId,'subscription.'+sub,db)).active,false);
   await deliver(f.storeId,db,mock);const saved=await readWork(f.storeId,'reminder.'+f.employee.staffId+'.'+notice.id,db);
   assert.equal(saved.read,false);assert.equal(saved.status,'in_app');assert.equal(mock.sent.length,0);
   assert.equal(await readWork(f.storeId,'inbox.read.'+f.employee.id+'.'+notice.id,db),null);assert.equal((await db.leave.findUnique({where:{id:leave.id}})).status,'approved');
  }
 });
 await test('HTTP renewal during pre-lease or final User lookup preserves the entire newer subscription and permits the next delivery',async()=>{
  for(const lookup of [1,2]){
   const f=await fixture(),sub=await httpSubscriptionFixture(f,'renew-'+lookup),barrier=subscriptionLookupBarrier(f,sub.id,lookup),mock=pushMock();let renewed;
   const sending=deliver(f.storeId,barrier.facade,mock);
   try{await barrier.ready();const revokedAt=sub.old.issuedAtMs+100;await db.user.update({where:{id:f.employee.id},data:{updatedAt:new Date(revokedAt)}});
    const body={...sub.body,keys:{p256dh:'synthetic-renewed-public-'+lookup,auth:'synthetic-renewed-auth-'+lookup}},claims={issuedAtMs:revokedAt+1000};
    assert.equal((await good(f.employee,'PUT','/staff-work/my/subscription',body,{claims})).id,sub.id);renewed=await readWork(f.storeId,'subscription.'+sub.id,db);assert.equal(renewed.active,true);assert.equal(renewed.issuedAtMs,claims.issuedAtMs);assert.deepEqual(renewed.subscription,body);
   }finally{barrier.release()}
   await sending;assert.equal(mock.sent.length,0,'The old session snapshot must never transport');assert.deepEqual(await readWork(f.storeId,'subscription.'+sub.id,db),renewed,'Old invalidation must not overwrite an HTTP200 renewal');
   let calls=0;await deliver(f.storeId,db,{sendNotification:async current=>{calls++;assert.deepEqual(current,renewed.subscription);return{statusCode:201}}});assert.equal(calls,1);assert.deepEqual(await readWork(f.storeId,'subscription.'+sub.id,db),renewed);
  }
 });
 await test('HTTP renewal followed by logout during either User lookup keeps the newer logged-out snapshot intact and never transports',async()=>{
  for(const lookup of [1,2]){
   const f=await fixture(),sub=await httpSubscriptionFixture(f,'logout-'+lookup),barrier=subscriptionLookupBarrier(f,sub.id,lookup),mock=pushMock();let loggedOut;
   const sending=deliver(f.storeId,barrier.facade,mock);
   try{await barrier.ready();const revokedAt=sub.old.issuedAtMs+100;await db.user.update({where:{id:f.employee.id},data:{updatedAt:new Date(revokedAt)}});
    const body={...sub.body,keys:{p256dh:'synthetic-logout-public-'+lookup,auth:'synthetic-logout-auth-'+lookup}},options={claims:{issuedAtMs:revokedAt+1000}};
    await good(f.employee,'PUT','/staff-work/my/subscription',body,options);await good(f.employee,'DELETE','/staff-work/my/subscription',{id:sub.id},options);loggedOut=await readWork(f.storeId,'subscription.'+sub.id,db);assert.equal(loggedOut.active,false);assert.equal(loggedOut.issuedAtMs,options.claims.issuedAtMs);assert.deepEqual(loggedOut.subscription,body);
   }finally{barrier.release()}
   await sending;await deliver(f.storeId,db,mock);assert.equal(mock.sent.length,0);assert.deepEqual(await readWork(f.storeId,'subscription.'+sub.id,db),loggedOut,'Old invalidation must preserve the later HTTP logout');
  }
 });
 await test('404 or 410 from an old in-flight transport cannot disable or overwrite a newer HTTP subscription renewal or logout',async()=>{
  for(const status of [404,410])for(const logout of [false,true]){
   const f=await fixture(),sub=await httpSubscriptionFixture(f,'terminal-'+status+'-'+logout);let latest,calls=0;
   await deliver(f.storeId,db,{sendNotification:async current=>{calls++;assert.deepEqual(current,sub.body);const body={...sub.body,keys:{p256dh:'synthetic-terminal-renewed-'+status,auth:'synthetic-terminal-auth-'+status}};
    const options={claims:{issuedAtMs:sub.old.issuedAtMs+1000}};await good(f.employee,'PUT','/staff-work/my/subscription',body,options);if(logout)await good(f.employee,'DELETE','/staff-work/my/subscription',{id:sub.id},options);latest=await readWork(f.storeId,'subscription.'+sub.id,db);assert.equal(latest.active,!logout);assert.deepEqual(latest.subscription,body);throw{statusCode:status};
   }});assert.equal(calls,1);assert.deepEqual(await readWork(f.storeId,'subscription.'+sub.id,db),latest,'Terminal errors belong only to the exact attempted subscription snapshot');
   // Existing provider backoff remains in force for the failed event. A new
   // committed event must use the renewed subscription without waiting for it.
   await message(f.owner,f.channel,'Independent new event after old transport failed');let freshCalls=0;await deliver(f.storeId,db,{sendNotification:async current=>{freshCalls++;assert.deepEqual(current,latest.subscription);return{statusCode:201}}});assert.equal(freshCalls,logout?0:1);assert.deepEqual(await readWork(f.storeId,'subscription.'+sub.id,db),latest);
  }
 });
 await test('chat outbox persistence failure atomically rolls back message, reminder and workflow event',async()=>{
  const f=await fixture();const failing={...db,$transaction:fn=>db.$transaction(tx=>fn({...tx,config:new Proxy(tx.config,{get(target,key){if(key==='upsert')return args=>{if(args.create?.key.startsWith('employee.workspace.reminder.'))throw Error('SYNTHETIC_NOTIFICATION_OUTBOX_FAIL');return target.upsert(args)};const value=target[key];return typeof value==='function'?value.bind(target):value}})}))};
  await assert.rejects(()=>teamCommunication(failing).send(f.owner,f.channel.id,{requestId:randomUUID(),text:'Rollback only',files:[]}),/SYNTHETIC_NOTIFICATION_OUTBOX_FAIL/);
  assert.equal((await good(f.employee,'GET',`/team/channels/${f.channel.id}/messages?after=0`)).messages.length,0);assert.equal((await reminders(f)).length,0);assert.equal(await db.config.count({where:{storeId:f.storeId,key:{startsWith:'team.communication.workflow.job.'}}}),0);
 });
 await test('no subscription preserves in-app item; mocked push uses generic existing-key deep link and deterministic concurrent dedup',async()=>{
  const f=await fixture();await message(f.owner,f.channel,'BODY MUST NOT REACH PUSH');let mock=pushMock();await deliver(f.storeId,db,mock);assert.equal(mock.sent.length,0);assert.equal((await reminders(f))[0].status,'in_app');assert.equal((await inbox(f.employee)).counts.chatUnread,1);assert.equal(await readWork(f.storeId,'push-keys',db),null);
  const g=await fixture();await subscription(g);await message(g.owner,g.channel,'BODY MUST NOT REACH PUSH');mock=pushMock();await Promise.all([deliver(g.storeId,db,mock),deliver(g.storeId,db,mock)]);await deliver(g.storeId,db,mock);assert.equal(mock.sent.length,1);assert.equal(mock.sent[0].url,'/team?channel='+encodeURIComponent(g.channel.id));assert(!JSON.stringify(mock.sent).includes('BODY MUST NOT REACH PUSH'));assert.equal((await reminders(g))[0].status,'sent');
 });
 await test('successful HTTP commit wakes only notification delivery; in-flight messages coalesce without loss and failed sends never wake',async()=>{
  const f=await fixture();await subscription(f);const firstBody={requestId:randomUUID(),text:'Wake after commit',files:[]};
  const secondBody={requestId:randomUUID(),text:'Arrives during transport',files:[]};let started,release;
  const transportStarted=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
  let calls=0,wakes=0,active=0,maxActive=0;const sent=[];const begin=Date.now();
  const mock={sendNotification:async(_sub,payload)=>{
    const notice=JSON.parse(payload),r=await readWork(f.storeId,'reminder.'+f.employee.staffId+'.'+notice.id,db);
    assert(r?.chat,'Only a committed outbox item can reach transport');
    assert.equal((await readTeam(db,f.storeId,'message.'+r.chat.channelId+'.'+String(r.chat.seq).padStart(12,'0'))).id,r.chat.messageId);
    sent.push(r.chat.messageId);if(++calls===1){fastWakeObservation={httpToMockTransportMs:Date.now()-begin,coalescingDelayMs:25,realPush:false,deviceArrivalMeasured:false};started();await gate}
    return{statusCode:201};
  }};
  const dispatcher=notificationDeliveryWake(async storeId=>{assert.equal(storeId,f.storeId);active++;maxActive=Math.max(maxActive,active);try{await deliver(storeId,db,mock)}finally{active--}},25);
  const originalWake=reminderDelivery.wakeEmployeeDelivery;reminderDelivery.wakeEmployeeDelivery=storeId=>{wakes++;dispatcher.wake(storeId)};
  const wait=async predicate=>{const until=Date.now()+5000;while(!await predicate()){if(Date.now()>until)throw Error('POST_COMMIT_WAKE_TIMEOUT');await new Promise(resolve=>setTimeout(resolve,15))}};
  try{
    const first=await good(f.owner,'POST',`/team/channels/${f.channel.id}/messages`,firstBody);
    await Promise.race([transportStarted,new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('TRANSPORT_NOT_STARTED')),5000);t.unref()})]);
    const second=await good(f.owner,'POST',`/team/channels/${f.channel.id}/messages`,secondBody);
    await good(f.owner,'POST',`/team/channels/${f.channel.id}/messages`,secondBody);release();await wait(()=>calls===2&&active===0);
    assert.deepEqual(new Set(sent),new Set([first.id,second.id]));assert.equal(calls,2);assert.equal(maxActive,1);
    const before=wakes;assert.equal((await request(f.owner,'POST',`/team/channels/${f.channel.id}/messages`,{requestId:randomUUID(),text:'',files:[]})).status,400);assert.equal(wakes,before);
    await db.$executeRawUnsafe(`ALTER TABLE "Config" ADD CONSTRAINT notification_message_failure CHECK ("key" NOT LIKE 'employee.workspace.reminder.%') NOT VALID`);
    try{assert.equal((await request(f.owner,'POST',`/team/channels/${f.channel.id}/messages`,{requestId:randomUUID(),text:'Must roll back before wake',files:[]})).status,500)}finally{await db.$executeRawUnsafe('ALTER TABLE "Config" DROP CONSTRAINT notification_message_failure')}
    assert.equal(wakes,before);assert.equal((await good(f.employee,'GET',`/team/channels/${f.channel.id}/messages?after=0`)).messages.length,2);
  }finally{release();reminderDelivery.wakeEmployeeDelivery=originalWake;await dispatcher.close()}
  // No existing employee worker was started by this fixture or route import.
  originalWake(f.storeId);assert.equal(realPushCalls,0);
 });
 await test('queued chat rechecks member/floor/archive/active identity; disabled/stale/404/410 subscriptions never repeat transport',async()=>{
  for(const mode of ['removed','floor','archived','inactive','read','disabled','stale',404,410]){
   const f=await fixture(),subId=await subscription(f);await message(f.owner,f.channel);const stored=(await reminders(f))[0];
   if(['removed','floor','archived'].includes(mode)){const channel=await readTeam(db,f.storeId,'channel.'+f.channel.id);if(mode==='removed')channel.members=channel.members.filter(m=>m.staffId!==f.employee.staffId);if(mode==='floor')channel.members.find(m=>m.staffId===f.employee.staffId).fromSeq=stored.chat.seq+1;if(mode==='archived')channel.archived=true;await writeTeam(db,f.storeId,'channel.'+channel.id,channel)}
   if(mode==='inactive')await db.staff.update({where:{id:f.employee.staffId},data:{status:'inactive'}});
   if(mode==='read'){await good(f.employee,'GET',`/team/channels/${f.channel.id}/messages?after=0`);await good(f.employee,'PUT',`/team/channels/${f.channel.id}/read`,{seq:stored.chat.seq})}
   if(['removed','floor','archived','read'].includes(mode))assert(!(await inbox(f.employee)).items.some(r=>r.id===stored.id));
   const sub=await readWork(f.storeId,'subscription.'+subId,db);if(mode==='disabled')await writeWork(f.storeId,'subscription.'+subId,{...sub,active:false},db);if(mode==='stale')await db.user.update({where:{id:f.employee.id},data:{updatedAt:new Date(sub.issuedAtMs+1000)}});
   const mock=pushMock(typeof mode==='number'?mode:undefined);await deliver(f.storeId,db,mock);await deliver(f.storeId,db,mock);assert.equal(mock.sent.length,typeof mode==='number'?1:0);
   if(['removed','floor','archived','inactive','read'].includes(mode))assert.equal((await reminders(f))[0].status,'cancelled');else assert.equal((await readWork(f.storeId,'subscription.'+subId,db)).active,false);
  }
 });
 assert.equal(generatedKeys,0);assert.equal(realPushCalls,0);
 const out=root+'/output/notification-awareness';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/http-results.json',JSON.stringify({passed:results.length,tests:results,fastWakeObservation,productionAccess:false,externalNetwork:false,realModelCalls:0,realPushCalls,credentialsCreated:false,mockedWebPush:true,deviceDeliveryTested:false,businessTransitions:'synthetic lifecycle fixtures; no approval/refund execution',frontendClickOrderingTested:false},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{webpush.generateVAPIDKeys=originalGenerate;webpush.sendNotification=originalSend;global.fetch=localFetch;if(server)await new Promise(resolve=>server.close(resolve));await db.$disconnect()});
