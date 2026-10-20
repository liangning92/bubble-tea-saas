/* Owned PG, two independent Node processes, real HTTP/auth, mock Push only.
 * Latencies are individual fixture observations, never P95/device receipt claims. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{fork,execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),batch=process.env.BT_TEST_RUN,url=new URL(process.env.DATABASE_URL||'http://invalid');
assert(batch?.startsWith('bt-test-'));assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/notification_awareness_test');assert(process.env.UPLOADS_PATH?.includes(batch));
const pgDir=process.env.BT_NOTIFICATION_PG_DIR,pgLog=process.env.BT_NOTIFICATION_PG_LOG,pgOptions=process.env.BT_NOTIFICATION_PG_OPTIONS;
assert(pgDir&&new RegExp('^/tmp/'+batch+'-[\\w-]+/pg$').test(pgDir),'Only this batch PostgreSQL may be stopped');
const pgBase=path.dirname(pgDir);assert.equal(pgLog,pgBase+'/pg.log');assert.equal(pgOptions,`-h 127.0.0.1 -p ${url.port} -k ${pgBase}`);assert(fs.existsSync(pgDir+'/PG_VERSION'));
const build=root+'/server/dist',webpush=require(root+'/server/node_modules/web-push');let realPush=0,keyGeneration=0;
const originalPush=webpush.sendNotification,originalKeys=webpush.generateVAPIDKeys;
webpush.sendNotification=()=>{realPush++;throw Error('REAL_PUSH_FORBIDDEN')};webpush.generateVAPIDKeys=()=>{keyGeneration++;throw Error('NEW_CREDENTIAL_FORBIDDEN')};
const fetchLocal=global.fetch;global.fetch=(input,init)=>{assert.equal(new URL(String(input)).hostname,'127.0.0.1');return fetchLocal(input,init)};
const {prisma:db}=require(build+'/config/database'),{config}=require(build+'/config/env');
const delivery=require(build+'/services/EmployeeReminderService'),{notificationDeliveryWake,notificationQueueScanner,deliver}=delivery;
assert.equal(typeof notificationQueueScanner,'function','Compile the integrated scanner before executing');
const {teamCommunication,readTeam}=require(build+'/services/TeamCommunicationService'),{writeWork,readWork}=require(build+'/services/EmployeeWorkspaceStore');
const originalWake=delivery.wakeEmployeeDelivery,children=new Set(),observations=[],tests=[],sent=[],activeStores=new Map(),maxStores=new Map();let scanner,dispatcher,server,base,tenant,serial=0,pgStopped=false,transportHook,active=0;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(predicate,label,timeout=12000){const end=Date.now()+timeout;while(!await predicate()){if(Date.now()>end)throw Error('QUEUE_WAIT_TIMEOUT: '+label);await sleep(20)}}
async function test(name,fn){await fn();tests.push(name);console.log('PASS',name)}
function pgStart(){execFileSync('pg_ctl',['-D',pgDir,'-l',pgLog,'-o',pgOptions,'-w','start'],{stdio:'pipe'});pgStopped=false}
function childWrite(f,staged=false){
 const child=fork(__dirname+'/notification-queue-child-writer.cjs',[],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe','ipc']});children.add(child);
 const messages=[],errors=[];child.stdout.on('data',value=>errors.push(String(value)));child.stderr.on('data',value=>errors.push(String(value)));child.on('message',value=>messages.push(value));
 const ended=new Promise(resolve=>child.once('exit',(code,signal)=>{children.delete(child);resolve({code,signal})}));
 child.send({type:'write',actor:f.owner,channelId:f.channel.id,staged});
 return{child,messages,async receive(type){await wait(()=>messages.some(m=>m.type===type)||messages.some(m=>m.type==='error')||child.exitCode!==null,'child '+type);const failure=messages.find(m=>m.type==='error');assert(!failure,JSON.stringify(failure));const value=messages.find(m=>m.type===type);assert(value,errors.join(''));assert.notEqual(value.pid,process.pid);return value},decision(action){child.send({type:'decision',action})},async finish(){const end=await ended;assert.equal(end.code,0,errors.join(''))}};
}
async function fixture(){
 const i=++serial,storeId='queue-store-'+i;await db.store.create({data:{id:storeId,tenantId:tenant.id,name:'Synthetic queue '+i}});const actors={};
 for(const [name,role]of [['owner','admin'],['employee','staff']]){const id=`queue-user-${i}-${name}`,staffId=`queue-staff-${i}-${name}`;await db.user.create({data:{id,storeId,role,phone:id,password:'disabled-synthetic',staff:{create:{id:staffId,storeId,name:'Synthetic '+name,employeeNumber:id}}}});actors[name]={id,storeId,staffId,role}}
 const channel=await teamCommunication(db).create(actors.owner,{requestId:randomUUID(),title:'Synthetic process queue',kind:'direct',members:[actors.employee.staffId]});
 await writeWork(storeId,'push-keys',{publicKey:'synthetic-existing-public',privateKey:'synthetic-existing-private'},db);const id='synthetic-'+actors.employee.staffId;
 await writeWork(storeId,'subscription.'+id,{id,staffId:actors.employee.staffId,userId:actors.employee.id,issuedAtMs:Date.now()+1000,active:true,subscription:{endpoint:'https://fcm.googleapis.com/send/'+id,keys:{auth:'synthetic',p256dh:'synthetic'}}},db);
 return{storeId,...actors,channel};
}
const deliveries=f=>sent.filter(value=>value.storeId===f.storeId);
async function transport(_sub,payload,options){
 const notice=JSON.parse(payload),subId=_sub.endpoint.split('/').pop(),employeeId=subId.replace('synthetic-','');
 const staff=await db.staff.findUnique({where:{id:employeeId}});assert(staff);const reminder=await readWork(staff.storeId,'reminder.'+staff.id+'.'+notice.id,db);assert(reminder?.chat,'Transport must see a committed outbox row');
 const message=await readTeam(db,staff.storeId,'message.'+reminder.chat.channelId+'.'+String(reminder.chat.seq).padStart(12,'0'));assert.equal(message.id,reminder.chat.messageId,'Transport must see committed source message');assert.equal(options.vapidDetails.publicKey,'synthetic-existing-public');
 const observation={storeId:staff.storeId,messageId:message.id,transportAt:Date.now(),committedSourceVisible:true,noticeId:notice.id};sent.push(observation);if(transportHook)await transportHook(observation);return{statusCode:201};
}
function makeDispatcher(){dispatcher=notificationDeliveryWake(async storeId=>{assert.equal(typeof storeId,'string');assert(storeId.startsWith('queue-store-')||storeId.startsWith('notice-store-'));active++;const count=(activeStores.get(storeId)||0)+1;activeStores.set(storeId,count);maxStores.set(storeId,Math.max(maxStores.get(storeId)||0,count));try{await deliver(storeId,db,{sendNotification:transport})}finally{active--;activeStores.set(storeId,count-1)}},25)}
function makeScanner(database=db){scanner=notificationQueueScanner(database,storeId=>dispatcher.wake(storeId));return scanner}
async function apiMessage(f){const jwt=require(root+'/server/node_modules/jsonwebtoken'),token=jwt.sign({...f.owner,issuedAtMs:Date.now()+100},config.jwt.secret);const response=await fetch(base+`/api/team/channels/${f.channel.id}/messages`,{method:'POST',headers:{Authorization:'Bearer '+token,'X-Client-App':'admin','Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),text:'Synthetic API queue path',files:[]})});assert.equal(response.status,200);return(await response.json()).data}
async function main(){
 const express=require(root+'/server/node_modules/express'),{authenticateBeforeRouting}=require(build+'/middlewares/auth'),{declareAccessRoutes}=require(build+'/middlewares/staffAccessV2');const app=express();app.use(express.json());const routes=require(build+'/routes/teamCommunication').teamCommunicationRouter;app.use('/api/team',authenticateBeforeRouting,declareAccessRoutes('/api/team',routes));server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;
 tenant=await db.tenant.create({data:{name:'Synthetic cross-process notification queue'}});makeDispatcher();delivery.wakeEmployeeDelivery=storeId=>dispatcher.wake(storeId);
 await test('API HTTP finish wakes committed source/outbox only; importing standalone services never starts production workers',async()=>{
  const f=await fixture(),begin=Date.now(),message=await apiMessage(f);await wait(()=>deliveries(f).length===1,'API HTTP delivery');assert.equal(deliveries(f)[0].messageId,message.id);observations.push({path:'api-http-finish',httpStartToMockMs:deliveries(f)[0].transportAt-begin,independentSamples:1});
  originalWake(f.storeId);assert.equal(realPush,0);
 });
 await test('independent child staged transaction is invisible to API scan; commit is delivered and rollback never transports',async()=>{
  makeScanner().start();const f=await fixture(),writer=childWrite(f,true),staged=await writer.receive('staged');
  assert.equal(await readTeam(db,f.storeId,'message.'+f.channel.id+'.'+String(staged.message.seq).padStart(12,'0')),null);assert.equal(await readWork(f.storeId,'notification.chat.pending',db),null,'Signal must not escape the source transaction');await scanner.scanOnce();await sleep(650);assert.equal(deliveries(f).length,0);
  writer.decision('commit');const committed=await writer.receive('committed');await writer.finish();assert.deepEqual(await readWork(f.storeId,'notification.chat.pending',db),{eventId:committed.message.id});await wait(()=>deliveries(f).length===1,'child commit scan');assert.equal(deliveries(f)[0].messageId,committed.message.id);observations.push({path:'independent-child-commit-poll',commitAcknowledgedToMockMs:deliveries(f)[0].transportAt-committed.committedAt,pollMs:500,independentSamples:1});
  const g=await fixture(),rollback=childWrite(g,true);await rollback.receive('staged');assert.equal(await readWork(g.storeId,'notification.chat.pending',db),null);await scanner.scanOnce();assert.equal(deliveries(g).length,0);rollback.decision('rollback');await rollback.receive('rolledback');await rollback.finish();assert.equal(await readWork(g.storeId,'notification.chat.pending',db),null);await scanner.scanOnce();await sleep(650);assert.equal(deliveries(g).length,0);assert.equal((await teamCommunication(db).messages(g.owner,g.channel.id,0)).messages.length,0);
 });
 await test('scanner shutdown then restart recovers a child commit without IPC signal or HTTP wake',async()=>{
  await scanner.close();const f=await fixture(),writer=childWrite(f);const committed=await writer.receive('committed');await writer.finish();await sleep(650);assert.equal(deliveries(f).length,0);
  makeScanner().start();await wait(()=>deliveries(f).length===1,'restart catch-up');assert.equal(deliveries(f)[0].messageId,committed.message.id);
 });
 await test('duplicate scans/wakes coalesce; another child enqueue during active transport is delivered once without overlapping store delivery',async()=>{
  const f=await fixture();let release,entered=false;const gate=new Promise(resolve=>release=resolve);transportHook=async row=>{if(row.storeId===f.storeId&&deliveries(f).length===1){entered=true;await gate}};
  try{const one=childWrite(f);const committedOne=await one.receive('committed');await one.finish();await wait(()=>entered,'first transport gate');const two=childWrite(f);const committedTwo=await two.receive('committed');await two.finish();await Promise.all(Array.from({length:8},()=>scanner.scanOnce()));for(let i=0;i<8;i++)dispatcher.wake(f.storeId);release();await wait(()=>deliveries(f).length===2&&active===0,'enqueue during delivery');assert.deepEqual(new Set(deliveries(f).map(row=>row.messageId)),new Set([committedOne.message.id,committedTwo.message.id]));await scanner.scanOnce();await sleep(150);assert.equal(deliveries(f).length,2);assert.equal(maxStores.get(f.storeId),1)}finally{release();transportHook=null}
 });
 await test('concurrent scanOnce calls use one database scan at a time',async()=>{
  await scanner.close();let calls=0,concurrent=0,maximum=0,release;const gate=new Promise(resolve=>release=resolve);const facade={...db,config:new Proxy(db.config,{get(target,key){if(key==='findMany')return async args=>{assert.equal(args.where.key,'employee.workspace.notification.chat.pending','Query the indexed signal key, never reminder JSON');assert.equal(args.where.value,undefined);assert.equal(args.where.AND,undefined);calls++;concurrent++;maximum=Math.max(maximum,concurrent);try{await gate;return await target.findMany(args)}finally{concurrent--}};const value=target[key];return typeof value==='function'?value.bind(target):value}})};
  makeScanner(facade);const work=Array.from({length:8},()=>scanner.scanOnce());await wait(()=>calls>0,'single scan enters');release();await Promise.all(work);assert.equal(maximum,1);assert.equal(calls,1);await scanner.close();
 });
 await test('actual owned PostgreSQL interruption is contained and scanner reconnects after restart to recover committed pending chat',async()=>{
  const f=await fixture(),writer=childWrite(f);const committed=await writer.receive('committed');await writer.finish();assert.equal(deliveries(f).length,0);
  execFileSync('pg_ctl',['-D',pgDir,'-m','fast','-w','stop'],{stdio:'pipe'});pgStopped=true;makeScanner().start();await assert.rejects(scanner.scanOnce(),'A real stopped PostgreSQL must reject the scan query');await sleep(1100);assert.equal(deliveries(f).length,0);
  pgStart();await wait(()=>deliveries(f).length===1,'real PG recovery',20000);assert.equal(deliveries(f)[0].messageId,committed.message.id);observations.push({path:'real-postgresql-stop-start',reconnected:true,mockedDatabaseFailure:false});
 });
 await test('dispatcher retries transient delivery rejection after scanner cached the exact signal, without another enqueue or signal change',async()=>{
  await scanner.close();await dispatcher.close();const f=await fixture(),writer=childWrite(f);const committed=await writer.receive('committed');await writer.finish();const signal=await readWork(f.storeId,'notification.chat.pending',db);assert.deepEqual(signal,{eventId:committed.message.id});let attempts=0,wakes=0;
  dispatcher=notificationDeliveryWake(async storeId=>{if(storeId===f.storeId&&++attempts===1)throw Error('SYNTHETIC_TRANSIENT_DELIVERY_REJECTION');await deliver(storeId,db,{sendNotification:transport})},25);
  scanner=notificationQueueScanner(db,storeId=>{if(storeId===f.storeId)wakes++;dispatcher.wake(storeId)});scanner.start();
  await wait(()=>deliveries(f).length===1,'cached signal retry',12000);await scanner.close();await dispatcher.close();assert.equal(attempts,2);assert.equal(wakes,1,'The cached unchanged signal must not be required to wake again');assert.equal(deliveries(f).length,1);assert.equal(deliveries(f)[0].messageId,committed.message.id);assert.deepEqual(await readWork(f.storeId,'notification.chat.pending',db),signal);
  observations.push({path:'cached-signal-dispatcher-retry',attempts,wakes,controlledDeliveryRejection:true,newSignalRequired:false});
 });
 assert.equal(keyGeneration,0);assert.equal(realPush,0);const out=root+'/output/notification-queue-wake';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/current-results.json',JSON.stringify({batch,passed:tests.length,tests,observations,scannerSignal:'exact storeId + employee.workspace.notification.chat.pending key; no reminder JSON polling',signalCommitsWithMessage:true,twoIndependentNodeProcesses:true,realPostgreSQLInterruption:true,realPushCalls:realPush,credentialsCreated:false,realModelCalls:0,productionWorkerStarted:false,latencyIsSingleSample:true,p95Measured:false,deviceDeliveryTested:false},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{
 if(pgStopped){try{pgStart()}catch(error){console.error('OWNED_PG_RESTART_REQUIRED',error);process.exitCode=1}}
 await Promise.all([...children].map(child=>new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');const timeout=setTimeout(()=>{child.kill('SIGKILL')},1000);timeout.unref()})));
 if(scanner)await scanner.close();if(dispatcher)await dispatcher.close();delivery.wakeEmployeeDelivery=originalWake;
 if(server)await new Promise(resolve=>server.close(resolve));await db.$disconnect();webpush.sendNotification=originalPush;webpush.generateVAPIDKeys=originalKeys;global.fetch=fetchLocal;
});
