const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

// Compare the complete API Docker context, plus shared/root dependency inputs.
// Desktop-only fixes need no API restart; any backend input change still blocks.
const inputs = ['server', 'shared', 'package.json', 'package-lock.json'];
async function checkWindowsBackend(health, sourceSha, get) {
  assert.equal(health.status, 'ok');
  assert.match(sourceSha, /^[a-f0-9]{40}$/);
  assert.match(health.sourceSha, /^[a-f0-9]{40}$/);
  assert.equal(health.capabilities?.orderReceipt, 1);
  assert.equal(health.capabilities?.refundItems, 2);
  assert.equal(health.capabilities?.inventoryCount, 3);
  if (health.sourceSha === sourceSha) return { mode: 'exact-source', sourceSha, backendSha: health.sourceSha };
  const ancestry = await get(`compare/${health.sourceSha}...${sourceSha}`);
  assert.ok(['ahead', 'identical'].includes(ancestry.status), 'Backend must be an ancestor of the verified installer source');
  assert.equal(ancestry.base_commit?.sha, health.sourceSha);
  const trees = await Promise.all([health.sourceSha, sourceSha].map(sha => get(`git/trees/${sha}`)));
  const matchedInputs = {};
  for (const path of inputs) {
    const entries = trees.map(tree => tree.tree?.find(entry => entry.path === path));
    for (const entry of entries) {
      assert.ok(entry, `Missing backend build input: ${path}`);
      assert.match(entry.sha, /^[a-f0-9]{40}$/);
      assert.equal(entry.type, ['server', 'shared'].includes(path) ? 'tree' : 'blob');
    }
    assert.equal(entries[0].sha, entries[1].sha, `Deploy the matching backend first: ${path} changed`);
    assert.equal(entries[0].mode, entries[1].mode);
    matchedInputs[path] = entries[0].sha;
  }
  return { mode: 'identical-backend-inputs', sourceSha, backendSha: health.sourceSha, matchedInputs };
}
module.exports = { checkWindowsBackend };
if (require.main === module) {
  const repo = process.env.GITHUB_REPOSITORY;
  assert.match(repo, /^[\w.-]+\/[\w.-]+$/);
  const get = async endpoint => JSON.parse(execFileSync('gh', ['api', `repos/${repo}/${endpoint}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  (async () => {
    const response = await fetch('https://api.aicube.online/health', { signal: AbortSignal.timeout(8000) });
    assert.equal(response.status, 200);
    console.log(JSON.stringify(await checkWindowsBackend(await response.json(), process.env.RELEASE_SHA, get)));
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
