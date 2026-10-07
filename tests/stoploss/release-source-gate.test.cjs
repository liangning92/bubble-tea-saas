const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {checkReleaseSource}=require('../../.github/scripts/check-release-source.cjs');
const sha='a'.repeat(40), other='b'.repeat(40);
function fixture(component='docker') {
  const context={event:'workflow_dispatch',ref:'refs/heads/master',sha,runId:'123',component};
  const artifacts=component==='docker'?['api','admin','pos','staff'].map(s=>`docker-verified-${sha}-${s}`):['BTPS-build-dist','BTPS-validation-evidence'];
  const data={
    [`compare/${sha}...master`]:{status:'ahead',base_commit:{sha}},
    [`actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`]:{workflow_runs:[{head_sha:sha,status:'completed',conclusion:'success'}]},
    'actions/runs/123':{head_sha:sha,path:`.github/workflows/${component==='docker'?'docker-publish':'build-windows'}.yml`,status:'completed',conclusion:'success',event:'workflow_dispatch'},
    'actions/runs/123/artifacts?per_page=100':{artifacts:artifacts.map(name=>({name,expired:false,size_in_bytes:1}))},
  };
  return {context,data,get:async path=>{assert.ok(path in data,`unexpected metadata request ${path}`);return data[path]}};
}
for(const component of ['docker','windows'])test('only explicit exact successful '+component+' source can proceed',async()=>{const f=fixture(component);assert.deepEqual(await checkReleaseSource(f.context,f.get),{sha,run_id:'123',component})});
for(const [name,change] of [
 ['automatic merge event',f=>f.context.event='push'],
 ['candidate publication',f=>f.context.ref='refs/heads/release/candidate'],
 ['branch instead of SHA',f=>f.context.sha='master'],
 ['short SHA',f=>f.context.sha=sha.slice(0,7)],
 ['missing verification run',f=>f.context.runId=''],
 ['unmerged source',f=>f.data[`compare/${sha}...master`].status='diverged'],
 ['wrong ancestry source',f=>f.data[`compare/${sha}...master`].base_commit.sha=other],
 ['failed ordinary CI',f=>f.data[`actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`].workflow_runs[0].conclusion='failure'],
 ['CI for another SHA',f=>f.data[`actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`].workflow_runs[0].head_sha=other],
 ['component run for another SHA',f=>f.data['actions/runs/123'].head_sha=other],
 ['wrong component workflow',f=>f.data['actions/runs/123'].path='.github/workflows/ci.yml'],
 ['failed verification',f=>f.data['actions/runs/123'].conclusion='failure'],
 ['unfinished verification',f=>f.data['actions/runs/123'].status='in_progress'],
 ['pull-request verification artifact',f=>f.data['actions/runs/123'].event='pull_request'],
 ['expired artifact',f=>f.data['actions/runs/123/artifacts?per_page=100'].artifacts[0].expired=true],
 ['missing image',f=>f.data['actions/runs/123/artifacts?per_page=100'].artifacts.pop()],
 ['empty artifact',f=>f.data['actions/runs/123/artifacts?per_page=100'].artifacts[0].size_in_bytes=0],
])test('publication rejects '+name,async()=>{const f=fixture();change(f);await assert.rejects(checkReleaseSource(f.context,f.get))});
test('automatic build paths contain no release or registry publication',()=>{
 const docker=fs.readFileSync('.github/workflows/docker-publish.yml','utf8');
 const windows=fs.readFileSync('.github/workflows/build-windows.yml','utf8');
 assert.doesNotMatch(docker,/docker push|docker\/login-action|packages: write|:latest/);
 assert.doesNotMatch(windows,/gh release|contents: write|^  publish:/m);
 for(const component of ['docker','windows']){
  const release=fs.readFileSync(`.github/workflows/release-${component}.yml`,'utf8');
  assert.doesNotMatch(release,/^  (?:push|pull_request|workflow_run|release):/m);
  assert.match(release,/default: false/);
  assert.match(release,/inputs.publish == true && github.ref == 'refs\/heads\/master'/);
  assert.match(release,/run-id: \$\{\{ needs.gate.outputs.run_id \}\}/);
 }
 const cloud=fs.readFileSync('.github/workflows/release-docker.yml','utf8');
 assert.doesNotMatch(cloud,/docker build|docker push -a|:latest/);
 assert.match(cloud,/docker load/);
 assert.match(cloud,/imageTarSha256/);
});
