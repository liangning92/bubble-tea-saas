const {execFileSync}=require('node:child_process');
async function resolveTag(api,tag) {
  let object=(await api('GET',`git/ref/tags/${tag}`)).object;
  const seen=new Set();
  for(let depth=0;object?.type==='tag';depth++) {
    if(depth>=32||seen.has(object.sha)||!/^[a-f0-9]{40}$/.test(object.sha))throw Error('Invalid or cyclic annotated tag');
    seen.add(object.sha);
    object=(await api('GET',`git/tags/${object.sha}`)).object;
  }
  if(object?.type!=='commit'||!/^[a-f0-9]{40}$/.test(object.sha))throw Error('Release tag does not resolve to a commit');
  return object.sha;
}
async function bindTag(api,tag,sha,create=false) {
  if(!/^v\d+\.\d+\.\d+$/.test(tag)||!/^[a-f0-9]{40}$/.test(sha))throw Error('Explicit valid release tag/SHA required');
  let actual;
  try { actual=await resolveTag(api,tag); }
  catch(error) {
    if(error.status!==404||!create)throw error;
    // POST creates only an absent reference. Never PATCH, delete or force a tag.
    try { await api('POST','git/refs',{ref:`refs/tags/${tag}`,sha}); }
    catch { /* A concurrent creator may win: resolve and verify, never overwrite. */ }
    actual=await resolveTag(api,tag);
  }
  if(actual!==sha)throw Error('Existing release tag points to a different commit; publication refused');
  return actual;
}
module.exports={resolveTag,bindTag};
if(require.main===module) {
  const repo=process.env.GITHUB_REPOSITORY,sha=process.env.RELEASE_SHA,tag=process.env.RELEASE_TAG;
  const mode=process.argv[2];
  if(!/^[\w.-]+\/[\w.-]+$/.test(repo||'')||!['ensure','verify'].includes(mode))throw Error('Invalid release invocation');
  const api=async(method,endpoint,body)=>{
    const args=['api','--method',method,`repos/${repo}/${endpoint}`];
    for(const [key,value] of Object.entries(body||{}))args.push('-f',`${key}=${value}`);
    try{return JSON.parse(execFileSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}));}
    catch(error){const status=Number(String(error.stderr||'').match(/HTTP (\d{3})/)?.[1]);throw Object.assign(Error('Git reference API request failed'),{status});}
  };
  bindTag(api,tag,sha,mode==='ensure').then(actual=>console.log(`Release tag verified: ${actual}`)).catch(error=>{console.error(error.message);process.exitCode=1});
}
