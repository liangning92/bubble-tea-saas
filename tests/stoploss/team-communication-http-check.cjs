/* Runs only against the wrapper-created, disposable PostgreSQL database. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const express = require(path.join(root, 'server/node_modules/express'));
const jwt = require(path.join(root, 'server/node_modules/jsonwebtoken'));
const bcrypt = require(path.join(root, 'server/node_modules/bcryptjs'));
const { prisma } = require(path.join(root, 'server/dist/config/database'));
const { config } = require(path.join(root, 'server/dist/config/env'));
const { authenticateBeforeRouting } = require(path.join(root, 'server/dist/middlewares/auth'));
const { declareAccessRoutes } = require(path.join(root, 'server/dist/middlewares/staffAccessV2'));
const { teamCommunicationRouter } = require(path.join(root, 'server/dist/routes/teamCommunication'));
const { employeeWorkspaceRouter } = require(path.join(root, 'server/dist/routes/employeeWorkspace'));
const { authRouter } = require(path.join(root, 'server/dist/routes/auth'));
const { staffPermissionsRouter } = require(path.join(root, 'server/dist/routes/staffPermissions'));
const { configRouter } = require(path.join(root, 'server/dist/routes/config'));
const dbUrl = new URL(process.env.DATABASE_URL);
assert.equal(dbUrl.pathname, '/team_test'); assert(['127.0.0.1', 'localhost'].includes(dbUrl.hostname));
assert(process.env.BT_TEST_RUN?.startsWith('bt-test-')); assert(process.env.UPLOADS_PATH?.includes(process.env.BT_TEST_RUN));
const results = [];
async function test(name, fn) { await fn(); results.push(name); console.log('PASS', name); }
async function seed() {
  const tenant = await prisma.tenant.create({ data: { name: 'Synthetic communication test organization' } });
  for (const id of ['team-store-a', 'team-store-b']) await prisma.store.create({ data: { id, tenantId: tenant.id, name: 'Isolated test ' + id } });
  const password = await bcrypt.hash('team-test-only-2026', 4);
  for (const [id, name, role, storeId, phone] of [
    ['owner', 'Test Owner', 'admin', 'team-store-a', '08000000001'],
    ['alice', 'Test Alice', 'staff', 'team-store-a', '08000000002'],
    ['bob', 'Test Bob', 'staff', 'team-store-a', '08000000003'],
    ['carol', 'Test Carol', 'staff', 'team-store-a', '08000000004'],
    ['auditor', 'Test Auditor', 'manager', 'team-store-a', '08000000005'],
    ['outsider', 'Test Other Store', 'admin', 'team-store-b', '08000000006'],
    ['rate', 'Test Rate', 'staff', 'team-store-a', '08000000007']]) {
    await prisma.user.create({ data: { id: 'u-' + id, phone, password, role, storeId,
      staff: { create: { id: 's-' + id, storeId, name, employeeNumber: 'TEAM-' + id } } } });
  }
  await prisma.config.create({ data: { storeId: 'team-store-a', key: 'staff.access.policy.v2', category: 'staff', value: JSON.stringify({ version: 2, active: true, revision: 1,
    roles: [{ id: 'audit-only', name: 'Audit only', description: '', permissions: { 'team.audit': 'allow' } }],
    assignments: [{ staffId: 's-auditor', roleId: 'audit-only', overrides: {} }] }) } });
}
const token = async id => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: 'u-' + id }, include: { staff: true } });
  return jwt.sign({ id: user.id, role: user.role, phone: user.phone, storeId: user.storeId, staffId: user.staff.id, issuedAtMs: Date.now() }, config.jwt.secret, { expiresIn: '1h' });
};
async function main() {
  await seed();
  const app = express(); app.use(express.json({ limit: '256kb' }));
  let pauseMessages = false, dropNextResponse = false;
  app.post('/fixture/outage', (req, res) => { pauseMessages = req.body.pause === true; res.json({ paused: pauseMessages }); });
  app.use('/api/team', (req, res, next) => {
    if (req.method === 'POST' && /^\/channels\/[^/]+\/messages$/.test(req.path)) {
      if (pauseMessages) return res.status(503).json({ code: 503, message: 'ISOLATED_SERVICE_OUTAGE' });
      if (dropNextResponse) { dropNextResponse = false; res.json = () => { req.socket.destroy(); return res; }; }
    }
    next();
  });
  app.use('/api/auth', declareAccessRoutes('/api/auth', authRouter));
  for (const [base, router] of [['/api/team', teamCommunicationRouter], ['/api/staff-work', employeeWorkspaceRouter], ['/api/staff-permissions', staffPermissionsRouter], ['/api/config', configRouter]]) {
    app.use(base, authenticateBeforeRouting, declareAccessRoutes(base, router));
  }
  app.use('/api', (_req, res) => res.status(404).json({ code: 404, message: 'ISOLATED_TEST_ENDPOINT_NOT_MOUNTED' }));
  const staffDist = path.join(root, 'client-staff/dist'), adminDist = path.join(root, 'client-admin/dist');
  // Separate local test origins retain the real application routes and session isolation.
  app.use((req, res, next) => express.static(req.headers.host?.startsWith('localhost:') ? adminDist : staffDist)(req, res, next));
  app.get('*', (req, res) => res.sendFile(path.join(req.headers.host?.startsWith('localhost:') ? adminDist : staffDist, 'index.html')));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const tokens = Object.fromEntries(await Promise.all(['owner', 'alice', 'bob', 'carol', 'auditor', 'outsider', 'rate'].map(async id => [id, await token(id)])));
  const request = async (who, method, url, data, employee = false) => {
    const response = await fetch(base + '/api' + url, { method, headers: { Authorization: 'Bearer ' + tokens[who], ...(employee ? { 'X-Client-App': 'employee' } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const good = async (...args) => { const r = await request(...args); assert.equal(r.status, 200, JSON.stringify(r)); return r.body.data; };
  const create = (who, kind, members, title = 'Synthetic ' + kind) => good(who, 'POST', '/team/channels', { requestId: randomUUID(), title, kind, members });
  const send = (who, id, text, extra = {}) => good(who, 'POST', `/team/channels/${id}/messages`, { requestId: randomUUID(), text, ...extra });
  let direct, group, meeting, fileId;
  try {
    await test('identity, store-scoped directory, separate management and audit capabilities', async () => {
      assert.equal((await good('alice', 'GET', '/team/directory', undefined, true)).length, 6);
      assert.equal((await request('alice', 'GET', '/team/admin/channels')).status, 403);
      assert.deepEqual(await good('auditor', 'GET', '/team/capabilities'), { manage: false, audit: true });
      assert.equal((await request('auditor', 'GET', '/team/admin/channels', undefined, true)).status, 403);
    });
    await test('direct creation deduplication, request retry and payload-conflict rejection', async () => {
      const input = { requestId: randomUUID(), title: 'Private work conversation', kind: 'direct', members: ['s-bob'] };
      direct = await good('alice', 'POST', '/team/channels', input);
      assert.equal((await good('alice', 'POST', '/team/channels', input)).id, direct.id);
      assert.equal((await create('bob', 'direct', ['s-alice'])).id, direct.id);
      const message = { requestId: randomUUID(), text: 'Original message remains unchanged', files: [] };
      const first = await good('alice', 'POST', `/team/channels/${direct.id}/messages`, message);
      assert.equal((await good('alice', 'POST', `/team/channels/${direct.id}/messages`, message)).id, first.id);
      assert.equal((await request('alice', 'POST', `/team/channels/${direct.id}/messages`, { ...message, text: 'Changed' })).status, 409);
    });
    await test('concurrent messages receive unique contiguous sequence numbers; reconnect cursor recovers every message', async () => {
      await Promise.all(Array.from({ length: 12 }, (_, i) => send(i % 2 ? 'alice' : 'bob', direct.id, 'Concurrent ' + i)));
      const page = await good('bob', 'GET', `/team/channels/${direct.id}/messages?after=0`);
      assert.deepEqual(page.messages.map(m => m.seq), Array.from({ length: 13 }, (_, i) => i + 1));
      const reconnect = await good('bob', 'GET', `/team/channels/${direct.id}/messages?after=5`);
      assert.deepEqual(reconnect.messages.map(m => m.seq), [6, 7, 8, 9, 10, 11, 12, 13]);
      assert.equal((await good('bob', 'GET', `/team/channels/${direct.id}/messages?after=13`)).messages.length, 0);
    });
    await test('lost HTTP response retries return the committed message without duplication', async () => {
      const c = await create('owner', 'group', ['s-alice']);
      const payload = { requestId: randomUUID(), text: 'Synthetic lost-response test' };
      dropNextResponse = true;
      await assert.rejects(request('owner', 'POST', `/team/channels/${c.id}/messages`, payload));
      const retry = await good('owner', 'POST', `/team/channels/${c.id}/messages`, payload);
      assert.equal(retry.seq, 1);
      assert.equal((await good('alice', 'GET', `/team/channels/${c.id}/messages`)).messages.length, 1);
    });
    await test('persisted cursor pagination recovers a gap larger than a response page', async () => {
      const c = await create('owner', 'group', ['s-alice']);
      await prisma.config.createMany({ data: Array.from({ length: 205 }, (_, i) => ({ storeId: 'team-store-a', category: 'staff', key: `team.communication.message.${c.id}.${String(i + 1).padStart(12, '0')}`, value: JSON.stringify({ id: randomUUID(), requestId: randomUUID(), channelId: c.id, seq: i + 1, authorId: 's-owner', authorName: 'Synthetic Owner', text: 'Pagination fixture ' + (i + 1), files: [], createdAt: new Date().toISOString() }) })) });
      await prisma.config.update({ where: { storeId_key: { storeId: 'team-store-a', key: 'team.communication.channel.' + c.id } }, data: { value: JSON.stringify({ ...c, lastSeq: 205 }) } });
      let cursor = 0, recovered = [];
      for (;;) { const page = await good('alice', 'GET', `/team/channels/${c.id}/messages?after=${cursor}`); recovered.push(...page.messages); cursor = page.cursor; if (!page.hasMore) break; }
      assert.deepEqual(recovered.map(m => m.seq), Array.from({ length: 205 }, (_, i) => i + 1));
      assert.equal(new Set(recovered.map(m => m.id)).size, 205);
    });
    await test('per-person monotonic read receipts and unread counters', async () => {
      await good('bob', 'PUT', `/team/channels/${direct.id}/read`, { seq: 5 });
      await good('bob', 'PUT', `/team/channels/${direct.id}/read`, { seq: 2 });
      const receipt = await good('alice', 'GET', `/team/channels/${direct.id}/receipts`);
      assert.equal(receipt.find(r => r.staffId === 's-bob').seq, 5);
      assert.equal(receipt.find(r => r.staffId === 's-alice').seq, 0);
      assert.equal((await good('bob', 'GET', '/team/channels')).find(c => c.id === direct.id).unread, 8);
    });
    await test('private chat access is denied to nonmembers and other stores; authorized audit requires a reason and creates an audit record', async () => {
      assert.equal((await request('carol', 'GET', `/team/channels/${direct.id}/messages`)).status, 403);
      assert.equal((await request('outsider', 'GET', `/team/channels/${direct.id}/messages?auditReason=business-review`)).status, 404);
      assert.equal((await request('owner', 'GET', `/team/channels/${direct.id}/messages`)).status, 403);
      await good('auditor', 'GET', '/team/admin/channels');
      const audited = await good('auditor', 'GET', `/team/channels/${direct.id}/messages?auditReason=business-review`);
      assert.equal(audited.audit, true);
      assert.equal((await request('auditor', 'PUT', `/team/channels/${direct.id}/members`, { expectedVersion: direct.version, ownerId: 's-alice', members: ['s-alice', 's-bob'], archived: false })).status, 403);
      assert.equal((await request('alice', 'GET', `/team/channels/${direct.id}/messages?auditReason=business-review`)).status, 403);
      assert((await good('owner', 'GET', '/team/admin/audits')).some(log => log.action === 'view' && JSON.parse(log.newValue).reason === 'business-review'));
    });
    await test('private employee attachment can be read only through an authorized channel grant', async () => {
      const form = new FormData(); form.append('purpose', 'team'); form.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'test.png');
      const upload = await fetch(base + '/api/staff-work/my/files', { method: 'POST', headers: { Authorization: 'Bearer ' + tokens.alice, 'X-Client-App': 'employee' }, body: form });
      assert.equal(upload.status, 201); fileId = (await upload.json()).data.id;
      await send('alice', direct.id, 'Private evidence', { files: [fileId] });
      const file = await fetch(base + `/api/team/channels/${direct.id}/files/${fileId}`, { headers: { Authorization: 'Bearer ' + tokens.bob } });
      assert.equal(file.status, 200); assert.match(file.headers.get('cache-control'), /private/);
      assert.equal((await request('carol', 'GET', `/team/channels/${direct.id}/files/${fileId}`)).status, 403);
      assert.equal((await request('bob', 'POST', `/team/channels/${direct.id}/messages`, { requestId: randomUUID(), text: '', files: [fileId] })).status, 403);
    });
    await test('legacy file downloads enforce chat membership and audit reasons while ordinary employee files retain their permissions', async () => {
      const download = (who, url) => fetch(base + '/api' + url, { headers: { Authorization: 'Bearer ' + tokens[who] } });
      for (const who of ['owner', 'alice', 'bob', 'carol']) assert.equal((await download(who, `/staff-work/files/${fileId}`)).status, 403);
      assert.equal((await download('bob', `/staff-work/files/${fileId}?channelId=${direct.id}`)).status, 200);
      assert.equal((await download('owner', `/staff-work/files/${fileId}?channelId=${direct.id}`)).status, 403);
      assert.equal((await download('carol', `/staff-work/files/${fileId}?channelId=${direct.id}&auditReason=business-review`)).status, 403);
      const before = await prisma.financeAuditLog.count({ where: { entityType: 'team_communication', action: 'view' } });
      assert.equal((await download('owner', `/staff-work/files/${fileId}?channelId=${direct.id}&auditReason=attachment-review`)).status, 200);
      assert.equal(await prisma.financeAuditLog.count({ where: { entityType: 'team_communication', action: 'view' } }), before + 1);
      assert.equal((await download('outsider', `/staff-work/files/${fileId}?channelId=${direct.id}&auditReason=attachment-review`)).status, 403);
      // Old chat records with no purpose marker must also be protected.
      const fileKey = { storeId_key: { storeId: 'team-store-a', key: 'employee.workspace.file.' + fileId } };
      const record = await prisma.config.findUniqueOrThrow({ where: fileKey }); const metadata = JSON.parse(record.value);
      const { purpose, ...legacy } = metadata;
      await prisma.config.update({ where: fileKey, data: { value: JSON.stringify(legacy) } });
      assert.equal((await download('owner', `/staff-work/files/${fileId}`)).status, 403);
      await prisma.config.update({ where: fileKey, data: { value: JSON.stringify(metadata) } });
      const form = new FormData(); form.append('file', new Blob(['%PDF-1.4\nsynthetic employee file'], { type: 'application/pdf' }), 'work.pdf');
      const uploaded = await fetch(base + '/api/staff-work/my/files', { method: 'POST', headers: { Authorization: 'Bearer ' + tokens.alice }, body: form });
      assert.equal(uploaded.status, 201); const ordinary = (await uploaded.json()).data.id;
      assert.equal((await download('owner', `/staff-work/files/${ordinary}`)).status, 200);
      assert.equal((await download('alice', `/staff-work/files/${ordinary}`)).status, 200);
      assert.equal((await download('bob', `/staff-work/files/${ordinary}`)).status, 403);
      assert.equal((await request('alice', 'POST', `/team/channels/${direct.id}/messages`, { requestId: randomUUID(), text: 'Keep separate purposes', files: [ordinary] })).status, 403);
    });
    await test('attachment grants after the first hundred remain downloadable only from the current join sequence', async () => {
      const c = await create('alice', 'group', ['s-bob']);
      await prisma.config.createMany({ data: Array.from({ length: 100 }, (_, i) => ({ storeId: 'team-store-a', category: 'staff', key: `team.communication.fileGrant.${c.id}.${fileId}.${String(i + 1).padStart(12, '0')}`, value: JSON.stringify({ seq: i + 1 }) })) });
      await prisma.config.update({ where: { storeId_key: { storeId: 'team-store-a', key: 'team.communication.channel.' + c.id } }, data: { value: JSON.stringify({ ...c, lastSeq: 100 }) } });
      const joined = await good('alice', 'PUT', `/team/channels/${c.id}/members`, { expectedVersion: c.version, ownerId: 's-alice', members: ['s-alice', 's-bob', 's-carol'], archived: false });
      assert.equal((await request('carol', 'GET', `/team/channels/${c.id}/files/${fileId}`)).status, 403);
      assert.equal((await send('alice', c.id, 'Visible grant 101', { files: [fileId] })).seq, 101);
      assert.deepEqual((await good('carol', 'GET', `/team/channels/${c.id}/messages`)).messages.map(m => m.seq), [101]);
      for (const url of [`/team/channels/${c.id}/files/${fileId}`, `/staff-work/files/${fileId}?channelId=${c.id}`]) {
        assert.equal((await fetch(base + '/api' + url, { headers: { Authorization: 'Bearer ' + tokens.carol } })).status, 200);
      }
      await good('alice', 'PUT', `/team/channels/${c.id}/members`, { expectedVersion: joined.version, ownerId: 's-alice', members: ['s-alice', 's-bob'], archived: false });
      assert.equal((await request('carol', 'GET', `/staff-work/files/${fileId}?channelId=${c.id}`)).status, 403);
    });
    await test('membership join floor, removal, scoped public channels and historical minutes privacy', async () => {
      assert.equal((await request('alice', 'POST', '/team/channels', { requestId: randomUUID(), title: 'No permission', kind: 'public', members: ['s-bob'] })).status, 403);
      group = await create('alice', 'group', ['s-bob']);
      await send('alice', group.id, 'Before Carol joined', { files: [fileId] });
      const oldMinutes = await good('alice', 'POST', `/team/channels/${group.id}/rounds/close`, { expectedVersion: group.version });
      const changed = await good('alice', 'PUT', `/team/channels/${group.id}/members`, { expectedVersion: group.version + 1, ownerId: 's-alice', members: ['s-alice', 's-bob', 's-carol'], archived: false });
      assert.equal((await good('carol', 'GET', `/team/channels/${group.id}/messages`)).messages.length, 0);
      assert.equal((await good('carol', 'GET', `/team/channels/${group.id}/minutes`)).length, 0);
      assert.equal((await request('carol', 'GET', `/team/channels/${group.id}/minutes/${oldMinutes.id}/versions`)).status, 404);
      assert.equal((await request('carol', 'GET', `/team/channels/${group.id}/files/${fileId}`)).status, 403);
      await send('alice', group.id, 'After Carol joined');
      assert.deepEqual((await good('carol', 'GET', `/team/channels/${group.id}/messages`)).messages.map(m => m.seq), [2]);
      await good('alice', 'PUT', `/team/channels/${group.id}/members`, { expectedVersion: changed.version, ownerId: 's-alice', members: ['s-alice', 's-carol'], archived: false });
      assert.equal((await request('bob', 'GET', `/team/channels/${group.id}/messages`)).status, 403);
      const publicChannel = await create('owner', 'public', ['s-alice']);
      assert.equal((await request('bob', 'GET', `/team/channels/${publicChannel.id}/messages`)).status, 403);
    });
    await test('meeting close atomically creates a manual scaffold; versioned human decisions never rewrite source messages', async () => {
      meeting = await create('alice', 'meeting', ['s-bob'], 'Synthetic text meeting');
      await send('alice', meeting.id, 'Please check the machine tomorrow.');
      const closed = await good('alice', 'POST', `/team/channels/${meeting.id}/rounds/close`, { expectedVersion: meeting.version });
      assert.equal(closed.source, 'manual'); assert.equal(closed.status, 'draft'); assert.deepEqual(closed.decisions, []); assert.equal(closed.toSeq, 1);
      assert.equal((await request('bob', 'POST', `/team/channels/${meeting.id}/messages`, { requestId: randomUUID(), text: 'After close' })).status, 409);
      const update = { requestId: randomUUID(), expectedVersion: 1, title: closed.title, decisions: ['Supervisor confirmed inspection'], pending: ['Confirm machine model'],
        actions: [{ text: 'Check machine', ownerId: 's-bob', dueDate: '2026-10-22', sourceSeq: [1] }], sourceSeq: [1], status: 'confirmed' };
      const saved = await good('alice', 'PUT', `/team/channels/${meeting.id}/minutes/${closed.id}`, update);
      assert.equal(saved.version, 2); assert.equal(saved.status, 'confirmed');
      assert.equal((await good('alice', 'PUT', `/team/channels/${meeting.id}/minutes/${closed.id}`, update)).version, 2);
      assert.equal((await request('alice', 'PUT', `/team/channels/${meeting.id}/minutes/${closed.id}`, { ...update, requestId: randomUUID() })).status, 409);
      assert.equal((await request('alice', 'PUT', `/team/channels/${meeting.id}/minutes/${closed.id}`, { ...update, requestId: randomUUID(), expectedVersion: 2, sourceSeq: [99] })).status, 400);
      assert.equal((await good('bob', 'GET', `/team/channels/${meeting.id}/minutes/${closed.id}/versions`)).length, 2);
      assert.equal((await good('bob', 'GET', `/team/channels/${meeting.id}/messages`)).messages[0].text, 'Please check the machine tomorrow.');
      await good('alice', 'POST', `/team/channels/${meeting.id}/rounds/start`, { expectedVersion: 2 });
      const concurrent = await Promise.all([request('alice', 'POST', `/team/channels/${meeting.id}/rounds/close`, { expectedVersion: 3 }), request('alice', 'POST', `/team/channels/${meeting.id}/rounds/close`, { expectedVersion: 3 })]);
      assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
    });
    await test('retained minutes and revision history are not silently truncated by metadata limits', async () => {
      const c = await create('owner', 'meeting', ['s-alice']);
      const first = await good('owner', 'POST', `/team/channels/${c.id}/rounds/close`, { expectedVersion: c.version });
      await prisma.config.createMany({ data: Array.from({ length: 505 }, (_, n) => ({ storeId: 'team-store-a', category: 'staff', key: `team.communication.minuteVersion.${c.id}.${first.id}.${String(n + 2).padStart(6, '0')}`, value: JSON.stringify({ ...first, version: n + 2 }) })) });
      assert.equal((await good('alice', 'GET', `/team/channels/${c.id}/minutes/${first.id}/versions`)).length, 506);
    });
    await test('rate and length limits apply transactionally, and invalid requests do not allocate sequence numbers', async () => {
      const c = await create('rate', 'group', ['s-bob']);
      const sends = await Promise.all(Array.from({ length: 35 }, (_, n) => request('rate', 'POST', `/team/channels/${c.id}/messages`, { requestId: randomUUID(), text: String(n) })));
      assert.equal(sends.filter(r => r.status === 200).length, 30); assert.equal(sends.filter(r => r.status === 429).length, 5);
      assert.equal((await request('bob', 'POST', `/team/channels/${c.id}/messages`, { requestId: randomUUID(), text: 'x'.repeat(4001) })).status, 400);
      assert.equal((await good('bob', 'GET', `/team/channels/${c.id}/messages`)).messages.length, 30);
    });
    await test('reserved storage cannot be read or overwritten using ordinary configuration routes', async () => {
      assert.equal((await request('owner', 'GET', `/config/team-store-a/team.communication.channel.${direct.id}`)).status, 403);
      const ordinary = await good('owner', 'GET', '/config?storeId=team-store-a');
      assert(!Object.keys(ordinary).some(k => k.startsWith('team.communication.')));
    });
    await test('archive retains history, and inactive employees or revoked old tokens cannot read it', async () => {
      const c = await create('alice', 'group', ['s-bob']); await send('alice', c.id, 'Retained history');
      const archived = await good('alice', 'PUT', `/team/channels/${c.id}/members`, { expectedVersion: c.version, ownerId: 's-alice', members: ['s-alice', 's-bob'], archived: true });
      assert(archived.archived); assert.equal((await good('bob', 'GET', `/team/channels/${c.id}/messages`)).messages.length, 1);
      assert.equal((await request('bob', 'POST', `/team/channels/${c.id}/messages`, { requestId: randomUUID(), text: 'Cannot send' })).status, 409);
      await prisma.staff.update({ where: { id: 's-bob' }, data: { status: 'inactive' } });
      assert.equal((await request('bob', 'GET', `/team/channels/${c.id}/messages`)).status, 401);
      await prisma.user.update({ where: { id: 'u-carol' }, data: { updatedAt: new Date(Date.now() + 10) } });
      assert.equal((await request('carol', 'GET', '/team/channels')).status, 401);
      await prisma.staff.update({ where: { id: 's-bob' }, data: { status: 'active' } });
    });
    // Prepare a clearly synthetic, isolated channel for real UI interaction.
    await create('owner', 'public', ['s-alice', 's-bob'], 'ISOLATED · Team channel');
    const report = { base: '8989b6290413af056f51b1e9b00fae2fc4f2267c', checks: results, count: results.length, productionTouched: false };
    fs.mkdirSync(path.join(root, 'output/team-communication'), { recursive: true }); fs.writeFileSync(path.join(root, 'output/team-communication/http-results.json'), JSON.stringify(report, null, 2));
    console.log('RESULT', JSON.stringify({ passed: results.length, failed: 0 }));
    if (process.env.TEAM_BROWSER === '1') {
      console.log('ISOLATED_STAFF_URL', base + '/team'); console.log('ISOLATED_ADMIN_URL', 'http://localhost:' + server.address().port + '/staff/communication');
      console.log('Synthetic UI accounts: staff 08000000002, owner 08000000001; password team-test-only-2026. Type stop to clean up.');
      await new Promise(resolve => { const reader = require('node:readline').createInterface({ input: process.stdin }); reader.on('line', line => { if (line === 'stop') { reader.close(); resolve(); } }); });
    }
  } finally { await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
