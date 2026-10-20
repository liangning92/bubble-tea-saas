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
  if (process.env.CASE_FILTER && !name.includes(process.env.CASE_FILTER)) return;
  try { await fn(); passed.push(name); console.log('PASS', name) } catch (error) { failures.push({ name, error: error.stack || error.message }); console.error('FAIL', name, error); }
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
      assert.equal(reported.report.rawReport, rawReport); assert.equal(seen.report.rawReport, rawReport);
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
