const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),ts=require(root+'/node_modules/typescript');
const source=ts.transpileModule(fs.readFileSync(root+'/server/src/services/NotificationInboxService.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function fixture(){
 const actor={id:'owner-user',storeId:'store-a',staffId:'owner-staff',role:'admin',employeeApp:false};
 const channel={id:'00000000-0000-4000-8000-000000000001',kind:'direct',ownerId:actor.staffId,members:[{staffId:actor.staffId,fromSeq:1},{staffId:'worker',fromSeq:1}],archived:false};
 const policy={operatorUserId:actor.id,operatorStaffId:actor.staffId,enabled:true,paused:false,automaticSend:true,hash:'policy-hash',epoch:2,audienceHash:hash(JSON.stringify(channel.members)),employeeIds:['worker'],management:{ownerStaffId:actor.staffId,sourceFloor:3,employees:[{staffId:'worker',employeeName:'Najwa'}]}};
 const job={id:'job-id',channelId:channel.id,sourceSeq:3,sourceAuthorId:'worker',operatorUserId:actor.id,operatorStaffId:actor.staffId,status:'awaiting_owner',policyHash:policy.hash,claimEpoch:2,updatedAt:'2026-10-20T00:00:00Z',management:{originalText:'PRIVATE SOURCE SHOULD NOT LEAK',knownFacts:['PRIVATE FACT'],question:'PRIVATE QUESTION'}};
 const marks=new Map();let ownerAvailable=true,employeeAvailable=true;
 const db={user:{findFirst:async q=>{assert.equal(q.where.storeId,'store-a');return ownerAvailable?{id:actor.id}:null},findUnique:async()=>({id:actor.id,storeId:actor.storeId,role:'admin',staff:{id:actor.staffId,storeId:actor.storeId,status:ownerAvailable?'active':'inactive'}})},staff:{findFirst:async q=>{assert.equal(q.where.storeId,'store-a');return employeeAvailable?{id:'worker'}:null}},config:{findMany:async q=>{assert.equal(q.where.storeId,'store-a');return[{key:'team.communication.workflow.job.synthetic',value:JSON.stringify(job)}]}}};
 db.$transaction=async fn=>fn(db);
 const exports={};new Function('require','exports',source)(name=>{
  if(name==='crypto')return crypto;
  if(name.includes('config/database'))return {default:db};
  if(name.includes('TeamCommunicationService'))return {TEAM_PREFIX:'team.communication.',TeamError:class extends Error{constructor(status,msg){super(msg);this.status=status}},readTeam:async(_db,store,key)=>{assert.equal(store,'store-a');return key.startsWith('workflow.policy.')?policy:channel},teamCommunication:()=>({channels:async()=>[]})};
  if(name.includes('EmployeeWorkspaceStore'))return{readWork:async(_store,key)=>marks.get(key)||null,writeWork:async(_store,key,value)=>marks.set(key,value),listWork:async()=>[],workLock:async()=>{}};
  if(name.includes('EmployeePushDeviceService'))return{reminderDeliveryView:r=>({inApp:true,push:'not_confirmed',device:'unknown',read:r.read===true})};
  if(name.includes('EmployeeReminderService'))return{reminderStillRelevant:async()=>true};
  if(name.includes('StaffPermission'))return{};
  throw Error(name);
 },exports);
 return {actor,channel,policy,job,marks,db,exports,ownerOff:()=>ownerAvailable=false,employeeOff:()=>employeeAvailable=false,sources:{approvals:async()=>[],trainingRelevant:async()=>true}};
}
test('owner-only live decision todo is generic, points to actual channel UI and is not a business approval',async()=>{
 const f=fixture(),x=await f.exports.notificationInbox(f.db,f.sources).read(f.actor);assert.equal(x.items.length,1);const item=x.items[0];assert.equal(item.kind,'business_reminder');assert.equal(item.pending,true);assert.equal(item.read,false);assert.equal(item.domain,'team_management');assert.equal(item.url,'/staff/communication?channel='+f.channel.id+'&workflow=1');assert.equal(x.counts.unread,1);assert.equal(x.counts.approvalPending,0);assert(!JSON.stringify(x).includes('PRIVATE'));
});
test('consented group produces the same owner-only todo without requiring a new channel',async()=>{const f=fixture();f.channel.kind='group';f.channel.members.push({staffId:'worker-two',fromSeq:1});f.policy.employeeIds.push('worker-two');f.policy.management.employees.push({staffId:'worker-two',employeeName:'Chyntia'});f.policy.audienceHash=hash(JSON.stringify(f.channel.members));assert.equal((await f.exports.projectManagementOwnerTodos(f.db,f.actor)).length,1)});
test('read marker changes unread state without removing owner decision pending',async()=>{
 const f=fixture(),service=f.exports.notificationInbox(f.db,f.sources),before=await service.read(f.actor);assert.deepEqual(await service.markRead(f.actor,before.items[0].id),{read:true,pending:true});const after=await service.read(f.actor);assert.equal(after.items[0].read,true);assert.equal(after.items[0].pending,true);assert.equal(after.counts.unread,0);
});
test('pending action remains generic and independently unread after an owner question',async()=>{
 const f=fixture(),first=(await f.exports.projectManagementOwnerTodos(f.db,f.actor))[0];f.marks.set('inbox.read.'+f.actor.id+'.'+first.id,{readAt:'now'});f.job.status='pending_action';const next=(await f.exports.projectManagementOwnerTodos(f.db,f.actor))[0];assert.notEqual(first.id,next.id);assert.equal(next.read,false);assert.equal(next.pending,true);assert.match(next.title,/待处理/);
});
for(const [name,mutate] of [
 ['different user',f=>f.job.operatorUserId='someone-else'],['different staff',f=>f.job.operatorStaffId='someone-else'],
 ['removed management consent',f=>delete f.policy.management],['owner rebound',f=>f.policy.management.ownerStaffId='someone-else'],
 ['archived channel',f=>f.channel.archived=true],
 ['owner no longer channel owner',f=>f.channel.ownerId='someone-else'],['member removed',f=>f.channel.members.pop()],['new member added',f=>f.channel.members.push({staffId:'new-person',fromSeq:1})],
 ['history floor advanced',f=>f.channel.members[0].fromSeq=4],['consent source floor advanced',f=>f.policy.management.sourceFloor=4],
 ['source employee revoked',f=>f.employeeOff()],['owner revoked',f=>f.ownerOff()],['employee app',f=>f.actor.employeeApp=true],['non-admin',f=>f.actor.role='cashier'],
 ['resolved record',f=>f.job.status='reviewed'],
])test('todo is hidden after '+name,async()=>{const f=fixture();mutate(f);assert.deepEqual(await f.exports.projectManagementOwnerTodos(f.db,f.actor),[])});

for(const [name,mutate] of [['paused',f=>f.policy.paused=true],['disabled',f=>f.policy.enabled=false],['manual',f=>f.policy.automaticSend=false],['epoch changed',f=>f.policy.epoch++],['policy renewed',f=>f.policy.hash='renewed']])test('unresolved owner work remains visible while execution is '+name,async()=>{const f=fixture();mutate(f);const [item]=await f.exports.projectManagementOwnerTodos(f.db,f.actor);assert(item);assert.equal(item.pending,true);assert(!JSON.stringify(item).includes('PRIVATE'))});
