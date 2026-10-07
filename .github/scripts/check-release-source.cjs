const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const components = {
  docker: { workflow: '.github/workflows/docker-publish.yml', artifacts: sha => ['api', 'admin', 'pos', 'staff'].map(service => `docker-verified-${sha}-${service}`) },
  windows: { workflow: '.github/workflows/build-windows.yml', artifacts: () => ['BTPS-build-dist', 'BTPS-validation-evidence'] },
};
async function checkReleaseSource(context, get) {
  const fail = message => { throw Error(message); };
  if (context.event !== 'workflow_dispatch' || context.ref !== 'refs/heads/master') fail('Manual master publication only');
  if (!/^[a-f0-9]{40}$/.test(context.sha || '')) fail('Explicit full verified source SHA required');
  if (!/^\d+$/.test(context.runId || '')) fail('Explicit successful verification run ID required');
  const policy = components[context.component];
  if (!policy) fail('Unknown release component');
  const ancestry = await get(`compare/${context.sha}...master`);
  if (!['ahead', 'identical'].includes(ancestry.status) || ancestry.base_commit?.sha !== context.sha) fail('Selected source must already be in master history');
  const ci = await get(`actions/workflows/ci.yml/runs?head_sha=${context.sha}&per_page=100`);
  if (!ci.workflow_runs?.some(run => run.head_sha === context.sha && run.status === 'completed' && run.conclusion === 'success')) fail('Ordinary CI has not passed for the selected SHA');
  const run = await get(`actions/runs/${context.runId}`);
  if (run.head_sha !== context.sha || run.path !== policy.workflow || run.status !== 'completed' || run.conclusion !== 'success' || !['push', 'workflow_dispatch'].includes(run.event)) fail('Component verification must be completed, successful and for the exact selected SHA/workflow');
  const artifacts = await get(`actions/runs/${context.runId}/artifacts?per_page=100`);
  for (const name of policy.artifacts(context.sha)) {
    if (!artifacts.artifacts?.some(artifact => artifact.name === name && !artifact.expired && artifact.size_in_bytes > 0)) fail(`Missing verified artifact: ${name}`);
  }
  return { sha: context.sha, run_id: context.runId, component: context.component };
}
module.exports = { checkReleaseSource };
if (require.main === module) {
  const context = { event: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF, sha: process.env.RELEASE_SHA, runId: process.env.VERIFICATION_RUN_ID, component: process.argv[2] };
  const repo = process.env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw Error('Invalid repository');
  const get = async endpoint => JSON.parse(execFileSync('gh', ['api', `repos/${repo}/${endpoint}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  checkReleaseSource(context, get).then(result => {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `sha=${result.sha}\nrun_id=${result.run_id}\n`);
    console.log(JSON.stringify(result));
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
