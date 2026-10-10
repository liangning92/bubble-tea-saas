const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkWindowsBackend } = require('../../.github/scripts/check-windows-backend.cjs');
const backend = 'a'.repeat(40), source = 'b'.repeat(40);
const health = { status: 'ok', sourceSha: backend, capabilities: { orderReceipt: 1, refundItems: 2, inventoryCount: 3 } };
const tree = { tree: ['server', 'shared', 'package.json', 'package-lock.json'].map((path, i) => ({ path, sha: String(i + 1).repeat(40), type: i < 2 ? 'tree' : 'blob', mode: i < 2 ? '040000' : '100644' })) };
function get({ changed, missing, divergent } = {}) {
  return async endpoint => {
    if (endpoint.startsWith('compare/')) return { status: divergent ? 'diverged' : 'ahead', base_commit: { sha: backend } };
    const result = structuredClone(tree);
    if (endpoint.endsWith(source)) {
      if (changed) result.tree.find(entry => entry.path === changed).sha = 'f'.repeat(40);
      if (missing) result.tree = result.tree.filter(entry => entry.path !== missing);
    }
    return result;
  };
}
test('exact backend source passes without an equivalence lookup', async () => {
  assert.equal((await checkWindowsBackend(health, backend, () => { throw Error('unexpected lookup'); })).mode, 'exact-source');
});
test('desktop-only source permits identical complete API context and dependencies', async () => {
  const result = await checkWindowsBackend(health, source, get());
  assert.equal(result.mode, 'identical-backend-inputs');
  assert.equal(result.backendSha, backend);
  assert.equal(Object.keys(result.matchedInputs).length, 4);
});
for (const path of ['server', 'shared', 'package.json', 'package-lock.json']) {
  test(`changed ${path} requires deployment`, async () => {
    await assert.rejects(checkWindowsBackend(health, source, get({ changed: path })), /Deploy the matching backend first/);
  });
}
test('missing inputs and unrelated backend history fail closed', async () => {
  await assert.rejects(checkWindowsBackend(health, source, get({ missing: 'server' })), /Missing backend/);
  await assert.rejects(checkWindowsBackend(health, source, get({ divergent: true })), /ancestor/);
});
test('invalid backend identity or capabilities remain blocked', async () => {
  await assert.rejects(checkWindowsBackend({ ...health, sourceSha: '' }, source, get()));
  await assert.rejects(checkWindowsBackend({ ...health, capabilities: {} }, source, get()));
  await assert.rejects(checkWindowsBackend({ ...health, status: 'error' }, source, get()));
});
