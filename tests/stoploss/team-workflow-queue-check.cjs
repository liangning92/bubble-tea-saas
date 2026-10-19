const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {randomUUID} = require('node:crypto');
module.exports = async ({prisma, good, request, create, send, test, dropResponse}) => {
  const {teamAi} = require(path.resolve('server/dist/services/TeamAiService'));
  const {teamCommunication, readTeam, writeTeam} = require(path.resolve('server/dist/services/TeamCommunicationService'));
  const {teamWorkflow} = require(path.resolve('server/dist/services/TeamWorkflowService'));
  const {workflowJobKey} = require(path.resolve('server/dist/services/TeamWorkflowQueue'));
  const owner = {id:'u-owner', staffId:'s-owner', storeId:'team-store-a', role:'admin'};
  const alice = {id:'u-alice', staffId:'s-alice', storeId:owner.storeId, role:'staff', employeeApp:true};
  const settings = teamAi(prisma, async () => {throw Error('SETTINGS_MUST_NOT_TRANSMIT')});
  const configure = async(extra={}) => {
    const old=await settings.settings(owner);
    return settings.saveSettings(owner,{expectedVersion:old.version, provider:'minimax',model:'MiniMax-M3',enabled:true,monthlyBudgetUsd:null,
      inputPerMillionUsd:.3,outputPerMillionUsd:1.2, ...extra});
  };
  const resetRate = async () => {
    for (const person of ['owner','alice','bob']) await prisma.config.deleteMany({where:{storeId:owner.storeId,key:'team.communication.rate.s-'+person}});
    const k='aiBudget.'+new Date().toISOString().slice(0,7), b=await readTeam(prisma,owner.storeId,k);
    if(b) await writeTeam(prisma,owner.storeId,k,{...b,calls:[]});
  };
  const policy = async(c, extra={}) => {
    const old=await good('owner','GET',`/team/channels/${c.id}/workflow/policy`);
    return good('owner','PUT',`/team/channels/${c.id}/workflow/policy`,{expectedVersion:old.version, enabled:true,paused:false,automaticSend:false,consent:true,employeeIds:['s-alice'],...extra});
  };
  const fixture = async() => {
    await resetRate();
    const c=await create('owner','group',['s-alice','s-bob'],'ISOLATED workflow'); await policy(c);
    const m=await send('alice',c.id,'Saya perlu pelatihan pemeriksaan mesin.'); return {c,m};
  };
  const getJob = async(c,m) => (await good('owner','GET',`/team/channels/${c.id}/workflow/jobs?after=${m.seq-1}`)).jobs.find(j=>j.id===m.id);
  const actionInput = (j,action,extra={}) => ({requestId:randomUUID(),expectedVersion:j.version,action,approved:true,note:'Synthetic human approval',...extra});
  const act = (c,m,j,action,extra={}) => good('owner','POST',`/team/channels/${c.id}/workflow/jobs/${m.seq}/actions`,actionInput(j,action,extra));
  const output = source => ({replyText:'Baik, mohon jelaskan kebutuhan pelatihan.',summaryZh:`员工陈述需要设备检查培训，尚未核实。#${source}`,
    suggestedTask:{category:'training',text:'合成设备检查培训',evidenceRequired:'本人文字说明检查步骤',acceptanceCriteria:'主管逐项确认步骤'},exceptions:[]});
  let calls=0;
  const transport = async(_key,_model,system,input) => {
    calls++;assert(system.includes('human approval'));assert(!input.includes('files'));assert(!input.includes('attachments'));
    const data=JSON.parse(input);assert.equal(data.selectedWorkMessages.length,1);
    const n=Number(data.selectedWorkMessages[0].match(/^#(\d+)/)[1]);
    return {text:JSON.stringify(output(n)),inputTokens:60,outputTokens:80,providerRequestId:'synthetic-workflow-'+calls};
  };
  let now=Date.now(); const workflow=teamWorkflow(prisma,teamAi(prisma,transport),()=>now);
  let main;
  await test('workflow defaults off; explicit consent, real admin and immutable automaticSend=false are enforced',async()=>{
    await resetRate(); const c=await create('owner','group',['s-alice','s-bob']);
    await send('alice',c.id,'Default off message');
    assert.equal((await good('owner','GET',`/team/channels/${c.id}/workflow/policy`)).enabled,false);
    assert.equal((await good('owner','GET',`/team/channels/${c.id}/workflow/jobs`)).jobs.length,0);
    for(const who of ['alice','manager-auditor']) assert.equal((await request(who,'GET',`/team/channels/${c.id}/workflow/jobs`,undefined,true)).status,403);
    assert.equal((await request('owner','GET',`/team/channels/${c.id}/workflow/jobs`,undefined,true)).status,403);
    assert.equal((await request('outsider','GET',`/team/channels/${c.id}/workflow/jobs`)).status,404);
    await configure({apiKey:'synthetic-workflow-key-only'});
    const input={expectedVersion:0,enabled:true,paused:false,automaticSend:true,consent:true,employeeIds:['s-alice']};
    assert.equal((await request('owner','PUT',`/team/channels/${c.id}/workflow/policy`,input)).status,400);
    assert.equal((await request('owner','PUT',`/team/channels/${c.id}/workflow/policy`,{...input,automaticSend:false,consent:false})).status,400);
    assert.equal((await request('owner','POST',`/team/channels/${c.id}/ai/drafts`,{requestId:randomUUID(),kind:'workflow',sourceSeq:[1],consent:true})).status,403);
    await policy(c);
    const payload={requestId:randomUUID(),text:'Saya perlu pelatihan pemeriksaan mesin.'};
    const [a,b]=await Promise.all([good('alice','POST',`/team/channels/${c.id}/messages`,payload,true),good('alice','POST',`/team/channels/${c.id}/messages`,payload,true)]);
    assert.equal(a.id,b.id);await send('bob',c.id,'NOT ALLOWLISTED');await send('owner',c.id,'PRIVATE ADMIN CONTEXT');
    const jobs=(await good('owner','GET',`/team/channels/${c.id}/workflow/jobs`)).jobs;
    assert.equal(jobs.length,1);assert.equal(jobs[0].id,a.id);assert.equal(calls,0); main={c,m:a};
  });
  const injectTx = patches => ({$transaction:fn=>prisma.$transaction(tx=>{
    const db={config:tx.config,staff:tx.staff,user:tx.user,financeAuditLog:tx.financeAuditLog,...patches(tx)};return fn(db);
  })});
  await test('workflow event failure rolls back the message, sequence, request record and queue atomically',async()=>{
    const {c}=await fixture();const before=(await good('alice','GET',`/team/channels/${c.id}/messages`)).messages.length;
    const fault=injectTx(tx=>({config:new Proxy(tx.config,{get(target,key){if(key==='upsert')return args=>{
      if(args.where.storeId_key.key.startsWith('team.communication.workflow.event.'))throw Error('SYNTHETIC_EVENT_WRITE_FAILURE');return target.upsert(args);
    };return target[key]}})}));
    const input={requestId:randomUUID(),text:'Atomic message'};
    await assert.rejects(teamCommunication(fault).send(alice,c.id,input),/SYNTHETIC_EVENT_WRITE_FAILURE/);
    assert.equal((await good('alice','GET',`/team/channels/${c.id}/messages`)).messages.length,before);
    assert.equal((await good('owner','GET',`/team/channels/${c.id}/workflow/jobs`)).jobs.length,1);
    const saved=await teamCommunication(prisma).send(alice,c.id,input);assert.equal(saved.seq,before+1);
    await policy(c,{enabled:false});
  });
  await test('parallel consumers claim one persisted lease and generate one private draft without auto sending',async()=>{
    await resetRate();let started,release;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);let count=0;
    const slow=teamWorkflow(prisma,teamAi(prisma,async(...args)=>{count++;started();await gate;return transport(...args)}),()=>now);
    const first=slow.process(owner.storeId,main.c.id,main.m.seq);await ready;
    try{assert.equal(await slow.process(owner.storeId,main.c.id,main.m.seq),null);assert.equal(count,1)}finally{release();await first}
    const j=await getJob(main.c,main.m);assert.equal(j.status,'awaiting_approval');assert.equal(j.attempt,1);
    assert.equal((await good('alice','GET',`/team/channels/${main.c.id}/messages`)).messages.length,4);
    assert.equal((await request('alice','GET',`/team/channels/${main.c.id}/workflow/events`,undefined,true)).status,403);
  });
  await test('human reply approval retries publish one AI-labelled message and never reenqueue it',async()=>{
    const {c,m}=main,j=await getJob(c,m),payload=actionInput(j,'approve_reply');
    assert.equal((await request('owner','POST',`/team/channels/${c.id}/workflow/jobs/${m.seq}/actions`,{...payload,approved:false})).status,400);
    dropResponse();await assert.rejects(request('owner','POST',`/team/channels/${c.id}/workflow/jobs/${m.seq}/actions`,payload));
    const approved=await good('owner','POST',`/team/channels/${c.id}/workflow/jobs/${m.seq}/actions`,payload);
    assert.equal((await good('owner','POST',`/team/channels/${c.id}/workflow/jobs/${m.seq}/actions`,payload)).replyMessageId,approved.replyMessageId);
    const messages=(await good('alice','GET',`/team/channels/${c.id}/messages`)).messages;
    assert.equal(messages.length,5);assert.equal(messages.at(-1).ai.approvedBy,'s-owner');
    assert.equal((await good('owner','GET',`/team/channels/${c.id}/workflow/jobs`)).jobs.length,1);
    assert.equal((await request('owner','POST',`/team/channels/${c.id}/workflow/jobs/${m.seq}/actions`,{...payload,note:'changed'})).status,409);
  });
  let mainPlan;
  await test('human task approval is atomic and deduplicated; source employee and human reviewer are fixed',async()=>{
    const {c,m}=main,j=await getJob(c,m),content={schema:'team.operations.plan.v1',title:'合成培训',objective:'隔离工作流验收',reviewerId:'s-owner',
      items:[{key:'training',text:j.result.suggestedTask.text,ownerId:'s-alice',acceptByAt:'2026-10-21T08:00:00+07:00',deadlineAt:'2026-10-22T08:00:00+07:00',
        evidenceRequired:j.result.suggestedTask.evidenceRequired,acceptanceCriteria:j.result.suggestedTask.acceptanceCriteria}]};
    assert.equal((await request('owner','POST',`/team/channels/${c.id}/workflow/jobs/${m.seq}/actions`,actionInput(j,'approve_task',{content:{...content,items:[{...content.items[0],ownerId:'s-bob'}]}}))).status,400);
    const payload=actionInput(j,'approve_task',{content});
    const result=await good('owner','POST',`/team/channels/${c.id}/workflow/jobs/${m.seq}/actions`,payload);
    assert.equal((await good('owner','POST',`/team/channels/${c.id}/workflow/jobs/${m.seq}/actions`,payload)).planId,result.planId);
    const tasks=await good('alice','GET',`/team/channels/${c.id}/tasks`,undefined,true);assert.equal(tasks.length,1);assert.equal(tasks[0].status,'assigned');mainPlan=result.planId;
  });
  await test('workflow task follows employee acceptance, own evidence, return, resubmission and explicit human criteria review',async()=>{
    const {c}=main;let t=(await good('alice','GET',`/team/channels/${c.id}/tasks`,undefined,true))[0];
    const taskAction=async(who,action,extra={})=>good(who,'POST',`/team/channels/${c.id}/tasks/${t.id}/actions`,{requestId:randomUUID(),expectedVersion:t.version,action,...extra},who==='alice');
    await good('alice','PUT',`/team/channels/${c.id}/read`,{seq:5},true);
    assert.equal((await good('alice','GET',`/team/channels/${c.id}/tasks`,undefined,true))[0].status,'assigned');
    t=await taskAction('alice','accept');let evidence=await send('alice',c.id,'合成证据：已说明断电、检查、复核步骤。');
    t=await taskAction('alice','submit',{note:'员工合成陈述',sourceSeq:[evidence.seq]});
    assert.equal((await request('owner','POST',`/team/channels/${c.id}/tasks/${t.id}/actions`,{requestId:randomUUID(),expectedVersion:t.version,action:'complete',note:'缺少人工勾选'})).status,400);
    t=await taskAction('owner','return',{note:'请补充复核步骤'});evidence=await send('alice',c.id,'合成补证：复核后记录读数。');
    t=await taskAction('alice','submit',{note:'已补充，仍待主管核实',sourceSeq:[evidence.seq]});
    t=await taskAction('owner','complete',{note:'主管已逐项核对合成证据',criteriaConfirmed:true});assert.equal(t.status,'completed');
    const report=await good('owner','GET',`/team/channels/${c.id}/workflow/export`);
    assert(report.textZh.includes('员工陈述'));assert(report.textZh.includes('主管已验收：1'));assert.equal(report.details.find(d=>d.task).task.tasks[0].humanReview.criteriaConfirmed,true);
    fs.mkdirSync('output/team-workflow-queue-20261020',{recursive:true});fs.writeFileSync('output/team-workflow-queue-20261020/synthetic-result.json',JSON.stringify(report,null,2));
    await policy(c,{enabled:false});
  });
  await test('queued pause consumes nothing; pause during provider work blocks the result and later publication',async()=>{
    const {c,m}=await fixture();await policy(c,{paused:true});const before=calls;
    assert.equal(await workflow.process(owner.storeId,c.id,m.seq),null);assert.equal(calls,before);
    await policy(c);let started,release;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);
    const slow=teamWorkflow(prisma,teamAi(prisma,async(...args)=>{started();await gate;return transport(...args)}),()=>now);
    const pending=slow.process(owner.storeId,c.id,m.seq);await ready;await policy(c,{paused:true});release();await pending;
    const j=await getJob(c,m);assert.equal(j.status,'blocked');assert(!j.result);assert.equal(j.error,'TEAM_WORKFLOW_PAUSED');
    assert.equal((await request('owner','POST',`/team/channels/${c.id}/workflow/jobs/${m.seq}/actions`,actionInput(j,'approve_reply'))).status,400);
    await policy(c,{enabled:false});
  });
  await test('provider uncertainty retains billing risk and never auto retries; a new attempt requires explicit human acknowledgement',async()=>{
    const {c,m}=await fixture();let count=0;
    const unreliable=teamWorkflow(prisma,teamAi(prisma,async(...args)=>{count++;if(count===1)throw Error('PRIVATE PROVIDER BODY MUST NOT LEAK');return transport(...args)}),()=>now);
    let j=await unreliable.process(owner.storeId,c.id,m.seq);assert.equal(j.status,'uncertain');const original=j.aiRequestId;
    await unreliable.runBatch(owner.storeId);assert.equal(count,1);assert(!JSON.stringify(j).includes('PRIVATE PROVIDER'));
    assert.equal((await request('owner','POST',`/team/channels/${c.id}/workflow/jobs/${m.seq}/actions`,actionInput(j,'retry'))).status,400);
    j=await act(c,m,j,'retry',{acknowledgePossibleCharge:true});j=await unreliable.process(owner.storeId,c.id,m.seq);
    assert.equal(j.status,'awaiting_approval');assert.notEqual(j.aiRequestId,original);assert.equal(j.attempt,2);assert.equal(count,2);await policy(c,{enabled:false});
  });
  await test('pre-transport rate failure backs off durably and retries only when due without a duplicate charge',async()=>{
    const {c,m}=await fixture(),k='aiBudget.'+new Date().toISOString().slice(0,7),b=await readTeam(prisma,owner.storeId,k);
    await writeTeam(prisma,owner.storeId,k,{...b,calls:[Date.now(),Date.now(),Date.now()]});const before=calls;
    let j=await workflow.process(owner.storeId,c.id,m.seq);assert.equal(j.status,'retry_wait');assert.equal(calls,before);
    assert.equal(await readTeam(prisma,owner.storeId,`aiDraft.s-owner.${j.aiRequestId}`),null);
    assert.equal(await workflow.process(owner.storeId,c.id,m.seq),null);await resetRate();now+=30001;
    j=await workflow.process(owner.storeId,c.id,m.seq);assert.equal(j.status,'awaiting_approval');assert.equal(calls,before+1);await policy(c,{enabled:false});
  });
  await test('expired in-flight lease stops uncertain; later saved output can be reconciled manually without another model call',async()=>{
    const {c,m}=await fixture();let started,release,count=0;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);
    const slow=teamWorkflow(prisma,teamAi(prisma,async(...args)=>{count++;started();await gate;return transport(...args)}),()=>now);
    const pending=slow.process(owner.storeId,c.id,m.seq);await ready;now+=120001;
    await slow.process(owner.storeId,c.id,m.seq);assert.equal((await getJob(c,m)).status,'uncertain');release();await pending;
    let j=await getJob(c,m);assert.equal(j.status,'uncertain');assert.equal(count,1);
    j=await act(c,m,j,'reconcile');assert.equal(j.status,'awaiting_approval');assert.equal(count,1);
    // Simulate a crash after gateway result persisted but before the job was settled.
    await writeTeam(prisma,owner.storeId,workflowJobKey(c.id,m.seq),{...j,status:'processing',leaseUntil:now-1,leaseToken:randomUUID()});
    j=await slow.process(owner.storeId,c.id,m.seq);assert.equal(j.status,'awaiting_approval');assert.equal(count,1);await policy(c,{enabled:false});
  });
  await test('revoked operator, changed audience and changed model settings fail closed before provider transmission',async()=>{
    const {c,m}=await fixture(),before=calls, user=await prisma.user.findUniqueOrThrow({where:{id:'u-owner'}});
    try{await prisma.user.update({where:{id:user.id},data:{role:'staff',updatedAt:user.updatedAt}});assert.equal((await workflow.process(owner.storeId,c.id,m.seq)),null)}
    finally{await prisma.user.update({where:{id:user.id},data:{role:'admin',updatedAt:user.updatedAt}})}
    assert.equal((await getJob(c,m)).error,'TEAM_WORKFLOW_ADMIN_REQUIRED');assert.equal(calls,before);await policy(c,{enabled:false});
    const next=await fixture();await good('owner','PUT',`/team/channels/${next.c.id}/members`,{expectedVersion:1,ownerId:'s-owner',members:['s-owner','s-alice','s-bob','s-carol'],archived:false});
    await workflow.process(owner.storeId,next.c.id,next.m.seq);assert.equal((await getJob(next.c,next.m)).error,'TEAM_WORKFLOW_SCOPE_CHANGED');assert.equal(calls,before);await policy(next.c,{enabled:false});
    const changed=await fixture();await configure();await workflow.process(owner.storeId,changed.c.id,changed.m.seq);assert.equal((await getJob(changed.c,changed.m)).error,'TEAM_AI_CONFIG_CHANGED');assert.equal(calls,before);await policy(changed.c,{enabled:false});
  });
  await test('recovery blocked by changed config still exposes the in-flight provider reservation as possible billing',async()=>{
    const {c,m}=await fixture();let started,release;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);
    const slow=teamWorkflow(prisma,teamAi(prisma,async(...args)=>{started();await gate;return transport(...args)}),()=>now);
    const pending=slow.process(owner.storeId,c.id,m.seq);await ready;now+=120001;await configure();
    await slow.process(owner.storeId,c.id,m.seq);
    const j=await getJob(c,m);assert.equal(j.status,'blocked');assert.equal(j.error,'TEAM_AI_CONFIG_CHANGED');assert.equal(j.billingStatus,'possible');
    release();await pending;await policy(c,{enabled:false});
  });
  await test('failed final approval audit rolls back both the reused message service and the job decision',async()=>{
    const {c,m}=await fixture();let j=await workflow.process(owner.storeId,c.id,m.seq);const before=(await good('alice','GET',`/team/channels/${c.id}/messages`)).messages.length;
    const faulty=injectTx(tx=>({financeAuditLog:new Proxy(tx.financeAuditLog,{get(target,key){if(key==='create')return args=>{
      if(JSON.parse(args.data.newValue).action==='workflow_approve_reply')throw Error('SYNTHETIC_APPROVAL_AUDIT_FAILURE');return target.create(args);
    };return target[key]}})}));
    await assert.rejects(teamWorkflow(faulty).action(owner,c.id,m.seq,actionInput(j,'approve_reply')),/SYNTHETIC_APPROVAL_AUDIT_FAILURE/);
    assert.equal((await good('alice','GET',`/team/channels/${c.id}/messages`)).messages.length,before);assert.equal((await getJob(c,m)).version,j.version);
    j=await act(c,m,j,'approve_reply');assert(j.replyMessageId);await policy(c,{enabled:false});
  });
  await test('attachment-only messages need manual review; financial exceptions never create tasks; event cursors expose state without secrets',async()=>{
    const {c,m}=await fixture();const files=await prisma.config.findMany({where:{storeId:owner.storeId,key:{startsWith:'employee.workspace.file.'}}});
    const file=files.map(r=>JSON.parse(r.value)).find(f=>f.staffId==='s-alice'&&f.purpose==='team');assert(file);
    const image=await send('alice',c.id,'',{files:[file.id]});assert.equal((await getJob(c,image)).error,'TEAM_WORKFLOW_TEXT_REQUIRED');
    const sensitive=teamWorkflow(prisma,teamAi(prisma,async()=>({text:JSON.stringify({...output(m.seq),suggestedTask:null,exceptions:['退款或工资问题需要老板处理']}),inputTokens:20,outputTokens:30,providerRequestId:'sensitive'})),()=>now);
    let j=await sensitive.process(owner.storeId,c.id,m.seq);assert.equal(j.status,'awaiting_approval');assert.equal(j.result.suggestedTask,null);assert.equal(j.planId,undefined);assert.equal(j.replyMessageId,undefined);
    const events=await good('owner','GET',`/team/channels/${c.id}/workflow/events`);assert.equal(events.delivery,'authenticated_cursor_pull');assert(events.events.length>=3);
    assert(!JSON.stringify(events).includes('secret'));assert(!JSON.stringify(events).includes('replyText'));
    assert.equal((await good('owner','GET',`/team/channels/${c.id}/workflow/events?after=${events.cursor}`)).events.length,0);
    j=await act(c,m,j,'dismiss');assert.equal(j.status,'dismissed');await policy(c,{enabled:false});
    const audits=await prisma.financeAuditLog.findMany({where:{entityId:c.id}});assert(audits.some(a=>a.userId==='u-owner'&&JSON.parse(a.newValue).action==='workflow_dismiss'));
  });
  await test('human pause remains available when an employee becomes inactive or AI is disabled',async()=>{
    const {c,m}=await fixture();await prisma.staff.update({where:{id:'s-alice'},data:{status:'inactive'}});
    try{await configure({enabled:false});const p=await policy(c,{paused:true});assert.equal(p.paused,true);assert.equal(await workflow.process(owner.storeId,c.id,m.seq),null)}
    finally{await prisma.staff.update({where:{id:'s-alice'},data:{status:'active'}});await configure()}
    await policy(c,{enabled:false});
  });
  await test('invalid structured output is withheld and uncertain attempts cannot exceed the explicit three-attempt limit',async()=>{
    const {c,m}=await fixture();let count=0;
    const broken=teamWorkflow(prisma,teamAi(prisma,async()=>{count++;throw Error('synthetic unavailable')}),()=>now);
    let j=await broken.process(owner.storeId,c.id,m.seq);
    for(let i=0;i<2;i++){j=await act(c,m,j,'retry',{acknowledgePossibleCharge:true});await resetRate();j=await broken.process(owner.storeId,c.id,m.seq)}
    assert.equal(count,3);assert.equal(j.billingStatus,'possible');
    assert.equal((await request('owner','POST',`/team/channels/${c.id}/workflow/jobs/${m.seq}/actions`,actionInput(j,'retry',{acknowledgePossibleCharge:true}))).status,409);await policy(c,{enabled:false});
    const next=await fixture(),malformed=teamWorkflow(prisma,teamAi(prisma,async()=>({text:'{"summaryZh":"missing required fields"}',inputTokens:1,outputTokens:1,providerRequestId:'malformed'})),()=>now);
    j=await malformed.process(owner.storeId,next.c.id,next.m.seq);assert.equal(j.status,'blocked');assert.equal(j.billingStatus,'usage_recorded');assert(!j.result);assert(!j.replyMessageId);await policy(next.c,{enabled:false});
  });
  await test('job, event and Chinese export cursors recover every record beyond one page and enforce the current membership floor',async()=>{
    const c=await create('owner','group',['s-alice']);const data=[];
    for(let n=1;n<=205;n++){
      const job={id:randomUUID(),channelId:c.id,sourceSeq:n,sourceAuthorId:'s-alice',operatorUserId:'u-owner',operatorStaffId:'s-owner',version:1,attempt:0,status:'blocked',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      data.push({storeId:owner.storeId,category:'staff',key:'team.communication.'+workflowJobKey(c.id,n),value:JSON.stringify(job)});
      data.push({storeId:owner.storeId,category:'staff',key:`team.communication.workflow.event.${c.id}.${String(n).padStart(12,'0')}`,value:JSON.stringify({cursor:n,channelId:c.id,detail:{sourceSeq:n,status:'blocked'}})});
    }
    await prisma.config.createMany({data});
    for(const [route,key] of [['jobs','jobs'],['events','events'],['export','details']]){
      let after=0,all=[];for(;;){const page=await good('owner','GET',`/team/channels/${c.id}/workflow/${route}?after=${after}`);all.push(...page[key]);assert(page.cursor>after);after=page.cursor;if(!page.hasMore)break}
      assert.equal(all.length,205);assert.equal(new Set(all.map(r=>r.sourceSeq||r.cursor)).size,205);
    }
    const latest=await readTeam(prisma,owner.storeId,'channel.'+c.id);latest.members.find(m=>m.staffId==='s-owner').fromSeq=151;
    await writeTeam(prisma,owner.storeId,'channel.'+c.id,latest);
    assert.equal((await good('owner','GET',`/team/channels/${c.id}/workflow/jobs`)).jobs.length,55);
    assert.equal((await good('owner','GET',`/team/channels/${c.id}/workflow/events`)).events.length,0);
  });
  await configure({enabled:false,removeKey:true});
};
