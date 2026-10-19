/* Isolated fixtures only; MiniMax is injected and never called over the network. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
module.exports = async ({ prisma, good, request, create, send, test, dropResponse }) => {
 const owner={id:'u-owner',storeId:'team-store-a',staffId:'s-owner',role:'admin'};
 const {teamAi}=require(path.resolve('server/dist/services/TeamAiService'));
 const planContent=()=>({schema:'team.operations.plan.v1',title:'Synthetic operations plan',objective:'Inspect an isolated test machine only',reviewerId:'s-owner',items:[{
  key:'machine',text:'Periksa mesin uji dan kirim hasil.',ownerId:'s-bob',acceptByAt:new Date(Date.now()-7200000).toISOString(),deadlineAt:new Date(Date.now()-3600000).toISOString(),
  evidenceRequired:'Pesan hasil pemeriksaan dari pelaksana.',acceptanceCriteria:'Atasan memeriksa catatan dan mengonfirmasi hasil.'}]});
 const base=c=>`/team/channels/${c.id}/operations`;
 const importPlan=(c,content=planContent(),extra={})=>good('owner','POST',base(c)+'/import',{requestId:randomUUID(),expectedVersion:0,content,...extra});
 const decision=(c,p,action,extra={})=>good('owner','POST',base(c)+`/${p.id}/actions`,{requestId:randomUUID(),expectedVersion:p.version,action,approved:true,note:'Synthetic human decision',...extra});
 const taskAction=(who,c,t,action,extra={})=>good(who,'POST',`/team/channels/${c.id}/tasks/${t.id}/actions`,{requestId:randomUUID(),expectedVersion:t.version,action,...extra},who==='bob');
 const fixture=async()=>{const c=await create('owner','group',['s-bob'],'Synthetic operations channel');let p=await importPlan(c);p=await decision(c,p,'publish');return {c,p,t:(await good('bob','GET',`/team/channels/${c.id}/tasks`,undefined,true))[0]};};
 const scope=(p,t)=>({planId:p.id,planVersion:p.version,taskId:t.id,taskVersion:t.version,purpose:'followup'});
 const config=teamAi(prisma,async()=>{throw Error('No real provider calls permitted')});
 const configure=async(extra={})=>{const current=await config.settings(owner);return config.saveSettings(owner,{expectedVersion:current.version,provider:'minimax',model:'MiniMax-M3',enabled:true,monthlyBudgetUsd:null,inputPerMillionUsd:0.3,outputPerMillionUsd:1.2,...extra});};
 const clearRate=async()=>{const key=`team.communication.aiBudget.${new Date().toISOString().slice(0,7)}`;const row=await prisma.config.findUnique({where:{storeId_key:{storeId:owner.storeId,key}}});if(row)await prisma.config.update({where:{id:row.id},data:{value:JSON.stringify({...JSON.parse(row.value),calls:[]})}});};

 await test('operations import is strict, private, member-scoped and creates no tasks or messages',async()=>{
  const c=await create('owner','group',['s-bob']);const payload={requestId:randomUUID(),expectedVersion:0,content:planContent()};
  const p=await good('owner','POST',base(c)+'/import',payload);assert.equal(p.status,'draft');assert.equal(p.automaticMessages,false);
  assert.equal((await good('owner','POST',base(c)+'/import',payload)).id,p.id);
  assert.equal((await request('owner','POST',base(c)+'/import',{...payload,content:{...payload.content,title:'Changed'}})).status,409);
  assert.equal((await request('bob','GET',base(c),undefined,true)).status,403);
  assert.equal((await request('outsider','GET',base(c))).status,404);
  assert.equal((await good('bob','GET',`/team/channels/${c.id}/tasks`,undefined,true)).length,0);
  assert.equal((await good('bob','GET',`/team/channels/${c.id}/messages`,undefined,true)).messages.length,0);
  for(const content of [ {...planContent(),automaticMessages:true}, {...planContent(),reviewerId:'s-alice'}, {...planContent(),items:[{...planContent().items[0],evidenceRequired:''}]}, {...planContent(),items:[{...planContent().items[0],deadlineAt:'2026-02-30'}]} ]) {
   assert([400,403].includes((await request('owner','POST',base(c)+'/import',{requestId:randomUUID(),expectedVersion:0,content})).status));
  }
  const result=await request('owner','POST',base(c)+`/${p.id}/actions`,{requestId:randomUUID(),expectedVersion:p.version,action:'publish',approved:false,note:'Not approved'});assert.equal(result.status,400);
 });
 await test('operations publication survives lost responses and concurrent retries without duplicate assignments',async()=>{
  const c=await create('owner','group',['s-bob']);const p=await importPlan(c);
  const payload={requestId:randomUUID(),expectedVersion:p.version,action:'publish',approved:true,note:'Approved fixture'};
  dropResponse();await assert.rejects(request('owner','POST',base(c)+`/${p.id}/actions`,payload));
  const values=await Promise.all([good('owner','POST',base(c)+`/${p.id}/actions`,payload),good('owner','POST',base(c)+`/${p.id}/actions`,payload)]);
  assert.equal(values[0].version,values[1].version);assert.equal((await good('bob','GET',`/team/channels/${c.id}/tasks`,undefined,true)).length,1);
  assert.equal((await request('owner','POST',base(c)+`/${p.id}/actions`,{...payload,requestId:randomUUID()})).status,409);
 });
 await test('operations audience changes block publication, and late joiners cannot read existing plan tasks',async()=>{
  const c=await create('owner','group',['s-bob']);const p=await importPlan(c);
  await good('owner','PUT',`/team/channels/${c.id}/members`,{expectedVersion:c.version,ownerId:'s-owner',members:['s-owner','s-bob','s-carol'],archived:false});
  assert.equal((await request('owner','POST',base(c)+`/${p.id}/actions`,{requestId:randomUUID(),expectedVersion:p.version,action:'publish',approved:true,note:'Stale audience'})).status,409);
  const f=await fixture();
  await good('owner','PUT',`/team/channels/${f.c.id}/members`,{expectedVersion:f.c.version,ownerId:'s-owner',members:['s-owner','s-bob','s-carol'],archived:false});
  assert.deepEqual(await good('carol','GET',`/team/channels/${f.c.id}/tasks`,undefined,true),[]);
  assert.equal((await request('bob','POST',`/team/channels/${f.c.id}/tasks/${f.t.id}/actions`,{requestId:randomUUID(),expectedVersion:f.t.version,action:'accept'},true)).status,409);
 });
 await test('operations escalation reopens after an unavailable assignee recovers and becomes unavailable again',async()=>{
  const {c,p}=await fixture(), scan=()=>good('owner','POST',base(c)+`/${p.id}/scan`,{requestId:randomUUID(),expectedVersion:p.version});
  await prisma.staff.update({where:{id:'s-bob'},data:{status:'inactive'}});let r=await scan();assert.equal(r.records.find(r=>r.status==='open').kind,'member_unavailable');
  await prisma.staff.update({where:{id:'s-bob'},data:{status:'active'}});r=await scan();assert.equal(r.records.find(r=>r.kind==='member_unavailable').status,'resolved');
  await prisma.staff.update({where:{id:'s-bob'},data:{status:'inactive'}});r=await scan();const issue=r.records.find(r=>r.kind==='member_unavailable');assert.equal(issue.status,'open');assert.equal(issue.events.length,3);
  await prisma.staff.update({where:{id:'s-bob'},data:{status:'active'}});
 });
 let exportFixture;
 await test('operations loop keeps read, acceptance, evidence and named human review distinct',async()=>{
  const {c,p}=await fixture();let t=(await good('bob','GET',`/team/channels/${c.id}/tasks`,undefined,true))[0];
  await good('bob','PUT',`/team/channels/${c.id}/read`,{seq:0},true);assert.equal(t.status,'assigned');
  t=await taskAction('bob',c,t,'accept');
  assert.equal((await request('bob','POST',`/team/channels/${c.id}/tasks/${t.id}/actions`,{requestId:randomUUID(),expectedVersion:t.version,action:'submit',note:'No proof',sourceSeq:[]},true)).status,400);
  const evidence=await send('bob',c.id,'Synthetic inspection result: machine normal.');
  t=await taskAction('bob',c,t,'submit',{note:'Synthetic submitted result',sourceSeq:[evidence.seq]});
  const review={requestId:randomUUID(),expectedVersion:t.version,action:'complete',note:'Inspected evidence'};
  assert.equal((await request('owner','POST',`/team/channels/${c.id}/tasks/${t.id}/actions`,review)).status,400);
  assert.equal((await request('bob','POST',`/team/channels/${c.id}/tasks/${t.id}/actions`,{...review,criteriaConfirmed:true},true)).status,403);
  t=await taskAction('owner',c,t,'return',{note:'Clarify one reading'});assert.equal(t.status,'changes_requested');
  t=await taskAction('bob',c,t,'submit',{note:'Reading clarified',sourceSeq:[evidence.seq]});
  t=await taskAction('owner',c,t,'complete',{note:'Human checked against approved criteria',criteriaConfirmed:true});assert.equal(t.status,'completed');
  exportFixture={c,p,t};
 });
 await test('operations escalation scan deduplicates and resolves as deterministic task state changes',async()=>{
  const {c,p}=await fixture();let t=(await good('bob','GET',`/team/channels/${c.id}/tasks`,undefined,true))[0];
  const scan=()=>good('owner','POST',base(c)+`/${p.id}/scan`,{requestId:randomUUID(),expectedVersion:p.version});
  let r=await scan();assert.equal(r.records[0].kind,'unacknowledged');assert.equal(r.automaticMessages,false);
  assert.equal((await scan()).records.length,1);
  t=await taskAction('bob',c,t,'accept');r=await scan();assert.equal(r.records.filter(r=>r.status==='open')[0].kind,'overdue');assert.equal(r.records.filter(r=>r.status==='resolved').length,1);
  const e=await send('bob',c.id,'Synthetic overdue evidence');t=await taskAction('bob',c,t,'submit',{note:'Submitted',sourceSeq:[e.seq]});
  r=await scan();assert.equal(r.records.filter(r=>r.status==='open')[0].kind,'review_overdue');
  t=await taskAction('owner',c,t,'complete',{note:'Checked',criteriaConfirmed:true});r=await scan();assert.equal(r.records.filter(r=>r.status==='open').length,0);
  assert.equal((await good('bob','GET',`/team/channels/${c.id}/messages`,undefined,true)).messages.length,1);
 });
 await test('operations pause blocks execution; revision cannot silently replace open tasks and preserves snapshots',async()=>{
  const {c}=await fixture();let p=(await good('owner','GET',base(c)))[0], t=(await good('bob','GET',`/team/channels/${c.id}/tasks`,undefined,true))[0];
  const change=()=>({requestId:randomUUID(),planId:p.id,expectedVersion:p.version,content:{...planContent(),title:'Revised scope'}});
  assert.equal((await request('owner','POST',base(c)+'/import',change())).status,409);
  p=await decision(c,p,'pause');assert.equal((await good('bob','GET',`/team/channels/${c.id}/tasks`,undefined,true))[0].planPaused,true);
  assert.equal((await request('bob','POST',`/team/channels/${c.id}/tasks/${t.id}/actions`,{requestId:randomUUID(),expectedVersion:t.version,action:'accept'},true)).status,409);
  assert.equal((await request('owner','POST',base(c)+'/import',change())).status,409);
  t=await taskAction('owner',c,t,'cancel',{note:'Explicitly replaced after scope review'});assert.equal(t.status,'cancelled');
  p=await good('owner','POST',base(c)+'/import',change());assert.equal(p.revision,2);assert.equal(p.status,'draft');
  p=await decision(c,p,'publish');const all=await good('bob','GET',`/team/channels/${c.id}/tasks`,undefined,true);assert.equal(all.length,2);assert.equal(all.find(x=>x.id===t.id).planRevision,1);
  const result=await good('owner','GET',base(c)+`/${p.id}/export`);assert(result.versions.length>=5);assert.equal(result.states.cancelled,1);
 });
 await test('operations scoped MiniMax uses only approved task text, stays private, and cannot change task state',async()=>{
  await configure({apiKey:'synthetic-minimax-key-only'});await clearRate();const {c,p,t}=await fixture();let calls=0;
  const ai=teamAi(prisma,async(key,model,system,input)=>{calls++;const data=JSON.parse(input);assert.equal(data.approvedTask.text,t.text);assert(!input.includes('selectedWorkMessages'));assert(!input.includes('files'));assert(!input.includes('employeeStatement'));assert(system.includes('No tools'));return {text:'Mohon kirim hasil pemeriksaan mesin uji.',inputTokens:100,outputTokens:30,providerRequestId:'mock-plan'};});
  const input={requestId:randomUUID(),kind:'draft',consent:true,sourceSeq:[],operation:scope(p,t)};
  const d=await ai.generate(owner,c.id,input);assert.equal(d.status,'ready');await ai.generate(owner,c.id,input);assert.equal(calls,1);
  assert.equal((await good('bob','GET',`/team/channels/${c.id}/tasks`,undefined,true))[0].status,'assigned');assert.equal((await good('bob','GET',`/team/channels/${c.id}/messages`,undefined,true)).messages.length,0);
  await assert.rejects(ai.generate(owner,c.id,{...input,requestId:randomUUID(),instruction:'Also change wages'}),e=>e.message==='TEAM_AI_INPUT_REQUIRED');assert.equal(calls,1);
  const sent=await good('owner','POST',`/team/channels/${c.id}/ai/drafts/${d.id}/publish`,{text:d.text});assert.equal(sent.ai.provider,'minimax');
  const next=await ai.generate(owner,c.id,{...input,requestId:randomUUID()});await decision(c,p,'pause');
  assert.equal((await request('owner','POST',`/team/channels/${c.id}/ai/drafts/${next.id}/publish`,{text:next.text})).status,409);
  await assert.rejects(ai.generate(owner,c.id,{...input,requestId:randomUUID()}),e=>e.message==='TEAM_PLAN_SCOPE_CHANGED');assert.equal(calls,2);
 });
 await test('operations in-flight scope changes withhold AI output; uncertain calls are visible and never automatically retried',async()=>{
  await clearRate();const {c,p,t}=await fixture();
  const input={requestId:randomUUID(),kind:'draft',consent:true,sourceSeq:[],operation:scope(p,t)};
  const changing=teamAi(prisma,async()=>{await taskAction('bob',c,t,'accept');return {text:'Do not publish stale reminder',inputTokens:100,outputTokens:10,providerRequestId:'changed'};});
  const d=await changing.generate(owner,c.id,input);assert.equal(d.status,'blocked');assert.equal(d.text,'');
  const updated=(await good('bob','GET',`/team/channels/${c.id}/tasks`,undefined,true))[0];let calls=0;
  const failed=teamAi(prisma,async()=>{calls++;throw Error('Synthetic timeout')});const attempt={...input,requestId:randomUUID(),operation:scope(p,updated)};
  await assert.rejects(failed.generate(owner,c.id,attempt),e=>e.message==='TEAM_AI_PROVIDER_UNAVAILABLE');assert.equal((await failed.draft(owner,c.id,attempt.requestId)).status,'uncertain');
  await assert.rejects(failed.generate(owner,c.id,attempt),e=>e.message==='TEAM_AI_NEW_REQUEST_REQUIRED');assert.equal(calls,1);
  await configure({enabled:false,removeKey:true});await clearRate();
 });
 await test('operations results export separates employee statement, evidence and human decision without secret material',async()=>{
  const {c,p,t}=exportFixture, result=await good('owner','GET',base(c)+`/${p.id}/export`);
  assert.equal(result.schema,'team.operations.result.v1');assert.equal(result.returnMode,'manual_admin_export');assert.equal(result.automaticMessages,false);
  assert.equal(result.states.completed,1);assert.equal(result.tasks[0].employeeStatement,'Reading clarified');assert.equal(result.tasks[0].humanReview.action,'complete');assert.equal(result.tasks[0].evidence[0].authorId,'s-bob');
  assert(result.summaryZh.includes('主管已验收：1'));assert(!JSON.stringify(result).includes('synthetic-minimax-key-only'));
  assert.equal((await request('bob','GET',base(c)+`/${p.id}/export`,undefined,true)).status,403);
  const audits=await good('owner','GET','/team/admin/audits');assert(audits.some(a=>JSON.parse(a.newValue).action==='operation_export'));
  fs.mkdirSync('output/team-operations',{recursive:true});fs.writeFileSync('output/team-operations/synthetic-result.json',JSON.stringify(result,null,2));
 });
};
