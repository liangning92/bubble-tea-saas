const {test}=require('node:test'),assert=require('node:assert/strict');
const {bindTag}=require('../../.github/scripts/windows-release-tag.cjs');
const sha='a'.repeat(40),other='b'.repeat(40),annotated='c'.repeat(40);
const missing=()=>Object.assign(Error('missing'),{status:404});
function store(initial=null) {
 let ref=initial;const calls=[];
 const api=async(method,path,body)=>{calls.push({method,path,body});
  if(method==='GET'&&path.startsWith('git/ref/')){if(!ref)throw missing();return {object:ref};}
  if(method==='POST'){if(ref)throw Object.assign(Error('exists'),{status:422});ref={type:'commit',sha:body.sha};return {object:ref};}
  if(path===`git/tags/${annotated}`)return {object:{type:'commit',sha}};
  throw Error('unexpected request');
 };return {api,calls,get ref(){return ref}};
}
test('matching lightweight tag is verified without rewriting',async()=>{const s=store({type:'commit',sha});assert.equal(await bindTag(s.api,'v2026.10.1',sha,true),sha);assert.ok(s.calls.every(c=>c.method==='GET'))});
test('annotated tag is resolved to the commit, not compared to the tag object SHA',async()=>{const s=store({type:'tag',sha:annotated});assert.equal(await bindTag(s.api,'v2026.10.1',sha,true),sha);await assert.rejects(bindTag(s.api,'v2026.10.1',other,true));assert.equal(s.ref.sha,annotated)});
test('existing mismatched tag refuses publication and remains untouched',async()=>{const s=store({type:'commit',sha:other});await assert.rejects(bindTag(s.api,'v2026.10.1',sha,true));assert.equal(s.ref.sha,other);assert.ok(s.calls.every(c=>c.method==='GET'))});
test('only absent tag is created and subsequently resolved',async()=>{const s=store();assert.equal(await bindTag(s.api,'v2026.10.1',sha,true),sha);assert.equal(s.ref.sha,sha);assert.equal(s.calls.filter(c=>c.method==='POST').length,1)});
test('conflicting concurrent creators cannot overwrite the winner',async()=>{const s=store();const results=await Promise.allSettled([bindTag(s.api,'v2026.10.1',sha,true),bindTag(s.api,'v2026.10.1',other,true)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(s.ref.sha,sha);assert.ok(s.calls.every(c=>['GET','POST'].includes(c.method)))});
test('concurrent creators of the same SHA safely converge',async()=>{const s=store();assert.deepEqual(await Promise.all([bindTag(s.api,'v2026.10.1',sha,true),bindTag(s.api,'v2026.10.1',sha,true)]),[sha,sha]);assert.equal(s.ref.sha,sha)});
test('later tag movement is detected by a publication-time recheck',async()=>{let current=sha;const api=async()=>({object:{type:'commit',sha:current}});await bindTag(api,'v2026.10.1',sha);current=other;await assert.rejects(bindTag(api,'v2026.10.1',sha));assert.equal(current,other)});
test('cyclic annotated and noncommit tags fail closed',async()=>{const api=async()=>({object:{type:'tag',sha:annotated}});await assert.rejects(bindTag(api,'v2026.10.1',sha));await assert.rejects(bindTag(async()=>({object:{type:'blob',sha}}),'v2026.10.1',sha))});
test('permission or unknown read errors never create references',async()=>{const calls=[];const api=async(method)=>{calls.push(method);throw Object.assign(Error('denied'),{status:403})};await assert.rejects(bindTag(api,'v2026.10.1',sha,true));assert.deepEqual(calls,['GET'])});
