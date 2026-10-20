const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('client-admin/src/pages/staff/ShiftSwapListPage.tsx', 'utf8');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function handler(name) {
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) result = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(result, name);
  return ts.transpileModule(`globalThis.run = ${result}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
}
function fixture(name, { code = 200, cancel = false, network = false } = {}) {
  const events = [];
  const context = {
    t: key => key, token: 'test-only',
    confirmAdmin: async () => !cancel, prompt: () => cancel ? null : 'reason',
    setProcessing: value => events.push(['processing', value]),
    loadData: () => events.push(['refresh']), notifyAdmin: value => events.push(['notice', value]),
    fetch: async (url, options) => {
      events.push(['request', url, options.method]);
      if (network) throw new Error('offline');
      return { json: async () => ({ code, message: 'backend refusal' }) };
    }
  };
  vm.runInNewContext(handler(name), context);
  return { events, run: () => context.run('swap-123') };
}
for (const [name, action] of [['handleApprove', 'approve'], ['handleReject', 'reject']]) {
  test(`${action} refreshes persisted status with no success popup and releases processing`, async () => {
    const f = fixture(name); await f.run();
    assert.deepEqual(f.events, [['processing', 'swap-123'], ['request', `/api/shift-swap/swap-123/${action}`, 'PUT'], ['refresh'], ['processing', null]]);
  });
  test(`${action} preserves backend refusal and network error feedback`, async () => {
    for (const options of [{ code: 409 }, { network: true }]) {
      const f = fixture(name, options); await f.run();
      assert.equal(f.events.some(e => e[0] === 'refresh'), false);
      assert.deepEqual(f.events.find(e => e[0] === 'notice'), ['notice', options.network ? `staff.${action}Failed` : 'backend refusal']);
      assert.deepEqual(f.events.at(-1), ['processing', null]);
    }
  });
  test(`${action} cancellation never submits or displays a notice`, async () => {
    const f = fixture(name, { cancel: true }); await f.run(); assert.deepEqual(f.events, []);
  });
}
