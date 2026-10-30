/* Disposable PostgreSQL + actual native routes/auth. No production or model IO. */
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),built=n=>require((process.env.OPERATIONS_BUILD_ROOT||root+'/server/dist')+'/'+n);
assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));
const uri=new URL(process.env.DATABASE_URL);assert.equal(uri.hostname,'127.0.0.1');assert.equal(uri.pathname,'/team_test');
const {PrismaClient}=require(root+'/server/node_modules/@prisma/client'),db=new PrismaClient();
const {declareAccessRoutes}=built('middlewares/staffAccessV2');
const api=built('services/ManagementBackendRegistry'),policy=built('services/ManagementBackendPolicy');
const tools=built('services/teamAgentBridge/employeeBackendTool');
const {canAccessStore}=built('middlewares/auth');
const passed=[],check=async(name,fn)=>{let timer;try{await Promise.race([fn(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('CHECK_TIMEOUT: '+name)),30000)})]);passed.push(name);console.log('PASS '+name)}finally{clearTimeout(timer)}};
const storeId='whole-backend-own-store',other='whole-backend-other-store';let owner,employee;
const invoke=(actor,operationId,fields={})=>api.invokeManagementBackend(db,actor,{operationId,contractVersion:api.backendVersion(),...fields});
const description=id=>({id,path:id.slice(id.indexOf(' ')+1),method:id.split(' ')[0],permission:null});
async function main(){
 for(const [base,name]of[['/api/products','productRouter'],['/api/config','configRouter'],['/api/categories','categoryRouter'],['/api/team','teamCommunicationRouter'],['/api/marketing/activities','activitiesRouter'],['/api/purchase-orders','purchaseOrderRouter'],['/api/salaries','salaryRouter']]){
  const files={productRouter:'product',configRouter:'config',categoryRouter:'category',teamCommunicationRouter:'teamCommunication',activitiesRouter:'activities',purchaseOrderRouter:'purchaseOrder',salaryRouter:'salary'};
  declareAccessRoutes(base,built('routes/'+files[name])[name]);
 }
 declareAccessRoutes('/api/upload',built('routes/upload').uploadRouter);
 declareAccessRoutes('/api/announcement',built('routes/announcement').default);
 declareAccessRoutes('/api/training/library',built('routes/trainingLibrary').trainingLibraryRouter);
 const tenant=await db.tenant.create({data:{name:'Whole backend isolated test'}});
 for(const id of [storeId,other])await db.store.create({data:{id,tenantId:tenant.id,name:id}});
 for(const [role,phone]of[['admin','08919101001'],['staff','08919101002']]){
  const u=await db.user.create({data:{phone,password:'synthetic-not-login',role,storeId,staff:{create:{storeId,name:role,employeeNumber:'backend-'+role}}},include:{staff:true}});
  const actor={id:u.id,phone:u.phone,role,staffId:u.staff.id,storeId,issuedAtMs:Date.now()+100};if(role==='admin')owner=actor;else employee={...actor,employeeApp:true};
 }
 const cat=await db.category.create({data:{storeId,name:'Own beverages'}}),foreignCat=await db.category.create({data:{storeId:other,name:'Foreign beverages'}});
 const product=await db.product.create({data:{storeId,categoryId:cat.id,code:'BACKEND-OWN',name:'Own tea'}}),foreignProduct=await db.product.create({data:{storeId:other,categoryId:foreignCat.id,code:'BACKEND-FOREIGN',name:'FOREIGN_SENTINEL'}});
 await check('catalog is compact, registered native schemas describe real fields',async()=>{
  const list=api.backendCatalog('products',0,4);assert.equal(list.operations.length,4);assert(!('requestContract'in list.operations[0]));
  const op=api.backendDescription('POST /api/products');assert(op.requestContract.body.properties.name);assert.equal(op.contractCoverage,'declared_native_validator_only');
  const activity=api.backendDescription('PUT /api/marketing/activities/:id');assert(activity.requestContract.body.properties.version);assert(activity.requestContract.body.properties.memberOnly);
  assert.equal(api.backendDescription('GET /api/team/channels').contractCoverage,'native_controller_validation_not_described');
 });
 await check('native read uses current account and own store; no foreign admin read',async()=>{
  const own=await invoke(owner,'GET /api/products');assert.equal(own.ok,true);assert.equal(own.data.data.list.length,1);assert.equal(own.data.data.list[0].name,'Own tea');
  await assert.rejects(()=>invoke(owner,'GET /api/products/:id',{pathParams:{id:foreignProduct.id}}),/NOT_IN_STORE/);
  await assert.rejects(()=>invoke(owner,'GET /api/config/:storeId/:key',{pathParams:{storeId:other,key:'storeInfo'}}),/STORE_MISMATCH/);
  await assert.rejects(()=>invoke(owner,'GET /api/products',{query:{storeId:other}}),/STORE_MISMATCH/);
  assert.equal(canAccessStore({...owner,storeBound:true},other),false);assert.equal(canAccessStore(owner,other),true);
 });
 await check('native validator rejects invalid write; valid native update persists',async()=>{
  const invalid=await invoke(owner,'POST /api/products',{body:{storeId,name:'Missing category'}});assert.equal(invalid.ok,false);assert.equal(invalid.statusCode,400);
  const saved=await invoke(owner,'PUT /api/products/:id',{pathParams:{id:product.id},body:{name:'Native updated tea'}});assert.equal(saved.ok,true);assert.equal((await db.product.findUnique({where:{id:product.id}})).name,'Native updated tea');
  const denied=await invoke(employee,'PUT /api/products/:id',{pathParams:{id:product.id},body:{name:'DENIED'}});assert.equal(denied.ok,false);assert.equal((await db.product.findUnique({where:{id:product.id}})).name,'Native updated tea');
 });
 await check('expired account attestation and inactive employee are not accepted',async()=>{
  const denied=await invoke({...owner,issuedAtMs:1},'GET /api/products');assert.equal(denied.statusCode,401);
  await db.staff.update({where:{id:employee.staffId},data:{status:'inactive'}});
  assert.equal((await invoke(employee,'GET /api/products')).statusCode,401);
  await db.staff.update({where:{id:employee.staffId},data:{status:'active'}});
 });
 await check('native config envelopes and batch items cannot expose or replace credentials',async()=>{
  for(const key of ['apiSettings','integration.meta','xendit.connection','team.communication.ai.settings','staff.access.policy']){
   const read=await invoke(owner,'GET /api/config/:storeId/:key',{pathParams:{storeId,key}});assert.equal(read.executed,false);assert.equal(read.code,'ACCOUNT_OR_SYSTEM_CONFIGURATION');
   const batch=await invoke(owner,'POST /api/config/batch',{body:{configs:[{storeId,key,value:'SECRET',category:'store'}]}});assert.equal(batch.executed,false);
  }
  await db.config.create({data:{storeId,key:'apiSettings',category:'store',value:JSON.stringify({apiKey:'SECRET_SENTINEL'})}});
  await db.config.create({data:{storeId,key:'storeInfo',category:'store',value:JSON.stringify({name:'Own Store',apiKey:'NESTED_SENTINEL'})}});
  const list=await invoke(owner,'GET /api/config');assert(!JSON.stringify(list).includes('SENTINEL'));assert(!('apiSettings'in list.data.data));assert.equal(list.data.data.storeInfo.name,'Own Store');
  assert(!JSON.stringify(policy.redactBackendSecrets({key:'ordinary',value:JSON.stringify({api_key:'ENCODED_SENTINEL',name:'safe'})})).includes('SENTINEL'));
 });
 await check('native payment and publication cannot escape via endpoint or omitted status',async()=>{
  for(const id of ['POST /api/purchase-orders/:id/confirm-payment','PUT /api/salaries/:id/mark-paid']){
   const r=await invoke(owner,id,{pathParams:{id:randomUUID()}});assert.equal(r.code,'OWNER_APPROVAL_REQUIRED');assert.equal(r.executed,false);
  }
  const r=await invoke(owner,'POST /api/marketing/activities',{body:{name:'not published',status:'published'}});assert.equal(r.code,'EXPLICIT_ACTIVITY_PUBLICATION_REQUIRED');assert.equal(r.executed,false);
  for(const [id,body]of[['POST /api/staff-points/adjust',{points:-1}],['POST /api/salaries/adjustments',{type:'penalty'}]])assert.equal(policy.backendInputBoundary({...description(id),effect:'business'}, {body}),'OWNER_APPROVAL_REQUIRED');
  assert.equal(policy.backendInputBoundary({...description('PUT /api/staff/:id'),effect:'business',permission:'staff.write'},{body:{role:'admin'}}),null); // native account/role middleware remains authoritative
  for(const path of ['/api/marketing/discount-rules','/api/marketing/timed-specials']){
   for(const status of ['draft','paused','ended'])assert.equal(policy.backendInputBoundary({...description('POST '+path),effect:'business'},{body:{status}}),'EXPLICIT_ACTIVITY_PUBLICATION_REQUIRED');
   assert.equal(policy.backendInputBoundary({...description('POST '+path),effect:'business'},{body:{status:'inactive'}}),null);
  }
  for(const id of ['POST /api/expenses/pos','POST /api/expenses/:id/payment-source','POST /api/marketing/automation/run','POST /api/marketing/automation/run/:campaignId']){const d=description(id);assert.equal(policy.backendEffect(id,d.path,d.method,'finance.write'),'payment')}
  assert.equal(policy.backendInputBoundary({...description('POST /api/expenses'),effect:'business'},{body:{paymentSource:'drawer_cash'}}),'OWNER_APPROVAL_REQUIRED');
  const ai=description('POST /api/team/channels/:id/ai/drafts');assert.equal(policy.backendEffect(ai.id,ai.path,ai.method,'personal.messages'),'security');
 });
 await check('one entry saves and updates native draft activity with native version contract',async()=>{
  const body={name:'Native draft fixture',type:'fixed',memberOnly:true,productIds:[product.id],rule:{amount:4000}};
  const created=await invoke(owner,'POST /api/marketing/activities',{body});assert.equal(created.ok,true);assert.equal(created.data.data.status,'draft');
  const a=created.data.data,{id,storeId:_store,version,used,source,conflict,state,...editable}=a;
  const updated=await invoke(owner,'PUT /api/marketing/activities/:id',{pathParams:{id},body:{...editable,version,name:'Updated native draft fixture'}});assert.equal(updated.ok,true);assert.equal(updated.data.data.version,version+1);assert.equal(updated.data.data.status,'draft');
  const stale=await invoke(owner,'PUT /api/marketing/activities/:id',{pathParams:{id},body:{...editable,version,name:'Stale replacement'}});assert.equal(stale.ok,false);
  const read=await invoke(owner,'GET /api/marketing/activities');assert.equal(read.data.data.find(a=>a.id===id).name,'Updated native draft fixture');
 });
 await check('legacy module switches do not create a second account permission system',async()=>{
  const {writeTeam}=built('services/TeamCommunicationService');
  await writeTeam(db,storeId,'ai.agent.settings',{enabled:true,employeeBridgeEnabled:true,permissions:{products:{read:false,write:false}}});
  const scope={compartmentKey:'native-account-scope',requesterStaffId:owner.staffId,audienceStaffIds:[owner.staffId]},g={storeId};
  const args={action:'execute',operationId:'PUT /api/products/:id',contractVersion:api.backendVersion(),pathParams:{id:product.id},body:{name:'Native account authority'}};
  const reservation=await tools.reserveBackendOperation(db,storeId,scope,'module-removal-source','module-removal-run','module-removal-call',args);
  const saved=await tools.executeBackendTool(db,g,scope,'module-removal-source',args,reservation,async()=>{});
  assert.equal(saved.ok,true);assert.equal((await db.product.findUnique({where:{id:product.id}})).name,'Native account authority');
  const denied=await invoke(employee,'PUT /api/products/:id',{pathParams:{id:product.id},body:{name:'UNAUTHORIZED'}});
  assert.equal(denied.ok,false);assert.equal((await db.product.findUnique({where:{id:product.id}})).name,'Native account authority');
  await db.config.delete({where:{storeId_key:{storeId,key:'team.communication.ai.agent.settings'}}});
 });
 await check('upgrades invalidate captured contract before native dispatch',async()=>{
  const before=await db.product.findUnique({where:{id:product.id}});
  const prior=api.backendVersion();process.env.APP_SOURCE_SHA='synthetic-new-reviewed-sha';assert.notEqual(api.backendVersion(),prior);
  const result=await api.invokeManagementBackend(db,owner,{operationId:'PUT /api/products/:id',contractVersion:prior,pathParams:{id:product.id},body:{name:'OLD_CONTRACT'}});assert.equal(result.code,'BACKEND_CONTRACT_CHANGED');assert.equal(result.executed,false);
  assert.equal((await db.product.findUnique({where:{id:product.id}})).name,before.name);
 });
 await check('native team message writes and finish delivery hook execute normally',async()=>{
  const channel=await invoke(owner,'POST /api/team/channels',{body:{requestId:randomUUID(),title:'Native isolated channel',kind:'group',members:[employee.staffId]}});assert.equal(channel.ok,true);
  const id=channel.data.data.id;
  const reminders=built('services/EmployeeReminderService'),wake=reminders.wakeEmployeeDelivery,woken=[];reminders.wakeEmployeeDelivery=s=>woken.push(s);
  let sent;try{sent=await invoke(owner,'POST /api/team/channels/:id/messages',{pathParams:{id},body:{requestId:randomUUID(),text:'Native isolated message',files:[]}})}finally{reminders.wakeEmployeeDelivery=wake}
  assert.equal(sent.ok,true);assert.equal(sent.data.data.text,'Native isolated message');assert.deepEqual(woken,[storeId]);
  const read=await invoke(owner,'GET /api/team/channels/:id/messages',{pathParams:{id}});assert.equal(read.ok,true);assert(JSON.stringify(read.data).includes('Native isolated message'));
 });
 await check('late native completion survives caller timeout and is never dispatched twice',async()=>{
  const {Router}=require(root+'/server/node_modules/express'),router=Router();let writes=0,finish;
  router.post('/slow',async(_req,res)=>{await new Promise(r=>{finish=r});writes++;res.json({code:200,data:{persisted:true}})});
  router.get('/file',(_req,res)=>res.type('text/plain').send('x'.repeat(1_100_000)));
  router.get('/query',(req,res)=>res.json({code:200,query:req.query}));
  const multer=require(root+'/server/node_modules/multer');router.post('/upload',multer({storage:multer.memoryStorage()}).single('image'),(req,res)=>res.json({code:200,caption:req.body.caption,file:{name:req.file.originalname,type:req.file.mimetype,bytes:req.file.buffer.length,hash:require('node:crypto').createHash('sha256').update(req.file.buffer).digest('hex')}}));
  const route=router.stack[0].route;route.accessSpecs={post:{permission:'products.write',ownerOnly:false,export:false,personal:false,routeKey:'POST /api/isolated-backend-fixture/slow'}};
  router.stack[1].route.accessSpecs={get:{permission:'products.read',ownerOnly:false,export:false,personal:false,routeKey:'GET /api/isolated-backend-fixture/file'}};
  for(const layer of router.stack.slice(2)){const method=layer.route.methods.get?'get':'post';layer.route.accessSpecs={[method]:{permission:'products.'+(method==='get'?'read':'write'),ownerOnly:false,export:false,personal:false,routeKey:method.toUpperCase()+' /api/isolated-backend-fixture'+layer.route.path}}}
  api.registerManagementRouter('/api/isolated-backend-fixture',router);
  const scope={compartmentKey:'late-scope',requesterStaffId:owner.staffId,audienceStaffIds:[owner.staffId]},g={storeId};
  const args={action:'execute',operationId:'POST /api/isolated-backend-fixture/slow',contractVersion:api.backendVersion(),body:{}};
  const reservation=await tools.reserveBackendOperation(db,storeId,scope,'late-source','late-execution','late-call',args);
  const pending=tools.executeBackendTool(db,g,scope,'late-source',args,reservation,async()=>{});
  while(!finish)await new Promise(r=>setTimeout(r,5));
  const during=await tools.executeBackendTool(db,g,scope,'late-source',{action:'status',receiptId:reservation.id});assert.equal(during.state,'running');assert.equal(during.retryAllowed,false);
  const restart=await tools.reserveBackendOperation(db,storeId,scope,'late-source','late-execution','late-call',args);
  assert.equal((await tools.executeBackendTool(db,g,scope,'late-source',args,restart,async()=>{throw Error('MUST_NOT_DISPATCH')})).code,'BACKEND_OUTCOME_UNKNOWN');
  finish();assert.equal((await pending).ok,true);assert.equal(writes,1);
  const result=await tools.executeBackendTool(db,g,scope,'late-source',{action:'status',receiptId:reservation.id});assert.equal(result.state,'complete');assert.equal(result.data.data.persisted,true);assert.equal(writes,1);
  const file=await invoke(owner,'GET /api/isolated-backend-fixture/file');assert.equal(file.ok,true);assert(file.artifact.id);assert.equal(file.artifact.type,'text/plain');
  const fs=require('node:fs/promises'),{accountFile}=built('services/NativeBackendFiles');const stored=await accountFile(db,owner,file.artifact.id);assert.equal((await fs.readFile(stored.filename)).length,1_100_000);assert.equal(file.artifact.size,1_100_000);await assert.rejects(()=>accountFile(db,employee,file.artifact.id),/FILE_FORBIDDEN/);
  const queryResult=await invoke(owner,'GET /api/isolated-backend-fixture/query',{query:{status:['draft','paused'],filter:{name:'Tea'}}});assert.deepEqual(queryResult.data.query.status,['draft','paused']);assert.equal(queryResult.data.query.filter.name,'Tea');
  const {storeNativeDownload}=built('services/NativeBackendFiles'),bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=','base64');
  const inputFile=await storeNativeDownload(db,owner,bytes,'image/png','synthetic-file-input');
  const {nativeMultipart}=built('services/NativeBackendFiles');await assert.rejects(()=>nativeMultipart(db,owner,{caption:'PRIVATE_OWNER_FINANCE'},[{field:'files',fileId:inputFile.id}],true),/PRIVATE_FILE_CANNOT_BECOME_PUBLIC/);
  const publicDir=path.join(built('utils/mediaFiles').uploadRoot,'attachments'),before=await fs.readdir(publicDir);
  await assert.rejects(()=>invoke(owner,'POST /api/upload/attachment',{files:[{field:'files',fileId:inputFile.id}]}),/PRIVATE_FILE_CANNOT_BECOME_PUBLIC/);
  assert.deepEqual(await fs.readdir(publicDir),before,'private file was never written to the public directory');
  const upload=await invoke(owner,'POST /api/isolated-backend-fixture/upload',{body:{caption:'Real native multipart'},files:[{field:'image',fileId:inputFile.id}]});
  assert.equal(upload.ok,true);assert.equal(upload.data.caption,'Real native multipart');assert.equal(upload.data.file.bytes,bytes.length);assert.equal(upload.data.file.hash,inputFile.sha256);

 });
 await check('native Hermes communication is labelled as agent and cannot become human takeover or loop',async()=>{
  const {writeTeam,readTeam}=built('services/TeamCommunicationService');
  const channel=await invoke(owner,'POST /api/team/channels',{body:{requestId:randomUUID(),title:'Native Hermes identity fixture',kind:'group',members:[employee.staffId]}}),id=channel.data.data.id;
  await writeTeam(db,storeId,'workflow.policy.'+id,{enabled:true,automaticSend:true,operatorStaffId:owner.staffId,paused:false,origin:'manual',version:1,epoch:1});
  const scope={compartmentKey:'native-agent-scope',requesterStaffId:owner.staffId,audienceStaffIds:[owner.staffId]},g={storeId,agentId:randomUUID(),version:1,clientRevision:1,displayName:'Hermes fixture'};
  const args={action:'execute',operationId:'POST /api/team/channels/:id/messages',contractVersion:api.backendVersion(),pathParams:{id},body:{requestId:randomUUID(),text:'Agent message fixture',expectedLastSeq:channel.data.data.lastSeq,files:[]}};
  const reservation=await tools.reserveBackendOperation(db,storeId,scope,'native-agent-source','native-agent-execution','native-agent-call',args);
  // Provenance alone is deliberately insufficient for publishing to staff.
  const withoutCapability=await tools.executeBackendTool(db,g,scope,'native-agent-source',args,reservation,async()=>{});assert.equal(withoutCapability.ok,false);
  assert.equal((await readTeam(db,storeId,'channel.'+id)).lastSeq,0);
  const cleanScope={...scope,compartmentKey:'target-scoped-native-fixture',channelId:id,audienceStaffIds:[owner.staffId,employee.staffId]};
  const cleanArgs={...args,body:{...args.body,requestId:randomUUID()}},cleanReservation=await tools.reserveBackendOperation(db,storeId,cleanScope,'target-shared-source','target-native-execution','target-native-call',cleanArgs);
  let admitted=0;
  const result=await tools.executeBackendTool(db,g,cleanScope,'target-shared-source',cleanArgs,cleanReservation,async()=>{},{check:async(_tx,target)=>{assert.equal(target.channelId,id);assert.deepEqual(target.members.map(m=>m.staffId).sort(),cleanScope.audienceStaffIds.slice().sort());admitted++;}});
  assert.equal(result.ok,true,JSON.stringify(result));assert(admitted>0);
  const message=result.data.data;assert.equal(message.agent.agentId,g.agentId);assert.equal(message.authorName,'Hermes fixture');assert.equal(message.authorId,'agent:'+g.agentId);assert.equal(message.actorStaffId,owner.staffId);
  assert.equal((await readTeam(db,storeId,'workflow.policy.'+id)).paused,false);
  const legacy={...message,authorId:owner.staffId};await writeTeam(db,storeId,'message.'+id+'.'+String(message.seq).padStart(12,'0'),legacy);
  const taskId=randomUUID();await writeTeam(db,storeId,'task.'+id+'.'+taskId,{id:taskId,channelId:id,ownerId:owner.staffId,fromSeq:1,status:'accepted',version:1,events:[]});
  await assert.rejects(built('services/TeamCommunicationService').teamCommunication(db).taskAction(owner,id,taskId,{requestId:randomUUID(),expectedVersion:1,action:'submit',note:'Cannot use an AI reply as my own evidence',sourceSeq:[legacy.seq]}),e=>e.message==='TEAM_TASK_EVIDENCE_REQUIRED');

  await built('services/TeamWorkflowQueue').enqueueTeamWorkflow(db,owner,{id},message,{read:()=>{throw Error('AGENT_MUST_NOT_TRIGGER_ANOTHER_AI')},write:()=>{throw Error('AGENT_MUST_NOT_TRIGGER_ANOTHER_AI')}});
  const forged=await invoke(owner,'POST /api/team/channels/:id/messages',{pathParams:{id},body:{requestId:randomUUID(),text:'forged',agent:{agentId:g.agentId}}});assert.equal(forged.ok,false);
 });
 await check('two-phase operation receipt prevents replay and rechecks audience',async()=>{
  const scope={compartmentKey:'scope-A',requesterStaffId:owner.staffId,audienceStaffIds:[owner.staffId]},g={storeId};
  const args={action:'execute',operationId:'PUT /api/products/:id',contractVersion:api.backendVersion(),pathParams:{id:product.id},body:{name:'Once only'}};
  const reservation=await tools.reserveBackendOperation(db,storeId,scope,'source-message','execution-one','call-one',args);
  const first=await tools.executeBackendTool(db,g,scope,'source-message',args,reservation,async()=>{});assert.equal(first.ok,true);assert.equal(first.state,'complete');
  await db.product.update({where:{id:product.id},data:{name:'Later change'}});
  const secondReservation=await tools.reserveBackendOperation(db,storeId,scope,'source-message','execution-one','call-one',args);assert.equal(secondReservation.created,false);
  const second=await tools.executeBackendTool(db,g,scope,'source-message',args,secondReservation,async()=>{throw Error('MUST_NOT_DISPATCH')});assert.equal(second.receiptId,first.receiptId);assert.equal((await db.product.findUnique({where:{id:product.id}})).name,'Later change');
  const sameEvent=await tools.reserveBackendOperation(db,storeId,scope,'source-message','different-execution','different-tool-call',args);assert.equal(sameEvent.created,false);assert.equal(sameEvent.id,first.receiptId);
  assert.equal((await tools.executeBackendTool(db,g,scope,'source-message',args,sameEvent,async()=>{throw Error('MUST_NOT_DUPLICATE_SOURCE_EVENT')})).receiptId,first.receiptId);
  assert.equal((await db.product.findUnique({where:{id:product.id}})).name,'Later change');
  await assert.rejects(()=>tools.reserveBackendOperation(db,storeId,scope,'source-message','execution-one','call-one',{...args,body:{name:'changed'}}),/IDENTITY_CHANGED/);
  const foreign=await tools.executeBackendTool(db,g,{...scope,compartmentKey:'scope-B'},'source-message',{action:'status',receiptId:first.receiptId});assert.equal(foreign.code,'BACKEND_RECEIPT_NOT_VISIBLE');
  await db.staff.update({where:{id:employee.staffId},data:{status:'inactive'}});
  const revoked=await tools.executeBackendTool(db,g,{...scope,audienceStaffIds:[employee.staffId]},'source-message',{action:'status',receiptId:first.receiptId});assert.equal(revoked.detailsWithheld,true);
  await db.staff.update({where:{id:employee.staffId},data:{status:'active'}});
  const reserved=await tools.reserveBackendOperation(db,storeId,scope,'source-message-crash','execution-crash','call-one',args);
  const restart=await tools.reserveBackendOperation(db,storeId,scope,'source-message-crash','execution-crash','call-one',args);assert.equal(restart.created,false);
  const unknown=await tools.executeBackendTool(db,g,scope,'source-message-crash',args,restart,async()=>{throw Error('MUST_NOT_REPLAY')});assert.equal(unknown.code,'BACKEND_OUTCOME_UNKNOWN');assert.equal(unknown.retryAllowed,false);
  const denied=await tools.executeBackendTool(db,g,scope,'source-message-crash',args,reserved,async()=>{throw Error('AUTHORITY_REVOKED')});assert.equal(denied.state,'blocked');assert.equal(denied.mayHaveExecuted,false);
 });
 await check('native shared publications enforce recipients independently of private parent',async()=>{
  const {bindNativeBackendPublication}=built('services/ManagementBackendIdentity');
  owner.nativeAgent={agentId:randomUUID(),grantVersion:1,clientRevision:1,executionId:'private-parent',name:'Hermes'};
  const body={storeId,title:'Private finance sentinel',content:'PRIVATE_OWNER_FINANCE Rp123456789',type:'general',isActive:true};
  try{
   bindNativeBackendPublication(owner,{check:async(_db,target)=>{if(target.members.some(m=>m.staffId!==owner.staffId))throw Error('BACKEND_TARGET_CONTEXT_REQUIRED')}});
   const denied=await invoke(owner,'POST /api/announcement',{body});assert.equal(denied.ok,false);assert.match(denied.data.message,/BACKEND_TARGET_CONTEXT_REQUIRED/);assert.equal(await db.announcement.count({where:{storeId,content:body.content}}),0);
   const draftDenied=await invoke(owner,'PUT /api/training/library/draft',{body:{requestId:randomUUID(),expectedGeneration:null,note:'PRIVATE_OWNER_FINANCE',catalogue:{}}});assert.equal(draftDenied.ok,false);assert.match(draftDenied.data.message,/BACKEND_TARGET_CONTEXT_REQUIRED/);
   let recipients=[];bindNativeBackendPublication(owner,{check:async(_db,target)=>{recipients=target.members.map(m=>m.staffId)}});
   const saved=await invoke(owner,'POST /api/announcement',{body:{...body,title:'Approved public hygiene guide',content:'Cuci tangan sebelum bekerja.'}});assert.equal(saved.ok,true,JSON.stringify(saved));assert(recipients.includes(employee.staffId));assert(recipients.includes(owner.staffId));
   await db.announcement.deleteMany({where:{storeId}});
  }finally{delete owner.nativeAgent}
 });
 await check('employee discovery explains account denial before collecting activity details or dispatching',async()=>{
  const g={storeId,agentId:randomUUID(),version:1,clientRevision:1},scope={compartmentKey:'employee-acl',requesterStaffId:employee.staffId,audienceStaffIds:[employee.staffId]};
  const catalog=await tools.executeBackendTool(db,g,scope,'employee-question',{action:'catalog',search:'/api/marketing/activities',limit:40});
  const create=catalog.operations.find(op=>op.operationId==='POST /api/marketing/activities');assert(create);assert.equal(create.accountAccess.allowed,false);assert.equal(create.accountAccess.requiredPermission,'marketing.write');assert.equal(catalog.account.role,'staff');
  const described=await tools.executeBackendTool(db,g,scope,'employee-question',{action:'describe',operationId:create.operationId});assert.equal(described.accountAccess.allowed,false);
  const args={action:'execute',operationId:create.operationId,contractVersion:api.backendVersion(),body:{name:'NEVER_CREATE_DENIED_ACTIVITY',status:'draft'}};
  const reservation=await tools.reserveBackendOperation(db,storeId,scope,'employee-question','employee-denied-execution','employee-denied-call',args);
  const denied=await tools.executeBackendTool(db,g,scope,'employee-question',args,reservation,async()=>{});assert.equal(denied.ok,false);assert.equal(denied.state,'blocked');assert.equal(denied.executed,false);assert.equal(denied.mayHaveExecuted,false);
  assert.equal(denied.requiredPermission,'marketing.write');
  const ownerView=api.backendDescription(create.operationId,owner);assert.equal(ownerView.accountAccess.allowed,true);
  const {defaultRolesV2,effectiveAccess}=built('services/StaffPermissionV2Core');
  const policy={version:2,revision:1,active:true,roles:defaultRolesV2,assignments:[{staffId:employee.staffId,roleId:'manager',overrides:{}}]};
  const assigned={...employee,role:'cashier',employeeApp:false,accessRole:effectiveAccess(policy,employee.staffId)};
  assert.equal(assigned.accessRole.id,'manager');assert.equal(api.backendDescription(create.operationId,assigned).accountAccess.allowed,false);
  policy.assignments[0].overrides={'marketing.read':'allow','marketing.write':'allow'};assigned.accessRole=effectiveAccess(policy,employee.staffId);assert.equal(api.backendDescription(create.operationId,assigned).accountAccess.allowed,true);
  policy.assignments[0].overrides={'marketing.read':'allow','marketing.write':'deny'};assigned.accessRole=effectiveAccess(policy,employee.staffId);assert.equal(api.backendDescription(create.operationId,assigned).accountAccess.allowed,false);

 });
 await check('native API jobs recover lost admission, preserve source isolation and deliver long replies',async()=>{
  const {teamCommunication,readTeam,writeTeam}=built('services/TeamCommunicationService');
  const {createNativeStoreAgent}=built('services/NativeStoreAgent');
  const {nativeJobId,nativeJobKey}=built('services/NativeStoreQueue');
  const agentId=randomUUID(),previousFetch=global.fetch,oldEnv={...process.env};
  Object.assign(process.env,{EMPLOYEE_HERMES_ENABLED:'1',EMPLOYEE_HERMES_STORE_ID:storeId,EMPLOYEE_HERMES_AGENT_ID:agentId});
  await writeTeam(db,storeId,'ai.agent.settings',{enabled:true,employeeBridgeEnabled:false,expiresAt:'2000-01-01T00:00:00Z',permissions:{},agentName:'Fixture Hermes'});
  await writeTeam(db,storeId,'ai.settings',{enabled:true,provider:'minimax',model:'MiniMax-M3.1-Flash',version:1});
  let submitted=0,configured=0,lost=false,activeChildren=0,runStatus='completed',cancelled=0,draining=false,statusUnavailable=false;const runs=new Map(),contexts=new Map();
  global.fetch=async(url,options={})=>{
   const pathname=new URL(url).pathname,body=options.body&&JSON.parse(options.body),profile=/profiles\/([a-f0-9]+)/.exec(pathname)?.[1];
   const response=v=>({ok:true,status:200,json:async()=>v});
   if(pathname.endsWith('/native/context')){configured++;contexts.set(body.jobId,body);assert.equal(body.sessionKey,'store_'+profile);assert.equal(body.model,'MiniMax-M3.1-Flash');return response({ok:true})}
   if(pathname.endsWith('/native/admission'))return response(runs.has(body.key)?{state:'reused',run_id:'run_'+body.key}:{state:'missing',run_id:null});
   if(pathname.endsWith('/v1/runs')){const id=options.headers['Idempotency-Key'];if(!runs.has(id)){submitted++;runs.set(id,{profile,body})}if(lost){lost=false;throw Error('synthetic lost acceptance')}return response({run_id:'run_'+id,status:'queued'})}
   if(pathname.endsWith('/native/readiness'))return response({activeRuns:draining?1:0,activeDelegations:activeChildren,activeProcesses:0});
   if(pathname.endsWith('/stop')){cancelled++;return response({status:'cancelled'})}
   if(pathname.includes('/v1/runs/')&&statusUnavailable)throw Error('HERMES_NATIVE_TIMEOUT');
   if(pathname.includes('/v1/runs/'))return response({status:runStatus,output:'SYNTHETIC native SDK result. '.repeat(240)});
   throw Error('UNEXPECTED_NATIVE_URL');
  };
  const engine=createNativeStoreAgent(db,{storeId,agentId,gatewayOrigin:'http://127.0.0.1:8642',gatewayKey:'synthetic-native-key',backendOrigin:'http://host.docker.internal:3000'});
  const create=async(title)=>teamCommunication(db).create(owner,{requestId:randomUUID(),title,kind:'group',members:['agent:'+agentId]});
  try{
   const c=await create('Native original admission');assert.equal((await teamCommunication(db).directory(owner)).filter(person=>person.id.startsWith('agent:')).length,1);
   const m=await teamCommunication(db).send(owner,c.id,{requestId:randomUUID(),text:'Read only, no store mutation.'});
   const key=nativeJobKey(nativeJobId(storeId,c.id,m.id));assert.equal((await readTeam(db,storeId,key)).state,'queued');
   lost=true;await engine.runBatch(1);let j=await readTeam(db,storeId,key);assert.equal(j.state,'admitting');assert.equal(submitted,1);
   delete j.nextAttemptAt;await writeTeam(db,storeId,key,j);await engine.runBatch(1);j=await readTeam(db,storeId,key);assert.equal(j.state,'running');assert.equal(submitted,1);assert.equal(configured,1);
   activeChildren=1;await engine.runBatch(1);assert.equal((await readTeam(db,storeId,key)).state,'waiting_children');
   activeChildren=0;await engine.runBatch(1);j=await readTeam(db,storeId,key);assert.equal(j.state,'completed');assert(j.outputFileId);assert(j.outputMessageId);
   const after=await readTeam(db,storeId,'channel.'+c.id),reply=await readTeam(db,storeId,'message.'+c.id+'.'+String(after.lastSeq).padStart(12,'0'));
   assert.equal(reply.authorId,'agent:'+agentId);assert.equal(reply.actorStaffId,owner.staffId);assert.equal(reply.agent.executionId,j.id);assert.deepEqual(reply.files,[j.outputFileId]);assert(reply.text.length<=4000);
   await engine.runBatch(1);assert.equal((await readTeam(db,storeId,'channel.'+c.id)).lastSeq,after.lastSeq);
   const changed=await create('Queued audience change'),source=await teamCommunication(db).send(owner,changed.id,{requestId:randomUUID(),text:'OWNER_ONLY_SOURCE_SENTINEL'});
   const channel=await readTeam(db,storeId,'channel.'+changed.id);channel.members.push({staffId:employee.staffId,fromSeq:source.seq+1});await writeTeam(db,storeId,'channel.'+changed.id,channel);
   await engine.runBatch(1);const blocked=await readTeam(db,storeId,nativeJobKey(nativeJobId(storeId,changed.id,source.id)));assert.equal(blocked.state,'blocked');assert.equal(blocked.fault,'NATIVE_CONTEXT_CHANGED');assert.equal(submitted,1);
   // Existing owner/employee direct conversations have no physical Agent member.
   // Their old expiry does not become a new runtime capability restriction.
   const direct=await teamCommunication(db).create(owner,{requestId:randomUUID(),title:'Existing employee direct',kind:'direct',members:[employee.staffId]});
   const hash=require('node:crypto').createHash,normalized=direct.members.map(m=>({staffId:m.staffId,fromSeq:m.fromSeq})).sort((a,b)=>a.staffId.localeCompare(b.staffId));
   const audienceHash=hash('sha256').update(JSON.stringify(normalized)).digest('hex');
   await db.config.upsert({where:{storeId_key:{storeId,key:'externalAgent.teamBridge.v1.channel.'+direct.id}},create:{storeId,key:'externalAgent.teamBridge.v1.channel.'+direct.id,category:'test',value:JSON.stringify({agentId,delegatedDirect:{sourceStaffId:employee.staffId,fromSeq:1,audienceHash,expiresAt:'2020-01-01T00:00:00Z'}})},update:{}});
   const question=await teamCommunication(db).send(employee,direct.id,{requestId:randomUUID(),text:'Apa yang harus saya lakukan untuk stok hari ini?'});
   const directKey=nativeJobKey(nativeJobId(storeId,direct.id,question.id));assert.equal((await readTeam(db,storeId,directKey)).state,'queued');
   await db.config.createMany({data:Array.from({length:1001},(_,i)=>({storeId,key:'team.communication.nativeAgent.job.history-'+i,category:'test',createdAt:new Date('2000-01-01T00:00:00Z'),value:JSON.stringify({id:'history-'+i,state:'completed',createdAt:'2000-01-01T00:00:00Z'})}))});
   await engine.runBatch(1);let employeeJob=await readTeam(db,storeId,directKey);assert.equal(employeeJob.state,'running');assert.equal(JSON.parse(employeeJob.input.input).account.authority,'current_requesting_account');assert.notEqual(employeeJob.profileKey,j.profileKey);assert.equal(submitted,2);
   await engine.runBatch(1);employeeJob=await readTeam(db,storeId,directKey);assert.equal(employeeJob.state,'completed');assert(employeeJob.outputMessageId);
   assert.equal((await readTeam(db,storeId,'channel.'+direct.id)).members.length,2);
   const parentSource=await teamCommunication(db).send(owner,c.id,{requestId:randomUUID(),text:'PRIVATE_HUMAN_PROFIT_SENTINEL Rp123456789. 给员工安排卫生 SOP 工作，不要向员工透露利润。'});
   const parentKey=nativeJobKey(nativeJobId(storeId,c.id,parentSource.id));await engine.runBatch(1);const parent=await readTeam(db,storeId,parentKey);assert.equal(parent.state,'running');
   parent.privateHistory='PARENT_PRIVATE_FINANCE_SENTINEL';await writeTeam(db,storeId,parentKey,parent);
   const app=require(root+'/server/node_modules/express')();app.use(engine.router);const request=require(root+'/server/node_modules/supertest');
   const rpc=async(args)=>request(app).post('/native/backend').set('Authorization','Bearer '+contexts.get(parent.id).callbackCredential).send({jobId:parent.id,sessionId:parent.sessionId,toolCallId:'handoff-call',args});
   const rejected=await rpc({action:'handoff',targetChannelId:direct.id,goal:'PARENT_PRIVATE_FINANCE_SENTINEL'});assert.equal(rejected.status,409);
   const first=await rpc({action:'handoff',targetChannelId:direct.id,operationId:'GET /api/products',guideId:'hygiene-check'});assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.parentHistoryTransferred,false);assert.equal(first.body.parentAttachmentsTransferred,false);
   const repeat=await rpc({action:'handoff',targetChannelId:direct.id,operationId:'GET /api/products',guideId:'hygiene-check'});assert.equal(repeat.body.jobId,first.body.jobId);
   const childKey=nativeJobKey(first.body.jobId);let child=await readTeam(db,storeId,childKey);assert.equal(child.authorizationChannelId,c.id);assert.equal(child.channelId,direct.id);assert(!JSON.stringify(child).includes('PARENT_PRIVATE_FINANCE_SENTINEL'));
   await engine.runBatch(10);child=await readTeam(db,storeId,childKey);assert.equal(child.state,'running');assert.notEqual(child.profileKey,parent.profileKey);assert(!JSON.stringify(child.input).includes('PARENT_PRIVATE_FINANCE_SENTINEL'));assert(!JSON.stringify(child.input).includes('PRIVATE_HUMAN_PROFIT_SENTINEL'));assert(!JSON.stringify(child.input).includes('123456789'));assert.deepEqual(JSON.parse(child.input.input).currentRequest.files,[]);
   await engine.runBatch(10);child=await readTeam(db,storeId,childKey);assert.equal(child.state,'completed');assert(child.outputMessageId);
   const finalChannel=await readTeam(db,storeId,'channel.'+direct.id),finalMessage=await readTeam(db,storeId,'message.'+direct.id+'.'+String(finalChannel.lastSeq).padStart(12,'0'));
   assert.equal(finalMessage.agent.executionId,child.id);assert.equal(finalMessage.agent.replyToSeq,undefined);assert(!finalMessage.text.includes('PARENT_PRIVATE_FINANCE_SENTINEL'));
   const slow=await create('Bounded request'),slowSource=await teamCommunication(db).send(owner,slow.id,{requestId:randomUUID(),text:'Read only request that stalls'});
   const slowKey=nativeJobKey(nativeJobId(storeId,slow.id,slowSource.id));await engine.runBatch(10);let stalled=await readTeam(db,storeId,slowKey);assert.equal(stalled.state,'running');
   stalled.startedAt=new Date(Date.now()-11*60000).toISOString();await writeTeam(db,storeId,slowKey,stalled);
   runStatus='running';statusUnavailable=true;draining=true;await engine.runBatch(10);assert.equal((await readTeam(db,storeId,slowKey)).state,'running');assert(cancelled>0);
   statusUnavailable=false;runStatus='cancelled';await engine.runBatch(10);assert.equal((await readTeam(db,storeId,slowKey)).state,'running');
   draining=false;await engine.runBatch(10);stalled=await readTeam(db,storeId,slowKey);assert.equal(stalled.state,'unknown');assert.equal(stalled.fault,'NATIVE_RUN_DEADLINE');assert(stalled.outputMessageId);
   assert.equal((await readTeam(db,storeId,'nativeAgent.channel.'+slow.id)).jobId,null);
   const status=await built('services/TeamCommunicationService').projectOwnAiHandling(db,owner,await readTeam(db,storeId,'channel.'+slow.id),[slowSource]);assert.equal(status.get(slowSource.id).state,'failed');assert.equal(status.get(slowSource.id).failureReason,'timeout');
   runStatus='completed';statusUnavailable=false;



  }finally{global.fetch=previousFetch;for(const k of ['EMPLOYEE_HERMES_ENABLED','EMPLOYEE_HERMES_STORE_ID','EMPLOYEE_HERMES_AGENT_ID']){if(oldEnv[k]===undefined)delete process.env[k];else process.env[k]=oldEnv[k]}}
 });
 console.log(JSON.stringify({suite:'management-backend',passed:passed.length,checks:passed,production:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await db.$disconnect();await built('config/database').default.$disconnect()});
