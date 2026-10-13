const {execFileSync}=require('node:child_process');
async function checkTvCi(sha,runId,get){
 if(!/^[a-f0-9]{40}$/.test(sha||'')||!/^\d+$/.test(runId||''))throw Error('Exact source SHA and CI run required');
 const run=await get(`actions/runs/${runId}`);
 if(run.head_sha!==sha||run.path!=='.github/workflows/ci.yml'||run.status!=='completed'||run.conclusion!=='success')throw Error('Ordinary CI must pass for this exact TV source');
 const jobs=await get(`actions/runs/${runId}/jobs?per_page=100`);
 if(!jobs.jobs?.some(job=>job.name==='verify'&&job.status==='completed'&&job.conclusion==='success'))throw Error('CI verify job must execute successfully; skipped jobs are not verification');
 return {sourceSha:sha,ciRunId:runId};
}
module.exports={checkTvCi};
if(require.main===module){const repo=process.env.GITHUB_REPOSITORY;if(!/^[\w.-]+\/[\w.-]+$/.test(repo||''))throw Error('Repository required');checkTvCi(process.env.SOURCE_SHA,process.env.VERIFICATION_RUN_ID,async endpoint=>JSON.parse(execFileSync('gh',['api',`repos/${repo}/${endpoint}`],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1})}
