/* Official clients + real backend service + disposable PG/HTTP. Synthetic identities/reports only. */
const assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { randomUUID, randomBytes, generateKeyPairSync } = require('node:crypto');
const execFile = require('node:util').promisify(require('node:child_process').execFile);
const root = path.resolve(__dirname, '../..'), lib = name => require(root + '/server/node_modules/' + name);
const { PrismaClient } = lib('@prisma/client'), jwt = lib('jsonwebtoken'), { Webhook } = lib('standardwebhooks'), z = lib('zod-mcp');
const { Client, StreamableHTTPClientTransport } = lib('@modelcontextprotocol/client');
const { Client: LegacyClient } = lib('@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const { StreamableHTTPClientTransport: LegacyTransport } = lib('@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js');
const { toNodeHandler } = lib('@modelcontextprotocol/node');
const built = name => require(root + '/server/dist/services/' + name);
const { agentMcpHandler } = built('externalMcp/agentHandler'), { jwtAccessVerifier } = built('externalMcp/auth');
const { isolatedAgentBindingKey, agentIdentityHash } = built('externalMcp/agentBindings');
const { createAgentTaskService } = built('agentTasks/service');
const automatic = process.env.MCP_EVENT_AUTOMATIC === '1';
const automaticModules = automatic ? { ...built('agentTasks/runtime'), ...built('agentTasks/dispatch'), ...built('agentTasks/admissionBindings'), ...built('hermesTransport/client') } : {};
const db = new PrismaClient(), results = [], keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const storeId = 'events-fixture-store', channelId = randomUUID(), managerId = randomUUID(), executorId = randomUUID();
const issuer = 'https://isolated-issuer.invalid', who = role => ({ issuer, clientId: 'fixture-' + role, subject: 'subject-' + role, tokenId: 'token-' + role });
const grants = ['management.assign', 'management.read', 'management.review', 'executor.claim', 'executor.evidence', 'executor.report'];
let server, receiver, handler, nodeHandler, resource, callback, manager, executor, legacy, registrations, business, bindings, task, firstClaim;
let callbackStatus = 200, callbackKeys = [], received = [], runtime, fakeAdmissions = [];
const encryptionKey = randomBytes(32), secret = 'whsec_' + randomBytes(32).toString('base64'), wire = [], discoveryResponses = [];
async function check(name, fn) { if (automatic && !name.startsWith('automatic runtime')) return; if (process.env.MCP_EVENT_DELTA === '1' && /handler restart|persistent bounded|secret rotation|grant changes|unauthenticated/.test(name)) return; await fn(); results.push(name); console.log('PASS ' + name); }
async function config(key, value) { await db.config.upsert({ where: { storeId_key: { storeId, key } }, create: { storeId, key, value: JSON.stringify(value), category: 'externalAgent' }, update: { value: JSON.stringify(value) } }); }
function sign(role, scope = grants.join(' ')) {
  const p = who(role), now = Math.floor(Date.now() / 1000);
  return jwt.sign({ iss: issuer, aud: resource.href, sub: p.subject, client_id: p.clientId, jti: p.tokenId, scope, iat: now, exp: now + 120 }, keys.privateKey, { algorithm: 'RS256', header: { typ: 'at+jwt' } });
}
async function safeFetch(input, init) {
  const url = new URL(typeof input === 'string' ? input : input.url || input); assert.equal(url.origin, resource.origin);
  if (init?.body) try { wire.push(JSON.parse(init.body).method); } catch {}
  const response = await fetch(input, init); if (init?.body && JSON.parse(init.body).method === 'server/discover') discoveryResponses.push(await response.clone().json()); return response;
}
async function connect(role, old = false, scope) {
  const c = old ? new LegacyClient({ name: 'legacy-fixture', version: '1' }) : new Client({ name: 'events-fixture', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  const T = old ? LegacyTransport : StreamableHTTPClientTransport;
  await c.connect(new T(resource, { fetch: safeFetch, requestInit: { headers: { Authorization: 'Bearer ' + sign(role, scope) } } })); return c;
}
const request = (client, method, params) => client.request({ method, params }, z.looseObject({}));
async function call(client, name, args) {
  const result = await client.callTool({ name: 'store_task_' + name, arguments: args });
  assert(!result.isError, 'Tool rejected: ' + name + ' ' + JSON.stringify(result)); return result.structuredContent.task;
}
const plan = () => ({ objective: 'Synthetic stock read-only evidence review', scope: 'stock_readonly_v1', constraints: ['No business writes or employee contact'], deadlineAt: new Date(Date.now() + 3600000).toISOString(), firstReportWithinMs: 600000, evidenceRequired: 'Persist immutable read-only snapshot', criteria: [{ id: 'source', standard: 'Use only authoritative snapshot' }] });
const subscription = () => ({ name: 'task.report_ready', arguments: { taskId: task.taskId }, delivery: { mode: 'webhook', url: 'https://callback.example.com/events', secret }, cursor: null, ttlMs: 600000 });
const event = () => ({ eventId: randomUUID(), name: 'task.report_ready', timestamp: new Date().toISOString(), data: { taskId: task.taskId, runId: task.runId, round: task.round, taskVersion: task.taskVersion, reportId: randomUUID(), reportVersion: 1 }, cursor: null });
function create() {
  handler = agentMcpHandler({ resource, issuerMetadata: { issuer, authorization_endpoint: issuer + '/authorize', token_endpoint: issuer + '/token', response_types_supported: ['code'] }, verifier: jwtAccessVerifier({ issuer, resource, publicKey: keys.publicKey }), mode: 'isolated-test', encryptionKey,
    isolatedWebhookPost: async (url, body, headers) => { assert.equal(url, 'https://callback.example.com/events'); const r = await fetch(callback, { method: 'POST', headers, body, redirect: 'error' }); return { status: r.status, body: await r.text() }; },
    createService: (database, b) => {
      bindings = b; business = createAgentTaskService(database, { authorize: b.authorize, executorFor: (tx, p, channel) => b.executorFor(tx, p, channel) });
      if (automatic) {
        const origin = new URL(callback).origin;
        const transport = new automaticModules.HermesRunsClient({ origin, profile: 'stock_fixture', bearerToken: () => 'synthetic-hermes-test-only', admissionBindings: automaticModules.persistentAdmissionBindings(database, storeId), fetch: async (url, init) => { assert.equal(new URL(url).origin, origin); return fetch(url, init); } });
        const dispatcher = automaticModules.createAgentTaskDispatcher(database, { authorize: b.authorize }, 'stock_fixture', transport, { origin, identityId: 'fixture-executor', credentialGeneration: 1 });
        runtime = automaticModules.createAgentTaskRuntime(database, business, dispatcher, (store, e) => handler.deliver(store, { eventId: e.id, name: e.type, timestamp: e.occurredAt, data: e.payload, cursor: null }));
        return runtime.service;
      }
      return business;
    }
  });
  nodeHandler = toNodeHandler(handler, { maxRequestBodySize: 131072 });
}
async function deliverOutbox() {
  const p = await bindings.resolve(who('manager'), grants, 'management.read');
  const page = await business.events(p, { authVersion: p.grantVersion, after: 0, limit: 100 });
  for (const e of page.events.filter(e => e.type !== 'task.dispatch_ready')) await handler.deliver(storeId, { eventId: e.id, name: e.type, timestamp: e.occurredAt, data: e.payload, cursor: null });
}
function leaseArgs(view, lease) { return { taskId: view.taskId, runId: view.runId, round: view.round, expectedVersion: view.taskVersion, leaseVersion: view.leaseVersion, leaseToken: lease.leaseToken }; }
(async () => {
  try {
    assert.equal(process.env.NODE_ENV, 'test'); assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));
    const url = new URL(process.env.DATABASE_URL); assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/team_test');
    const tenant = await db.tenant.create({ data: { name: 'Events isolation fixture' } }); await db.store.create({ data: { id: storeId, name: storeId, tenantId: tenant.id } });
    registrations = ['manager', 'executor'].map(role => ({ identityHash: agentIdentityHash(who(role)), agentId: role === 'manager' ? managerId : executorId, role, grantVersion: 1, clientRevision: 1, scopes: grants.filter(s => s.startsWith(role === 'manager' ? 'management.' : 'executor.')), channelIds: [channelId], revoked: false, revokedTokenHashes: [], environment: 'isolated-test' }));
    await config(isolatedAgentBindingKey, registrations);
    await config('team.communication.channel.' + channelId, { id: channelId, lastSeq: 1, archived: false, members: [] });
    receiver = http.createServer(async (req, res) => {
      try {
        let body = ''; for await (const part of req) body += part;
        if (req.url.startsWith('/p/stock_fixture/v1/runs')) {
          assert(automatic); assert.equal(req.headers.authorization, 'Bearer synthetic-hermes-test-only');
          if (req.method === 'POST') {
            assert(!fakeAdmissions.some(r => r.key === req.headers['idempotency-key']), 'Duplicate real HTTP admission');
            const runId = 'run_' + randomUUID(); fakeAdmissions.push({ key: req.headers['idempotency-key'], body, runId });
            assert(!body.includes('leaseToken')); res.writeHead(202, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ run_id: runId, status: 'started', replayed: false }));
          } else { const runId = req.url.split('/').at(-1); assert(fakeAdmissions.some(r => r.runId === runId)); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ run_id: runId, status: 'completed' })); }
          return;
        }
        let value; for (const key of callbackKeys) try { value = new Webhook(key).verify(body, req.headers); break; } catch {}
        assert(value, 'signature verification failed'); received.push({ value, headers: req.headers, bytes: body });
        res.writeHead(callbackStatus, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value.type === 'verification' ? { challenge: value.challenge } : { received: true }));
      } catch { res.writeHead(400); res.end('{}'); }
    });
    callbackKeys = [secret]; await new Promise(r => receiver.listen(0, '127.0.0.1', r)); callback = 'http://127.0.0.1:' + receiver.address().port + '/callback';
    server = http.createServer((req, res) => nodeHandler ? void nodeHandler(req, res) : (res.writeHead(503), res.end()));
    await new Promise(r => server.listen(0, '127.0.0.1', r)); resource = new URL('http://127.0.0.1:' + server.address().port + '/mcp'); create();
    manager = await connect('manager'); executor = await connect('executor'); legacy = await connect('executor', true);
    if (automatic) await check('automatic runtime commits dispatch and Events without manual handoff; rework and restart recovery do not duplicate admission', async () => {
      task = await call(manager, 'assign', { requestId: randomUUID(), expectedVersion: 0, channelId, taskCode: 'STOCK-RO-001', plan: plan() }); assert.equal(fakeAdmissions.length, 1);
      await request(manager, 'events/subscribe', subscription());
      for (let round = 1; round <= 2; round++) {
        const claim = await call(legacy, 'claim', { taskId: task.taskId, runId: task.runId, round: task.round, expectedVersion: task.taskVersion, requestId: randomUUID() }); task = claim;
        const evidence = await call(legacy, 'read_stock_evidence', { ...leaseArgs(task, claim), requestId: randomUUID() }); task = evidence;
        task = await call(legacy, 'report', { ...leaseArgs(task, claim), requestId: randomUUID(), evidenceId: evidence.evidenceId, inputSnapshotHash: evidence.inputSnapshotHash, outcome: 'completed', rawReport: 'SYNTHETIC_AUTOMATIC_REPORT_' + round, sourceRefs: [] });
        assert.equal(received.filter(r => !r.value.type).length, round, 'Report must automatically trigger actual signed callback');
        task = await call(manager, 'get', { taskId: task.taskId }); assert(task.evidence); assert(task.report.rawReport.includes('SYNTHETIC_AUTOMATIC_REPORT_'));
        task = await call(manager, 'review', { taskId: task.taskId, runId: task.runId, round: task.round, expectedVersion: task.taskVersion, reportId: task.report.id, reportVersion: task.report.version, requestId: randomUUID(), decision: round === 1 ? 'rework' : 'accept', check: { summary: 'Synthetic automatic lifecycle review', checkedEvidenceIds: [evidence.evidenceId], criteria: [{ id: 'source', result: round === 1 ? 'not_met' : 'met', note: 'Synthetic verification only' }] }, ...(round === 1 ? { nextPlan: plan() } : {}) });
        assert.equal(fakeAdmissions.length, 2, 'Rework automatically triggers exactly the next run');
      }
      assert.equal(task.state, 'accepted'); const count = received.length;
      await handler.close(); create(); const p = await bindings.resolve(who('manager'), grants, 'management.read');
      await runtime.recoverOutbox(p, { authVersion: p.grantVersion, after: 0, limit: 100 });
      assert.equal(fakeAdmissions.length, 2); assert.equal(received.length, count);
      const rows = await db.config.findMany({ where: { storeId, key: { startsWith: 'team.communication.agent.outbox.' } } });
      assert(rows.map(r => JSON.parse(r.value)).filter(r => r.event.type === 'task.report_ready').every(r => r.delivery.state === 'service_accepted'));
    });
    await check('official current protocol discovers Events; role-specific tool schemas hide identity and authorization version', async () => {
      assert.equal(manager.getNegotiatedProtocolVersion(), '2026-07-28'); assert(discoveryResponses.some(r => r.result?.capabilities?.events), JSON.stringify(discoveryResponses));
      assert.deepEqual((await request(manager, 'events/list', {})).events.map(e => e.name), ['task.report_ready', 'task.blocked', 'task.failed']);
      const tools = (await manager.listTools()).tools;
      assert.deepEqual(tools.map(t => t.name).sort(), ['store_task_assign', 'store_task_get', 'store_task_review']);
      for (const tool of tools) assert(!Object.hasOwn(tool.inputSchema.properties, 'authVersion'));
      assert((await legacy.listTools()).tools.some(t => t.name === 'store_task_claim')); await assert.rejects(() => request(executor, 'events/list', {}));
    });
    await check('dot actually assigns once through MCP; Hermes legacy reads and claims exactly one lease', async () => {
      const input = { requestId: randomUUID(), expectedVersion: 0, channelId, taskCode: 'STOCK-RO-001', plan: plan() };
      task = await call(manager, 'assign', input); assert.deepEqual(await call(manager, 'assign', input), task);
      assert.equal((await call(legacy, 'get', { taskId: task.taskId })).taskId, task.taskId);
      const claim = { taskId: task.taskId, runId: task.runId, round: task.round, requestId: randomUUID(), expectedVersion: task.taskVersion };
      firstClaim = await call(legacy, 'claim', claim); assert.deepEqual(await call(legacy, 'claim', claim), firstClaim); task = firstClaim;
      const duplicate = await executor.callTool({ name: 'store_task_claim', arguments: { ...claim, requestId: randomUUID() } }); assert(duplicate.isError);
      for (const extra of [{ agentId: executorId }, { storeId: 'other' }, { authVersion: 999 }, { approved: true }]) {
        const result = await manager.callTool({ name: 'store_task_get', arguments: { taskId: task.taskId, ...extra } }).catch(() => ({ isError: true })); assert(result.isError);
      }
    });
    await check('signed callback verification gates activation and actual PostgreSQL encrypts subscription credentials', async () => {
      const first = await request(manager, 'events/subscribe', subscription()), second = await request(manager, 'events/subscribe', subscription()); assert.equal(first.id, second.id); assert(first.refreshBefore);
      const row = await db.config.findUnique({ where: { storeId_key: { storeId, key: 'externalAgent.events.v1' } } }); assert(!row.value.includes(secret)); assert(!row.value.includes('callback.example.com')); assert(received.every(e => e.value.type === 'verification'));
    });
    await check('real report persists unaccepted, signed Events carry IDs, dot reads immutable evidence and requests rework', async () => {
      const evidence = await call(legacy, 'read_stock_evidence', { ...leaseArgs(task, firstClaim), requestId: randomUUID() }); task = evidence;
      const limited = await connect('executor', false, 'executor.claim');
      const receiptOnly = await call(limited, 'get', { taskId: task.taskId }); assert(!receiptOnly.evidence); assert(!JSON.stringify(receiptOnly).includes('team.stock.readonly.v1')); await limited.close();
      const reportInput = { ...leaseArgs(task, firstClaim), requestId: randomUUID(), evidenceId: evidence.evidenceId, inputSnapshotHash: evidence.inputSnapshotHash, rawReport: 'SYNTHETIC_RAW_REPORT: no model invoked', sourceRefs: [], outcome: 'completed', runtimeReceipt: { hermesRunId: 'synthetic-run-one' } };
      task = await call(legacy, 'report', reportInput); assert.equal(task.state, 'awaiting_review'); assert.deepEqual(await call(legacy, 'report', reportInput), task);
      await deliverOutbox(); const delivered = received.filter(e => !e.value.type); assert.equal(delivered.length, 1); assert.equal(delivered[0].value.name, 'task.report_ready'); assert(!delivered[0].bytes.includes('SYNTHETIC_RAW_REPORT'));
      task = await call(manager, 'get', { taskId: task.taskId }); assert.equal(task.evidence.evidenceId, evidence.evidenceId); assert(task.report.rawReport.includes('SYNTHETIC_RAW_REPORT'));
      const review = { taskId: task.taskId, runId: task.runId, round: task.round, expectedVersion: task.taskVersion, reportId: task.report.id, reportVersion: task.report.version, requestId: randomUUID(), decision: 'rework', check: { summary: 'Synthetic review requires another pass', checkedEvidenceIds: [evidence.evidenceId], criteria: [{ id: 'source', result: 'not_met', note: 'Test rework lifecycle' }] }, nextPlan: plan() };
      task = await call(manager, 'review', review); assert.equal(task.round, 2); assert.equal(task.state, 'assigned'); assert.deepEqual(await call(manager, 'review', review), task);
      const stale = await legacy.callTool({ name: 'store_task_report', arguments: { ...reportInput, requestId: randomUUID() } }); assert(stale.isError);
    });
    await check('second run reports then dot actually accepts by criteria; receipts and historical raw reports remain durable', async () => {
      const claim = await call(legacy, 'claim', { taskId: task.taskId, runId: task.runId, round: task.round, expectedVersion: task.taskVersion, requestId: randomUUID() }); task = claim;
      const evidence = await call(legacy, 'read_stock_evidence', { ...leaseArgs(task, claim), requestId: randomUUID() }); task = evidence;
      task = await call(legacy, 'report', { ...leaseArgs(task, claim), requestId: randomUUID(), evidenceId: evidence.evidenceId, inputSnapshotHash: evidence.inputSnapshotHash, outcome: 'completed', rawReport: 'SYNTHETIC_SECOND_REPORT', sourceRefs: [] });
      await deliverOutbox(); const review = { taskId: task.taskId, runId: task.runId, round: task.round, expectedVersion: task.taskVersion, reportId: task.report.id, reportVersion: task.report.version, requestId: randomUUID(), decision: 'accept', check: { summary: 'Synthetic evidence checked', checkedEvidenceIds: [evidence.evidenceId], criteria: [{ id: 'source', result: 'met', note: 'Authoritative empty fixture snapshot read' }] } };
      task = await call(manager, 'review', review); assert.equal(task.state, 'accepted'); assert.deepEqual(await call(manager, 'review', review), task);
      const reports = await db.config.findMany({ where: { storeId, key: { startsWith: 'team.communication.agent.report.' } } }); assert.equal(reports.length, 2);
    });
    await check('handler restart preserves subscriptions and dedupe receipts; callback filters ignore other task IDs', async () => {
      const e = event(); await handler.deliver(storeId, e); const before = received.length; await handler.close(); create(); await handler.deliver(storeId, e); assert.equal(received.length, before);
      assert.deepEqual(await handler.deliver(storeId, { ...event(), data: { ...event().data, taskId: randomUUID() } }), []); await handler.deliver(storeId, event()); assert.equal(received.length, before + 1);
    });
    await check('persistent bounded retry and Gone termination prevent subsequent deliveries', async () => {
      callbackStatus = 503; const e = event(); assert.equal((await handler.deliver(storeId, e))[0].state, 'retry'); const before = received.length; await handler.deliver(storeId, e); assert.equal(received.length, before);
      callbackStatus = 410; assert.equal((await handler.deliver(storeId, event()))[0].state, 'stopped'); callbackStatus = 200; assert.deepEqual(await handler.deliver(storeId, event()), []); await request(manager, 'events/subscribe', subscription());
    });
    await check('secret rotation and idempotent unsubscribe require owner and stop future deliveries', async () => {
      const next = 'whsec_' + randomBytes(32).toString('base64'); callbackKeys = [next, secret]; const input = subscription();
      await request(manager, 'events/subscribe', { ...input, delivery: { ...input.delivery, secret: next } }); await handler.deliver(storeId, event()); assert(received.at(-1).headers['webhook-signature'].split(' ').length >= 2);
      const cancel = { name: input.name, arguments: input.arguments, delivery: { mode: 'webhook', url: input.delivery.url } }; await request(manager, 'events/unsubscribe', cancel); await request(manager, 'events/unsubscribe', cancel); assert.deepEqual(await handler.deliver(storeId, event()), []);
    });
    await check('targeted token revocation also terminates its subscription without exposing token IDs', async () => {
      callbackKeys = [secret]; await request(manager, 'events/subscribe', subscription());
      const hash = require('node:crypto').createHash('sha256').update(JSON.stringify(who('manager').tokenId)).digest('hex'); registrations[0].revokedTokenHashes = [hash]; await config(isolatedAgentBindingKey, registrations);
      assert.deepEqual(await handler.deliver(storeId, event()), []); registrations[0].revokedTokenHashes = []; await config(isolatedAgentBindingKey, registrations);
    });
    if (process.env.MCP_PYTHON127) await check('official Python MCP SDK 1.27 uses legacy initialize and actual HTTP get with server-injected grant', async () => {
      const result = await execFile(process.env.MCP_PYTHON127, [root + '/tests/stoploss/external-mcp-python127.py'], { env: { ...process.env, MCP_TEST_URL: resource.href, MCP_TEST_TOKEN: sign('executor'), MCP_TEST_TASK: task.taskId }, timeout: 30000 });
      const proof = JSON.parse(result.stdout.trim()); assert.equal(proof.sdk, 'mcp==1.27.0'); assert(proof.actualHttp); console.log(result.stdout.trim());
    });
    await check('grant changes stop stale subscriptions; initialized clients cannot override authVersion or revoked bindings', async () => {
      callbackKeys = [secret]; await request(manager, 'events/subscribe', subscription()); registrations[0].grantVersion = 2; await config(isolatedAgentBindingKey, registrations); assert.deepEqual(await handler.deliver(storeId, event()), []);
      const forged = await manager.callTool({ name: 'store_task_get', arguments: { taskId: task.taskId, authVersion: 1 } }).catch(() => ({ isError: true })); assert(forged.isError);
      registrations[0].revoked = true; await config(isolatedAgentBindingKey, registrations); await assert.rejects(() => manager.listTools());
    });
    await check('unauthenticated calls reject and durable event audits omit callbacks, reports and secrets', async () => {
      const r = await fetch(resource, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'events/list', params: {} }) }); assert.equal(r.status, 401);
      const rows = await db.config.findMany({ where: { storeId, key: { startsWith: 'externalAgent.events.audit.v1.' } } }); assert(rows.length > 0); const text = JSON.stringify(rows); for (const value of [secret, 'callback.example.com', 'SYNTHETIC_RAW_REPORT', 'token-manager']) assert(!text.includes(value));
      assert.equal(await db.inventory.count({ where: { storeId } }), 0);
    });
    fs.mkdirSync(root + '/output/external-mcp-events', { recursive: true });
    fs.writeFileSync(root + '/output/external-mcp-events/results.json', JSON.stringify({ passed: results, actualHttp: true, actualPostgres: true, businessService: 'createAgentTaskService (backend-owned)', automaticRuntime: automatic, callback: 'isolated HTTP receiver; no platform subscription', reports: 'synthetic; no Hermes or model invoked', protocol: '2026-07-28', wireMethods: [...new Set(wire)], projectionDelta: process.env.MCP_EVENT_DELTA === '1', python127Tested: !!process.env.MCP_PYTHON127, productionEnabled: false, externalRequests: 0 }, null, 2));
  } finally {
    await manager?.close(); await executor?.close(); await legacy?.close(); await handler?.close(); if (server) await new Promise(r => server.close(r)); if (receiver) await new Promise(r => receiver.close(r)); await db.$disconnect();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
