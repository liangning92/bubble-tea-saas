/* Real owned PostgreSQL + synthetic bearer HTTP business-service acceptance.
 * No production authentication/MCP/Hermes/model claims are made by this fixture. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { randomUUID } = require('node:crypto'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..'), database = new URL(process.env.DATABASE_URL);
assert.equal(database.hostname, '127.0.0.1'); assert.equal(database.pathname, '/agent_task_test');
assert(process.env.BT_TEST_RUN?.startsWith('bt-test-')); assert(process.env.UPLOADS_PATH?.includes(process.env.BT_TEST_RUN));
const { prisma } = require(root + '/server/dist/config/database');
const { createAgentTaskService } = require(root + '/server/dist/services/agentTasks/service');
const { teamCommunication } = require(root + '/server/dist/services/TeamCommunicationService');
const express = require(root + '/server/node_modules/express');
const { persistentAdmissionBindings } = require(root + '/server/dist/services/agentTasks/admissionBindings');
const { createAgentTaskDispatcher } = require(root + '/server/dist/services/agentTasks/dispatch');
const { HermesRunsClient } = require(root + '/server/dist/services/hermesTransport/client');
const { createAgentTaskRuntime } = require(root + '/server/dist/services/agentTasks/runtime');
const nativeFetch = global.fetch;
global.fetch = (url, options) => { assert.equal(new URL(String(url)).hostname, '127.0.0.1'); return nativeFetch(url, options) };
const grantKey = id => 'test.agent.grant.' + id;
const deps = {
  async authorize(db, principal, scope, channelId) {
    const row = await db.config.findUnique({ where: { storeId_key: { storeId: principal.storeId, key: grantKey(principal.agentId) } } });
    const live = row ? JSON.parse(row.value) : null;
    if (!live || !live.enabled || live.principal.role !== principal.role || live.principal.grantVersion !== principal.grantVersion ||
      live.principal.clientRevision !== principal.clientRevision || !live.principal.scopes.includes(scope) || (channelId && live.channelId !== channelId)) {
      const error = new Error('SYNTHETIC_AUTH_DENIED'); error.status = 403; throw error;
    }
    return live.principal;
  },
  async executorFor(db, manager, channelId) {
    const row = await db.config.findUnique({ where: { storeId_key: { storeId: manager.storeId, key: 'test.agent.executor.' + channelId } } });
    if (!row) throw Error('SYNTHETIC_EXECUTOR_MISSING');
    return deps.authorize(db, JSON.parse(row.value), 'executor.claim', channelId);
  }
};
async function put(storeId, key, value) {
  await prisma.config.upsert({ where: { storeId_key: { storeId, key } }, create: { storeId, key, value: JSON.stringify(value), category: 'isolated-test' }, update: { value: JSON.stringify(value) } });
}
const plan = () => ({ objective: 'Synthetic STOCK-RO-001 read-only acceptance fixture', scope: 'stock_readonly_v1',
  constraints: ['Read-only inventory facts; no business writes.', 'Synthetic HTTP test only; no Hermes/model.'], deadlineAt: new Date(Date.now() + 86400000).toISOString(),
  firstReportWithinMs: 600000, evidenceRequired: 'Native inventory source references', criteria: [{ id: 'native_refs', standard: 'Cite the native read-only evidence.' }] });
const claimBody = view => ({ requestId: randomUUID(), authVersion: 1, taskId: view.taskId, runId: view.runId, round: view.round, expectedVersion: view.taskVersion });
const leasedBody = (view, claim) => ({ ...claimBody(view), leaseVersion: view.leaseVersion, leaseToken: claim.leaseToken });
const passed = [], failures = []; let server, base, service, tenant, index = 0, faultAudit = false;
const faultDb = { $transaction: (fn, options) => prisma.$transaction(tx => fn(new Proxy(tx, { get(target, key) {
  if (key === 'financeAuditLog') return new Proxy(target.financeAuditLog, { get(model, method) {
    if (method === 'create') return async (...args) => { if (faultAudit) { faultAudit = false; throw Error('SYNTHETIC_AUDIT_FAILURE') } return model.create(...args) };
    return model[method];
  } });
  return target[key];
} })), options) };
async function open(db = prisma) {
  service = createAgentTaskService(db, deps);
  const app = express(); app.use(express.json());
  // Test-only server-side resolver: the body can never select principal/store/role.
  app.post('/agent/:method', async (req, res) => {
    try {
      const bearer = req.headers.authorization?.replace(/^Bearer /, '');
      const row = bearer ? await prisma.config.findFirst({ where: { key: 'test.agent.bearer.' + bearer }, select: { value: true } }) : null;
      if (!row) return res.status(401).json({ error: 'SYNTHETIC_AUTH_REQUIRED' });
      const principal = JSON.parse(row.value);
      if (!['assign', 'get', 'claim', 'readStockEvidence', 'report', 'review', 'events'].includes(req.params.method)) return res.status(404).json({ error: 'UNKNOWN_TEST_METHOD' });
      return res.json({ data: await service[req.params.method](principal, req.body) });
    } catch (error) { return res.status(error.status || 409).json({ error: error.message }); }
  });
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
}
async function request(token, method, body) {
  const response = await fetch(base + '/agent/' + method, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function good(token, method, body) { const r = await request(token, method, body); assert.equal(r.status, 200, JSON.stringify(r)); return r.body.data; }
async function close() { if (server) { await new Promise(resolve => server.close(resolve)); server = null; } }
async function check(name, fn) {
  if (process.env.CASE_FILTER && !process.env.CASE_FILTER.split('|').some(part => name.includes(part))) return;
  // Runtime and fault-injection cases replace this HTTP composition. Never let
  // a prior case's dispatcher target or audit hook affect the next case.
  service = createAgentTaskService(prisma, deps); faultAudit = false;
  try { await fn(); passed.push(name); console.log('PASS', name) } catch (error) { failures.push({ name, error: error.stack || error.message }); console.error('FAIL', name, error); }
  finally { service = createAgentTaskService(prisma, deps); faultAudit = false; }
}
async function fixture() {
  const n = ++index, storeId = 'agent-task-store-' + n;
  await prisma.store.create({ data: { id: storeId, tenantId: tenant.id, name: 'Synthetic agent task store' } });
  const people = [];
  for (const role of ['admin', 'staff']) {
    const id = `agent-user-${n}-${role}`, staffId = `agent-staff-${n}-${role}`;
    await prisma.user.create({ data: { id, storeId, role, phone: `0896${n}${role}`, password: 'synthetic-unused', staff: { create: { id: staffId, storeId, name: 'Synthetic ' + role, employeeNumber: `AG-${n}-${role}` } } } });
    people.push({ id, storeId, staffId, role, employeeApp: role === 'staff' });
  }
  const channel = await teamCommunication(prisma).create(people[0], { requestId: randomUUID(), title: 'Synthetic agent task test', kind: 'group', members: [people[1].staffId] });
  const inventory = await prisma.inventory.create({ data: { storeId, name: 'Synthetic cups', category: 'packaging', unit: 'pcs', currentStock: 12 } });
  const manager = { agentId: 'synthetic-manager-' + n, role: 'manager', storeId, grantVersion: 1, clientRevision: 1, scopes: ['management.assign', 'management.read', 'management.review'] };
  const executor = { agentId: 'synthetic-executor-' + n, role: 'executor', storeId, grantVersion: 1, clientRevision: 1, scopes: ['executor.claim', 'executor.evidence', 'executor.report'] };
  const managerToken = randomUUID(), executorToken = randomUUID();
  for (const [principal, token] of [[manager, managerToken], [executor, executorToken]]) {
    await put(storeId, grantKey(principal.agentId), { enabled: true, channelId: channel.id, principal });
    await put(storeId, 'test.agent.bearer.' + token, principal);
  }
  await put(storeId, 'test.agent.executor.' + channel.id, executor);
  const assignment = { requestId: randomUUID(), authVersion: 1, channelId: channel.id, taskCode: 'STOCK-RO-001', expectedVersion: 0, plan: plan() };
  return { storeId, channel, inventory, manager, executor, managerToken, executorToken, assignment, humanActors: people };
}
function restartProcessProbe(f) {
  const childCode = `const fs=require('node:fs');const {prisma}=require(${JSON.stringify(root + '/server/dist/config/database')});
const {createAgentTaskService}=require(${JSON.stringify(root + '/server/dist/services/agentTasks/service')});
const grantKey=${grantKey.toString()};const deps={${deps.authorize.toString()},${deps.executorFor.toString()}};
(async()=>{try{const input=JSON.parse(fs.readFileSync(0,'utf8'));const s=createAgentTaskService(prisma,deps);const receipt=await s.assign(input.principal,input.assignment);const current=await s.get(input.principal,{taskId:receipt.taskId,authVersion:1});process.stdout.write(JSON.stringify({receipt,current}));}finally{await prisma.$disconnect()}})().catch(e=>{process.stderr.write(e.stack);process.exitCode=1});`;
  const child = spawnSync(process.execPath, ['-e', childCode], { cwd: root, env: process.env,
    input: JSON.stringify({ principal: f.manager, assignment: f.assignment }), encoding: 'utf8', timeout: 30000 });
  assert.equal(child.status, 0, child.stderr || child.error?.message); return JSON.parse(child.stdout);
}
const sourceRefs = evidence => evidence.items.map(item => item.sourceId);
const reportBody = (view, claim, evidence, outcome = 'completed') => ({ ...leasedBody(view, claim), outcome,
  ...(outcome === 'completed' ? { evidenceId: evidence.evidenceId, inputSnapshotHash: evidence.inputSnapshotHash } : {}),
  rawReport: 'Synthetic HTTP fixture report only; not generated by Hermes or a model.', sourceRefs: evidence ? sourceRefs(evidence.evidence) : [],
  runtimeReceipt: { hermesRunId: 'synthetic-no-hermes-execution' } });
const reviewBody = (view, evidenceId, decision) => ({ requestId: randomUUID(), authVersion: 1, taskId: view.taskId, runId: view.runId, round: view.round,
  expectedVersion: view.taskVersion, reportId: view.report.id, reportVersion: view.report.version, decision,
  check: { summary: 'Synthetic native HTTP acceptance check', checkedEvidenceIds: [evidenceId], criteria: [{ id: 'native_refs', result: decision === 'accept' ? 'met' : 'not_met', note: 'Synthetic test-only decision.' }] },
  ...(decision === 'rework' ? { nextPlan: plan() } : {}) });
(async () => {
  try {
    tenant = await prisma.tenant.create({ data: { name: 'Synthetic agent tasks HTTP acceptance' } }); await open();
    async function runtimeFixture(publish, options = {}) {
      const f = await fixture(), native = createAgentTaskService(prisma, deps), profile = 'synthetic-runtime', origin = 'http://127.0.0.1:43112';
      let sessionId, posts = 0, polls = 0; const hermesRunId = 'run_synthetic_' + randomUUID();
      const client = new HermesRunsClient({ origin, profile, bearerToken: () => 'synthetic-runtime-key', admissionBindings: persistentAdmissionBindings(prisma, f.storeId),
        fetch: async (_url, init) => { if (init.method === 'POST') { posts++; sessionId = JSON.parse(init.body).session_id; return { status: 202, text: async () => JSON.stringify({ run_id: hermesRunId, status: 'started', replayed: false }) } }
          polls++; if(options.onStatus)await options.onStatus(); return { status: 200, text: async () => JSON.stringify({ run_id: hermesRunId, session_id: sessionId, status: options.status || 'running' }) } } });
      const dispatcher = createAgentTaskDispatcher(prisma, deps, profile, client, { origin, identityId: 'synthetic-runtime', credentialGeneration: 1 });
      const runtime = createAgentTaskRuntime(prisma, native, dispatcher, publish); service = runtime.service;
      return { f, native, dispatcher, runtime, posts: () => posts, polls: () => polls };
    }
    await check('terminal supervision: completed mapped run without report becomes visible after cursor advanced', async () => {
      let delivered=0;const options={status:'running'},x=await runtimeFixture(async()=>{delivered++;return[{state:'accepted'}]},options),{f}=x;
      const assigned=await good(f.managerToken,'assign',f.assignment),claim=await good(f.executorToken,'claim',claimBody(assigned));
      const evidence=await good(f.executorToken,'readStockEvidence',leasedBody(claim,claim));
      const model={taskId:claim.taskId,runId:claim.runId,taskVersion:evidence.taskVersion,state:'ready',billingStatus:'usage_recorded',usage:{prompt_tokens:11951,completion_tokens:79}};
      await put(f.storeId,'team.communication.agent.model.run.'+claim.runId,{requestId:'synthetic-ready-receipt'});
      await put(f.storeId,'team.communication.agent.model.request.'+f.executor.agentId+'.synthetic-ready-receipt',model);
      const page=await x.runtime.recoverOutbox(f.manager,{authVersion:1,after:0,limit:100});options.status='completed';
      const before=x.polls();await x.runtime.recoverOutbox(f.manager,{authVersion:1,after:page.nextCursor,limit:100});
      const current=await good(f.managerToken,'get',{taskId:claim.taskId,authVersion:1});console.log('TERMINAL_OBSERVATION',JSON.stringify({state:current.state,pollsBefore:before,pollsAfter:x.polls(),delivered,report:!!current.report}));
      assert.equal(current.state,'blocked');assert.equal(current.programFailure.code,'AGENT_TASK_PROGRAM_EXECUTOR_TERMINAL_NO_REPORT');assert(!current.report);assert.equal(delivered,1);
      const again=await x.runtime.recoverOutbox(f.manager,{authVersion:1,after:page.nextCursor,limit:100});assert.equal(delivered,1);assert.equal(x.posts(),1);
      const review={...claimBody(current),programFailureId:current.programFailure.id,programFailureVersion:current.programFailure.version,decision:'rework',check:{summary:'Manager explicitly reviews terminal failure; no model report exists',checkedEvidenceIds:[],criteria:[{id:'native_refs',result:'not_met',note:'Executor terminated before reporting'}]},nextPlan:plan()};
      const next=await good(f.managerToken,'review',review);assert.equal(next.round,2);assert.notEqual(next.runId,current.runId);assert.equal(x.posts(),2);
      await x.dispatcher.reconcile(f.manager,{eventId:assigned.dispatch.eventId,authVersion:1});
      const afterOld=await good(f.managerToken,'get',{taskId:next.taskId,authVersion:1});assert.equal(afterOld.runId,next.runId);assert.equal(afterOld.state,'assigned');assert(!afterOld.programFailure);
      const saved=await prisma.config.findUnique({where:{storeId_key:{storeId:f.storeId,key:'team.communication.agent.model.request.'+f.executor.agentId+'.synthetic-ready-receipt'}}});assert.deepEqual(JSON.parse(saved.value),model);
    });
    await check('terminal supervision: failed cancelled interrupted are program failures, unknown billing is never reworked', async () => {
      for(const status of ['failed','cancelled','interrupted']){
        const x=await runtimeFixture(async()=>[{state:'accepted'}],{status}),{f}=x,assigned=await good(f.managerToken,'assign',f.assignment),claim=await good(f.executorToken,'claim',claimBody(assigned));
        await x.runtime.recoverOutbox(f.manager,{authVersion:1,after:0,limit:100});const current=await good(f.managerToken,'get',{taskId:claim.taskId,authVersion:1});assert.equal(current.state,'blocked');assert(!current.report);assert.equal(current.programFailure.knownNotSent,false);assert.equal(x.posts(),1);
      }
      const x=await runtimeFixture(async()=>[{state:'accepted'}],{status:'completed'}),{f}=x,assigned=await good(f.managerToken,'assign',f.assignment),claim=await good(f.executorToken,'claim',claimBody(assigned));
      await put(f.storeId,'team.communication.agent.model.run.'+claim.runId,{requestId:'uncertain'});await put(f.storeId,'team.communication.agent.model.request.'+f.executor.agentId+'.uncertain',{taskId:claim.taskId,runId:claim.runId,taskVersion:claim.taskVersion,state:'unknown',billingStatus:'possible'});
      await x.runtime.recoverOutbox(f.manager,{authVersion:1,after:0,limit:100});const current=await good(f.managerToken,'get',{taskId:claim.taskId,authVersion:1});assert.equal(current.state,'unknown');
      const denied=await request(f.managerToken,'review',{...claimBody(current),programFailureId:current.programFailure.id,programFailureVersion:1,decision:'rework',check:{summary:'Cannot reset unknown billing',checkedEvidenceIds:[],criteria:[{id:'native_refs',result:'not_met',note:'Unknown call outcome'}]},nextPlan:plan()});assert.notEqual(denied.status,200);assert.equal(x.posts(),1);
    });
    await check('terminal supervision: concurrent real report wins, mismatched receipt and revoked manager fail closed', async () => {
      const options={status:'completed'},x=await runtimeFixture(async()=>[{state:'accepted'}],options),{f}=x,assigned=await good(f.managerToken,'assign',f.assignment),claim=await good(f.executorToken,'claim',claimBody(assigned));
      const evidence=await good(f.executorToken,'readStockEvidence',leasedBody(claim,claim));let reported;
      options.onStatus=async()=>{options.onStatus=null;reported=await good(f.executorToken,'report',reportBody(evidence,claim,evidence));};
      await x.runtime.recoverOutbox(f.manager,{authVersion:1,after:0,limit:100});const current=await good(f.managerToken,'get',{taskId:claim.taskId,authVersion:1});assert.equal(current.state,'awaiting_review');assert.equal(current.report.id,reported.report.id);assert(!current.programFailure);
      const other=await runtimeFixture(async()=>[{state:'accepted'}],{status:'completed'}),g=other.f,a=await good(g.managerToken,'assign',g.assignment),c=await good(g.executorToken,'claim',claimBody(a));
      await put(g.storeId,grantKey(g.manager.agentId),{enabled:false,channelId:g.channel.id,principal:g.manager});const before=other.polls();await assert.rejects(other.runtime.recoverOutbox(g.manager,{authVersion:1,after:0,limit:100}));assert.equal(other.polls(),before);
      await put(g.storeId,grantKey(g.manager.agentId),{enabled:true,channelId:g.channel.id,principal:g.manager});
      const bad=createAgentTaskDispatcher(prisma,deps,'synthetic-runtime',{dispatch:()=>{throw Error('UNUSED')},status:async mapping=>({kind:'status',mapping:{...mapping,hermesRunId:'wrong'},status:'completed',next:'read_backend_report'})},{origin:'http://127.0.0.1:43112',identityId:'synthetic-runtime',credentialGeneration:1});
      await assert.rejects(bad.reconcile(g.manager,{eventId:a.dispatch.eventId,authVersion:1}),/AGENT_DISPATCH_RECEIPT_CHANGED/);assert.equal((await good(g.managerToken,'get',{taskId:c.taskId,authVersion:1})).state,'running');
    });
    await check('terminal supervision: possible billing remains unknown and supervision audit failure rolls back all business records', async () => {
      const x=await runtimeFixture(async()=>[{state:'accepted'}],{status:'completed'}),{f}=x,assigned=await good(f.managerToken,'assign',f.assignment),claim=await good(f.executorToken,'claim',claimBody(assigned));
      await put(f.storeId,'team.communication.agent.model.run.'+claim.runId,{requestId:'ready-but-billing-possible'});await put(f.storeId,'team.communication.agent.model.request.'+f.executor.agentId+'.ready-but-billing-possible',{taskId:claim.taskId,runId:claim.runId,taskVersion:claim.taskVersion,state:'ready',billingStatus:'possible'});
      await x.dispatcher.reconcile(f.manager,{eventId:assigned.dispatch.eventId,authVersion:1});
      const before=await prisma.config.findMany({where:{storeId:f.storeId,key:{startsWith:'team.communication.'}},orderBy:{key:'asc'}}),native=createAgentTaskService(faultDb,deps);
      faultAudit=true;await assert.rejects(native.supervise(f.manager,{taskId:claim.taskId,runId:claim.runId,round:claim.round,expectedVersion:claim.taskVersion,authVersion:1}),/SYNTHETIC_AUDIT_FAILURE/);
      const after=await prisma.config.findMany({where:{storeId:f.storeId,key:{startsWith:'team.communication.'}},orderBy:{key:'asc'}});assert.deepEqual(after,before,'Task, program failure, lease, event cursor and outbox all roll back');
      await x.runtime.recoverOutbox(f.manager,{authVersion:1,after:0,limit:100});const current=await good(f.managerToken,'get',{taskId:claim.taskId,authVersion:1});assert.equal(current.state,'unknown');assert.equal(current.programFailure.knownNotSent,false);assert(!current.report);assert.equal(x.posts(),1);
    });
    await check('runtime recovery cursor: limit-one pagination retries original event after publisher restart using returned cursor', async () => {
      let publisherCalls = 0, mode = 'failed'; const eventIds = [];
      const x = await runtimeFixture(async (_store, event) => { publisherCalls++; eventIds.push(event.id); if (mode === 'failed') throw Error('SYNTHETIC_PUBLISH_FAILURE'); return [] });
      const { f } = x, assigned = await good(f.managerToken, 'assign', f.assignment), claim = await good(f.executorToken, 'claim', claimBody(assigned));
      const evidence = await good(f.executorToken, 'readStockEvidence', leasedBody(claim, claim)), body = reportBody(evidence, claim, evidence);
      await good(f.executorToken, 'report', body); assert.equal(publisherCalls, 1);
      let page = await x.runtime.recoverOutbox(f.manager, { authVersion: 1, after: 0, limit: 1 });
      assert(page.nextCursor > 0); const dispatchCursor = page.nextCursor; assert.equal(publisherCalls, 1);
      mode = 'no_subscription'; page = await x.runtime.recoverOutbox(f.manager, { authVersion: 1, after: dispatchCursor, limit: 1 });
      assert.equal(page.nextCursor, dispatchCursor); assert.equal(page.pendingEventId, eventIds[0]); assert.equal(page.hasMore, true); assert.equal(publisherCalls, 2);
      const durable = await prisma.config.findUnique({ where: { storeId_key: { storeId: f.storeId, key: 'team.communication.agent.outbox.' + eventIds[0] } } });
      assert.equal(JSON.parse(durable.value).delivery.state, 'awaiting_subscription');
      // Rebuild the service-host composition with a fresh publisher; no cursor rewind.
      const restarted = createAgentTaskRuntime(prisma, createAgentTaskService(prisma, deps), x.dispatcher, async (_store, event) => { publisherCalls++; eventIds.push(event.id); return [{ state: 'accepted' }] });
      service = restarted.service;
      const recovered = await restarted.recoverOutbox(f.manager, { authVersion: 1, after: page.nextCursor, limit: 1 });
      assert(recovered.nextCursor > page.nextCursor); assert.equal(publisherCalls, 3); assert.equal(new Set(eventIds).size, 1);
      await restarted.recoverOutbox(f.manager, { authVersion: 1, after: recovered.nextCursor, limit: 1 }); assert.equal(publisherCalls, 3); assert.equal(x.posts(), 1);
    });
    await check('runtime recovery CAS: concurrent lease gate and late failure cannot downgrade accepted delivery or republish report', async () => {
      let started, release, callsA = 0, callsB = 0;
      const begun = new Promise(resolve => { started = resolve }), gate = new Promise((_resolve, reject) => { release = reject });
      const x = await runtimeFixture(async () => { callsA++; started(); await gate; return [] });
      const { f } = x, assigned = await good(f.managerToken, 'assign', f.assignment), claim = await good(f.executorToken, 'claim', claimBody(assigned));
      const evidence = await good(f.executorToken, 'readStockEvidence', leasedBody(claim, claim)), body = reportBody(evidence, claim, evidence);
      const pendingA = request(f.executorToken, 'report', body);
      const safety = setTimeout(() => release(Error('SYNTHETIC_GATE_SAFETY_TIMEOUT')), 15000); await begun;
      const runtimeB = createAgentTaskRuntime(prisma, createAgentTaskService(prisma, deps), x.dispatcher, async () => { callsB++; return [{ state: 'accepted' }] });
      const beforeExpiry = await runtimeB.recoverOutbox(f.manager, { authVersion: 1, after: 0, limit: 100 });
      assert.equal(callsA, 1); assert.equal(callsB, 0); assert(beforeExpiry.pendingEventId); assert(beforeExpiry.nextCursor > 0);
      const key = 'team.communication.agent.outbox.' + beforeExpiry.pendingEventId;
      const leased = await prisma.config.findUnique({ where: { storeId_key: { storeId: f.storeId, key } } });
      const leaseRow = JSON.parse(leased.value); assert.equal(leaseRow.delivery.state, 'sending'); assert(leaseRow.delivery.until > Date.now());
      // Explicit clock-fault fixture: expire only A's persistent delivery lease.
      leaseRow.delivery.until = Date.now() - 1;
      await prisma.config.update({ where: { storeId_key: { storeId: f.storeId, key } }, data: { value: JSON.stringify(leaseRow) } });
      const accepted = await runtimeB.recoverOutbox(f.manager, { authVersion: 1, after: beforeExpiry.nextCursor, limit: 100 }); assert.equal(callsB, 1);
      const committed = await prisma.config.findUnique({ where: { storeId_key: { storeId: f.storeId, key } } }); assert.equal(JSON.parse(committed.value).delivery.state, 'service_accepted');
      release(Error('SYNTHETIC_LATE_A_FAILURE')); clearTimeout(safety); assert.equal((await pendingA).status, 200);
      const settled = await prisma.config.findUnique({ where: { storeId_key: { storeId: f.storeId, key } } }); assert.deepEqual(JSON.parse(settled.value), JSON.parse(committed.value));
      service = runtimeB.service;
      await runtimeB.recoverOutbox(f.manager, { authVersion: 1, after: accepted.nextCursor, limit: 100 });
      await runtimeB.recoverOutbox(f.manager, { authVersion: 1, after: beforeExpiry.nextCursor, limit: 100 });
      await good(f.executorToken, 'report', body);
      assert.equal(callsA, 1); assert.equal(callsB, 1); assert.equal(x.posts(), 1);
    });
    await check('admission bindings: durable concurrent first binding rollback restart and auth-scope replay protection', async () => {
      const origin = 'http://127.0.0.1:43111', profile = 'synthetic-stock-readonly';
      const target = { origin, identityId: 'synthetic', credentialGeneration: 1 };
      async function reserved() {
        const f = await fixture(), task = await good(f.managerToken, 'assign', f.assignment);
        const transport = { dispatch: async prepared => ({ kind: 'admission_unknown', reason: 'network_or_timeout', dispatch: prepared }),
          status: async () => { throw Error('Unexpected fake status call') } };
        const dispatcher = createAgentTaskDispatcher(prisma, deps, profile, transport, target);
        const record = await dispatcher.dispatch(f.manager, { eventId: task.dispatch.eventId, authVersion: 1 });
        assert.equal(record.state, 'admission_unknown'); return { f, task, record };
      }
      // Real persistent dispatcher reservation exists before binding; no metadata fixture shortcut.
      const first = await reserved(), bindings = persistentAdmissionBindings(prisma, first.f.storeId);
      const a = { dispatch: first.record.prepared, origin, authScopeHash: 'a'.repeat(64) };
      const b = { ...a, authScopeHash: 'b'.repeat(64) };
      const race = await Promise.all([bindings.bindOnce(first.task.runId, a), bindings.bindOnce(first.task.runId, b)]);
      assert.deepEqual(race[0], race[1]); assert(['a'.repeat(64), 'b'.repeat(64)].includes(race[0].authScopeHash));
      assert.deepEqual(await bindings.load(first.task.runId), race[0]);
      const bindingRows = await prisma.config.findMany({ where: { storeId: first.f.storeId, key: 'team.communication.agent.transport.binding.' + first.task.runId } });
      assert.equal(bindingRows.length, 1);
      const childCode = `const fs=require('node:fs');const {prisma}=require(${JSON.stringify(root + '/server/dist/config/database')});const {persistentAdmissionBindings}=require(${JSON.stringify(root + '/server/dist/services/agentTasks/admissionBindings')});(async()=>{try{const p=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(await persistentAdmissionBindings(prisma,p.storeId).load(p.runId)));}finally{await prisma.$disconnect()}})().catch(e=>{process.stderr.write(e.stack);process.exitCode=1});`;
      const child = spawnSync(process.execPath, ['-e', childCode], { cwd: root, env: process.env, input: JSON.stringify({ storeId: first.f.storeId, runId: first.task.runId }), encoding: 'utf8', timeout: 30000 });
      assert.equal(child.status, 0, child.stderr || child.error?.message); assert.deepEqual(JSON.parse(child.stdout), race[0]);
      const second = await reserved(), candidate = { dispatch: second.record.prepared, origin, authScopeHash: 'c'.repeat(64) };
      const before = await prisma.config.findMany({ where: { storeId: second.f.storeId }, orderBy: { key: 'asc' } });
      faultAudit = true;
      await assert.rejects(() => persistentAdmissionBindings(faultDb, second.f.storeId).bindOnce(second.task.runId, candidate), /SYNTHETIC_AUDIT_FAILURE/);
      assert.deepEqual(await prisma.config.findMany({ where: { storeId: second.f.storeId }, orderBy: { key: 'asc' } }), before);
      assert.equal(await persistentAdmissionBindings(prisma, second.f.storeId).load(second.task.runId), undefined);
      // Actual client + persistent bindings; fetch is fake and never sends network traffic.
      const lost = await fixture(), lostTask = await good(lost.managerToken, 'assign', lost.assignment); let callsA = 0, callsB = 0;
      const originalClient = new HermesRunsClient({ origin, profile, bearerToken: () => 'synthetic-a', admissionBindings: persistentAdmissionBindings(prisma, lost.storeId),
        fetch: async (url, init) => { callsA++; assert.equal(new URL(url).origin, origin); assert.equal(init.method, 'POST'); throw Error('SYNTHETIC_RESPONSE_LOST') } });
      const dispatch = createAgentTaskDispatcher(prisma, deps, profile, originalClient, target);
      const unknown = await dispatch.dispatch(lost.manager, { eventId: lostTask.dispatch.eventId, authVersion: 1 });
      assert.equal(unknown.state, 'admission_unknown'); assert.equal(callsA, 1);
      const persisted = await persistentAdmissionBindings(prisma, lost.storeId).load(lostTask.runId);
      const rotated = new HermesRunsClient({ origin, profile, bearerToken: () => 'synthetic-b', admissionBindings: persistentAdmissionBindings(prisma, lost.storeId),
        fetch: async () => { callsB++; throw Error('ROTATED_AUTH_MUST_NOT_SEND_HTTP') } });
      const denied = await rotated.dispatch(unknown.prepared);
      assert.equal(denied.kind, 'admission_unknown'); assert.equal(denied.reason, 'auth_scope_changed'); assert.equal(callsB, 0);
      assert.deepEqual(await persistentAdmissionBindings(prisma, lost.storeId).load(lostTask.runId), persisted);
      const started = await fixture(), startedTask = await good(started.managerToken, 'assign', started.assignment); let startedCalls = 0;
      const startedClient = new HermesRunsClient({ origin, profile, bearerToken: () => 'synthetic-started', admissionBindings: persistentAdmissionBindings(prisma, started.storeId),
        fetch: async () => { startedCalls++; return { status: 202, text: async () => JSON.stringify({ run_id: 'run_synthetic_started', status: 'started', replayed: false }) } } });
      const admitted = await createAgentTaskDispatcher(prisma, deps, profile, startedClient, target).dispatch(started.manager, { eventId: startedTask.dispatch.eventId, authVersion: 1 });
      assert.equal(startedCalls, 1); assert.equal(admitted.state, 'admitted'); assert.equal(admitted.mapping.hermesRunId, 'run_synthetic_started');
      assert.equal((await good(started.managerToken, 'get', { taskId: startedTask.taskId, authVersion: 1 })).state, 'assigned');
    });
    await check('projection scope: executor claim-only metadata and legacy receipt never expose review evidence', async () => {
      const f = await fixture(), assigned = await good(f.managerToken, 'assign', f.assignment), claim = await good(f.executorToken, 'claim', claimBody(assigned));
      const evidence = await good(f.executorToken, 'readStockEvidence', leasedBody(claim, claim));
      const body = { ...reportBody(evidence, claim, evidence), rawReport: '  SYNTHETIC_PRIVATE_REPORT_MARKER\n  ' };
      const result = await good(f.executorToken, 'report', body);
      const full = await good(f.managerToken, 'get', { taskId: assigned.taskId, authVersion: 1 });
      assert.equal(full.report.rawReport, body.rawReport); assert.deepEqual(full.evidence.evidence, evidence.evidence);
      function metadata(view) {
        assert(!Object.hasOwn(view, 'evidence')); assert.deepEqual(Object.keys(view.report).sort(), ['createdAt', 'id', 'outcome', 'round', 'runId', 'version']);
        assert(!JSON.stringify(view).includes('SYNTHETIC_PRIVATE_REPORT_MARKER')); assert(!JSON.stringify(view).includes(evidence.inputSnapshotHash));
        assert(!Object.hasOwn(view.report, 'sourceRefs')); assert(!Object.hasOwn(view.report, 'runtimeReceipt'));
      }
      metadata(result);
      // Explicit legacy-receipt fixture: the old implementation persisted a full view.
      const receiptKey = 'team.communication.agent.request.' + f.executor.agentId + '.' + body.requestId;
      const saved = await prisma.config.findUnique({ where: { storeId_key: { storeId: f.storeId, key: receiptKey } } });
      const legacyReceipt = JSON.parse(saved.value); legacyReceipt.result = { ...legacyReceipt.result, evidence: full.evidence, report: full.report };
      await prisma.config.update({ where: { storeId_key: { storeId: f.storeId, key: receiptKey } }, data: { value: JSON.stringify(legacyReceipt) } });
      await put(f.storeId, grantKey(f.executor.agentId), { enabled: true, channelId: f.channel.id, principal: { ...f.executor, scopes: ['executor.claim'] } });
      metadata(await good(f.executorToken, 'get', { taskId: assigned.taskId, authVersion: 1 }));
      assert.equal((await request(f.executorToken, 'report', body)).status, 403);
      await put(f.storeId, grantKey(f.executor.agentId), { enabled: true, channelId: f.channel.id, principal: { ...f.executor, scopes: ['executor.claim', 'executor.report'] } });
      metadata(await good(f.executorToken, 'report', body));
      const stillFull = await good(f.managerToken, 'get', { taskId: assigned.taskId, authVersion: 1 });
      assert.equal(stillFull.report.rawReport, body.rawReport); assert.deepEqual(stillFull.evidence, full.evidence);
    });
    await check('synthetic HTTP auth denies missing identity and injected body principal', async () => {
      const f = await fixture(); assert.equal((await request('missing', 'assign', f.assignment)).status, 401);
      assert.notEqual((await request(f.executorToken, 'assign', { ...f.assignment, principal: f.manager })).status, 200);
    });
    await check('native assign concurrent claim evidence report rework new round and accept preserve one task', async () => {
      const f = await fixture(); let view = await good(f.managerToken, 'assign', f.assignment);
      assert.equal(view.state, 'assigned'); assert.deepEqual(await good(f.managerToken, 'assign', f.assignment), view);
      const competitors = await Promise.all([request(f.executorToken, 'claim', claimBody(view)), request(f.executorToken, 'claim', claimBody(view))]);
      assert.equal(competitors.filter(r => r.status === 200).length, 1); const firstClaim = competitors.find(r => r.status === 200).body.data; assert.equal(firstClaim.state, 'running');
      let evidence = await good(f.executorToken, 'readStockEvidence', leasedBody(firstClaim, firstClaim)); assert(evidence.evidenceId); assert(evidence.evidence.items.some(r => r.id === f.inventory.id));
      const oldReport = reportBody(evidence, firstClaim, evidence); view = await good(f.executorToken, 'report', oldReport); assert.equal(view.state, 'awaiting_review');
      assert.deepEqual(await good(f.executorToken, 'report', oldReport), view);
      const oldRun = view.runId, oldRound = view.round, rework = reviewBody(view, evidence.evidenceId, 'rework');
      view = await good(f.managerToken, 'review', rework); assert.equal(view.state, 'assigned'); assert.equal(view.round, oldRound + 1); assert.notEqual(view.runId, oldRun);
      assert.notEqual((await request(f.executorToken, 'report', { ...oldReport, requestId: randomUUID(), expectedVersion: view.taskVersion })).status, 200);
      const secondClaim = await good(f.executorToken, 'claim', claimBody(view)); evidence = await good(f.executorToken, 'readStockEvidence', leasedBody(secondClaim, secondClaim));
      view = await good(f.executorToken, 'report', reportBody(evidence, secondClaim, evidence)); assert.equal(view.state, 'awaiting_review');
      const accept = reviewBody(view, evidence.evidenceId, 'accept'); view = await good(f.managerToken, 'review', accept); assert.equal(view.state, 'accepted');
      assert.deepEqual(await good(f.managerToken, 'review', accept), view);
      const tasks = await prisma.config.findMany({ where: { storeId: f.storeId, key: { startsWith: 'team.communication.task.' } } });
      assert.equal(tasks.filter(row => JSON.parse(row.value).agentTask).length, 1);
      const events = await good(f.managerToken, 'events', { authVersion: 1, after: 0, limit: 100 }); assert(events.events.some(e => e.type === 'task.report_ready'));
    });
    await check('immutable evidence and raw report: manager GET preserves original snapshot hash and whitespace', async () => {
      const f = await fixture(), assigned = await good(f.managerToken, 'assign', f.assignment), claim = await good(f.executorToken, 'claim', claimBody(assigned));
      const evidence = await good(f.executorToken, 'readStockEvidence', leasedBody(claim, claim));
      const rawReport = '  \nSynthetic original raw executor report only; not Hermes/model.\n  ';
      const reported = await good(f.executorToken, 'report', { ...reportBody(evidence, claim, evidence), rawReport });
      const seen = await good(f.managerToken, 'get', { taskId: assigned.taskId, authVersion: 1 });
      assert(!Object.hasOwn(reported.report, 'rawReport')); assert.equal(seen.report.rawReport, rawReport);
      assert(seen.evidence, 'Manager GET must include immutable evidence for review');
      assert.equal(seen.evidence.evidenceId, evidence.evidenceId);
      assert.equal(seen.evidence.inputSnapshotHash, evidence.inputSnapshotHash);
      assert.deepEqual(seen.evidence.evidence, evidence.evidence);
      // Later native stock movement must never replace evidence attached to the report.
      await prisma.inventory.update({ where: { id: f.inventory.id }, data: { currentStock: 99, ledgerSequence: { increment: 1 } } });
      const later = await good(f.managerToken, 'get', { taskId: assigned.taskId, authVersion: 1 });
      assert.deepEqual(later.evidence, seen.evidence); assert.equal(later.report.rawReport, rawReport);
      const legacy = teamCommunication(prisma);
      for (const human of f.humanActors) {
        assert(!(await legacy.tasks(human, f.channel.id)).some(task => task.id === assigned.taskId || task.agentTask));
        for (const action of ['accept', 'submit', 'return', 'complete', 'cancel']) {
          await assert.rejects(() => legacy.taskAction(human, f.channel.id, assigned.taskId, {
            requestId: randomUUID(), expectedVersion: seen.taskVersion, action, note: 'Synthetic legacy bypass probe', sourceSeq: [], criteriaConfirmed: true
          }), error => error.status === 403 && error.message === 'TEAM_AGENT_TASK_PRINCIPAL_REQUIRED');
        }
      }
      const unchanged = await good(f.managerToken, 'get', { taskId: assigned.taskId, authVersion: 1 });
      assert.equal(unchanged.taskVersion, seen.taskVersion); assert.equal(unchanged.state, 'awaiting_review');
    });
    await check('service restart retains native task and exact original assignment receipt', async () => {
      const f = await fixture(), assigned = await good(f.managerToken, 'assign', f.assignment);
      const claim = await good(f.executorToken, 'claim', claimBody(assigned)); await close(); await open();
      assert.deepEqual(await good(f.managerToken, 'assign', f.assignment), assigned);
      const current = await good(f.managerToken, 'get', { taskId: assigned.taskId, authVersion: 1 }); assert.equal(current.state, 'running'); assert.equal(current.runId, claim.runId);
      assert.equal(current.taskId, assigned.taskId);
      const separateProcess = restartProcessProbe(f); assert.deepEqual(separateProcess.receipt, assigned); assert.equal(separateProcess.current.state, 'running'); assert.equal(separateProcess.current.taskId, assigned.taskId);
    });
    await check('audit failure rolls back assignment request task and dispatch atomically', async () => {
      const f = await fixture(), before = await prisma.config.findMany({ where: { storeId: f.storeId }, orderBy: { key: 'asc' } });
      await close(); await open(faultDb); faultAudit = true;
      const failed = await request(f.managerToken, 'assign', f.assignment); assert.notEqual(failed.status, 200); assert(JSON.stringify(failed).includes('SYNTHETIC_AUDIT_FAILURE'));
      assert.deepEqual(await prisma.config.findMany({ where: { storeId: f.storeId }, orderBy: { key: 'asc' } }), before);
      await close(); await open(); const created = await good(f.managerToken, 'assign', f.assignment); assert.equal(created.state, 'assigned');
    });
    await check('unknown report blocks redispatch rather than manufacturing another execution', async () => {
      const f = await fixture(), assigned = await good(f.managerToken, 'assign', f.assignment), claim = await good(f.executorToken, 'claim', claimBody(assigned));
      const unknown = await good(f.executorToken, 'report', reportBody(claim, claim, null, 'unknown')); assert.equal(unknown.state, 'unknown');
      assert.notEqual((await request(f.executorToken, 'claim', claimBody(unknown))).status, 200);
      assert.deepEqual(await good(f.managerToken, 'assign', f.assignment), assigned);
      assert.notEqual((await request(f.managerToken, 'review', reviewBody(unknown, randomUUID(), 'rework'))).status, 200);
      assert.equal((await good(f.managerToken, 'get', { taskId: unknown.taskId, authVersion: 1 })).state, 'unknown');
    });
  } finally {
    await close();
    const out = path.join(root, 'output/agent-tasks'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'http-results.json'), JSON.stringify({ passed, failures, testRun: process.env.BT_TEST_RUN,
      authentication: 'synthetic bearer with server-side principal resolution; not production auth or MCP', realHermesRuns: 0, realModelCalls: 0, productionWrites: 0 }, null, 2) + '\n');
    await prisma.$disconnect();
  }
  assert(passed.length + failures.length > 0, 'CASE_FILTER matched no cases'); if (failures.length) throw Error('AGENT_TASK_HTTP_FAILED_' + failures.length);
})().catch(error => { console.error(error); process.exitCode = 1 });
