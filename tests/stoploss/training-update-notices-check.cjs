/* Only the wrapper-owned disposable PostgreSQL database may run this service integration test. */
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const url=new URL(process.env.DATABASE_URL||'http://invalid');
assert.equal(url.pathname,'/training_notices_test');assert.equal(url.hostname,'127.0.0.1');
assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));assert(process.env.UPLOADS_PATH?.includes(process.env.BT_TEST_RUN));
require(require.resolve('tsx/cjs',{paths:[path.join(root,'server')]}));
const prisma=require(path.join(root,'server/src/config/database.ts')).default;
const library=require(path.join(root,'server/src/services/TrainingLibraryStore.ts'));
const {listWork,writeWork}=require(path.join(root,'server/src/services/EmployeeWorkspaceStore.ts'));
const seed=require(path.join(root,'server/src/data/training-library.json'));
const clone=value=>JSON.parse(JSON.stringify(value));
let generation=null;
const actor={id:'training-owner',storeId:'training-a',role:'admin'};
const notices=()=>listWork('training-a','reminder.');
async function save(catalogue){const result=await library.writeTrainingLibrary(actor,'save',{requestId:randomUUID(),expectedGeneration:generation,catalogue});generation=result.generation;return result}
async function publish(input={}){const body={requestId:randomUUID(),expectedGeneration:generation,...input};const result=await library.writeTrainingLibrary(actor,'publish',body);generation=result.generation;return{body,result}}
async function pass(name,fn){await fn();console.log('PASS',name)}
(async()=>{
 try{
 const tenant=await prisma.tenant.create({data:{name:'Synthetic training notices tenant'}});
 for(const id of ['training-a','training-b'])await prisma.store.create({data:{id,tenantId:tenant.id,name:'Synthetic '+id}});
 for(const [id,storeId,status,role]of [['alice','training-a','active','staff'],['bob','training-a','active','manager'],['inactive','training-a','inactive','staff'],['outsider','training-b','active','staff']]){
   await prisma.user.create({data:{id:'user-'+id,phone:'synthetic-training-'+id,password:'unused-synthetic-password',role,storeId,staff:{create:{id:'staff-'+id,name:'Synthetic '+id,employeeNumber:'TRAINING-'+id,storeId,status}}}})
 }
 const content=clone(seed);
 await pass('draft and initial unchanged publication do not notify',async()=>{await save(content);assert.equal((await notices()).length,0);await publish();assert.equal((await notices()).length,0)});
 let first;
 await pass('actual publication creates deterministic individual events for current active store staff',async()=>{
   content.modules[0].title.zh+=' · synthetic changed';await save(content);assert.equal((await notices()).length,0);
   first=await publish();const rows=await notices();assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.staffId).sort(),['staff-alice','staff-bob']);
   for(const row of rows){assert.equal(row.userId,'user-'+row.staffId.replace('staff-',''));assert.equal(row.read,false);assert.equal(row.status,'pending');assert(!row.title.includes('synthetic changed'));const route=new URL(row.url,'http://synthetic');assert.equal(route.pathname,'/training');assert.equal(route.searchParams.get('module'),content.modules[0].key);assert.equal(route.searchParams.get('notice'),row.id);assert(await library.trainingUpdateRelevant(prisma,'training-a',row,row.staffId));}
 });
 await pass('request replay and conflicting retry do not duplicate events',async()=>{
   assert.equal((await library.writeTrainingLibrary(actor,'publish',first.body)).replayed,true);assert.equal((await notices()).length,2);
   await assert.rejects(library.writeTrainingLibrary(actor,'publish',{...first.body,note:'different'}),/TRAINING_REQUEST_CONFLICT/);
 });
 await pass('draft/metadata-only publish is silent and does not invalidate current unchanged content',async()=>{
   const note=clone(content);note.modules[0].reviewed=false;note.modules[0].sections[0].key='new-internal-section-id';
   if(note.modules[0].quiz[0])note.modules[0].quiz[0].key='new-internal-question-id';
   await save(note);assert.equal((await notices()).length,2);await publish({note:'Only editor metadata changed'});assert.equal((await notices()).length,2);
   assert(await library.trainingUpdateRelevant(prisma,'training-a',(await notices())[0],(await notices())[0].staffId));
 });
 await pass('new version invalidates old item notice while checklist changes target only that checklist',async()=>{
   content.modules[0].sections[0].points[0].zh+=' synthetic second version';content.checklists[0].items[0].zh+=' synthetic standard update';
   await save(content);await publish();const rows=await notices();assert.equal(rows.length,6);
   for(const row of rows.filter(row=>row.trainingUpdate.revision===first.result.revision))assert.equal(await library.trainingUpdateRelevant(prisma,'training-a',row,row.staffId),false);
   const checks=rows.filter(row=>row.trainingUpdate.kind==='checklist');assert.equal(checks.length,2);for(const row of checks){const route=new URL(row.url,'http://synthetic');assert.equal(route.searchParams.get('tab'),'checklists');assert.equal(route.searchParams.get('item'),content.checklists[0].key)}
 });
 await pass('removal and identical reintroduction preserve prior read receipts without repeated alerts',async()=>{
   const current=(await notices()).find(row=>row.staffId==='staff-alice'&&row.trainingUpdate.kind==='module'&&row.trainingUpdate.revision===generation);
   await writeWork('training-a',`reminder.${current.staffId}.${current.id}`,{...current,read:true});
   const reduced=clone(content);reduced.modules=reduced.modules.filter(m=>m.key!==content.modules[0].key);if(reduced.assessment)reduced.assessment.rows=reduced.assessment.rows.filter(r=>r.key!==content.modules[0].key);
   await save(reduced);await publish();assert.equal(await library.trainingUpdateRelevant(prisma,'training-a',current,current.staffId),false);
   await save(content);await publish();assert.equal((await notices()).length,6);assert.equal((await notices()).find(r=>r.id===current.id).read,true);assert(await library.trainingUpdateRelevant(prisma,'training-a',current,current.staffId));
 });
 await pass('staff deactivation, store move, rebinding and forged recipient metadata cannot expose old updates',async()=>{
   const row=(await notices()).find(r=>r.staffId==='staff-alice'&&r.trainingUpdate.kind==='checklist');
   assert.equal(await library.trainingUpdateRelevant(prisma,'training-a',row,'staff-bob'),false);assert.equal(await library.trainingUpdateRelevant(prisma,'training-b',row,row.staffId),false);
   await prisma.staff.update({where:{id:row.staffId},data:{status:'inactive'}});assert.equal(await library.trainingUpdateRelevant(prisma,'training-a',row,row.staffId),false);
   await prisma.staff.update({where:{id:row.staffId},data:{status:'active',storeId:'training-b'}});assert.equal(await library.trainingUpdateRelevant(prisma,'training-a',row,row.staffId),false);
   await prisma.staff.update({where:{id:row.staffId},data:{storeId:'training-a'}});
   await prisma.user.create({data:{id:'rebound-user',phone:'synthetic-rebound',password:'unused',role:'staff',storeId:'training-a'}});
   await prisma.staff.update({where:{id:row.staffId},data:{userId:'rebound-user'}});assert.equal(await library.trainingUpdateRelevant(prisma,'training-a',row,row.staffId),false);
   await prisma.staff.update({where:{id:row.staffId},data:{userId:'user-alice'}});assert.equal(await library.trainingUpdateRelevant(prisma,'training-a',{...row,userId:'old-binding'},row.staffId),false);
 });
 await pass('notification persistence failure rolls back publication head and version',async()=>{
   const changed=clone(content);changed.modules[1].title.zh+=' rollback test';await save(changed);const draftGeneration=generation,requestId=randomUUID();
   await prisma.$executeRawUnsafe(`ALTER TABLE "Config" ADD CONSTRAINT training_notice_failure CHECK ("key" NOT LIKE 'employee.workspace.reminder.%') NOT VALID`);
   try{await assert.rejects(library.writeTrainingLibrary(actor,'publish',{requestId,expectedGeneration:generation}))}
   finally{await prisma.$executeRawUnsafe('ALTER TABLE "Config" DROP CONSTRAINT training_notice_failure')}
   assert.equal((await library.editTrainingLibrary(actor)).generation,draftGeneration);assert.equal((await notices()).length,6);
   assert.equal(await prisma.config.findUnique({where:{storeId_key:{storeId:'training-a',key:'training.library.revision:'+requestId}}}),null);
 });
 await pass('concurrent publishers produce one publication and one event per eligible person',async()=>{
   const outcomes=await Promise.allSettled([1,2].map(()=>library.writeTrainingLibrary(actor,'publish',{requestId:randomUUID(),expectedGeneration:generation})));
   assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal((await notices()).length,8);generation=outcomes.find(r=>r.status==='fulfilled').value.generation;
 });
 await pass('new modules and standards create their own exact targets',async()=>{
   const next=clone(await library.readTrainingLibrary(actor));delete next.revision;delete next.preview;
   next.modules.push({...clone(next.modules[0]),key:'added-module'});next.checklists.push({...clone(next.checklists[0]),key:'added-checklist'});
   await save(next);await publish();const rows=(await notices()).filter(r=>r.trainingUpdate.revision===generation);assert.equal(rows.length,4);
   assert.equal(rows.filter(r=>r.trainingUpdate.moduleKey==='added-module').length,2);assert.equal(rows.filter(r=>r.trainingUpdate.itemKey==='added-checklist').length,2);
 });
 await pass('rebinding an account gives the new user an independent receipt when identical content is reintroduced',async()=>{
   const next=clone(await library.readTrainingLibrary(actor));delete next.revision;delete next.preview;
   const reduced=clone(next);reduced.modules=reduced.modules.filter(m=>m.key!=='added-module');
   await save(reduced);await publish();await prisma.staff.update({where:{id:'staff-alice'},data:{userId:'rebound-user'}});
   await save(next);await publish();const rows=await notices();assert.equal(rows.length,13);
   const newReceipt=rows.find(r=>r.userId==='rebound-user'&&r.trainingUpdate.moduleKey==='added-module');assert(newReceipt);assert.equal(newReceipt.read,false);assert(await library.trainingUpdateRelevant(prisma,'training-a',newReceipt,'staff-alice'));
   const oldReceipt=rows.find(r=>r.userId==='user-alice'&&r.trainingUpdate.moduleKey==='added-module');assert(oldReceipt);assert.notEqual(oldReceipt.id,newReceipt.id);assert.equal(await library.trainingUpdateRelevant(prisma,'training-a',oldReceipt,'staff-alice'),false);
 });
 console.log('PASS training publication notices integration (temporary PostgreSQL only)');
 }finally{await prisma.$disconnect()}
})().catch(error=>{console.error(error);process.exitCode=1});
