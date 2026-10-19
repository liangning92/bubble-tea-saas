const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('shared/teamAttachmentResource.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function setup(){const urls=[],revoked=[],scope={exports:{},AbortController,URL:{createObjectURL:blob=>{urls.push(blob);return 'blob:test-'+urls.length},revokeObjectURL:url=>revoked.push(url)}};vm.runInNewContext(code,scope);return{create:scope.exports.createTeamAttachmentResource,urls,revoked}}
test('preview followed by download reuses one blob and one request; dispose releases bytes',async()=>{
 const s=setup();let calls=0;const blob=new Blob(['test'],{type:'image/jpeg'}),resource=s.create(async()=>{calls++;return blob},()=>true);
 const first=await resource.read(),second=await resource.read();assert.equal(calls,1);assert.equal(first,second);assert.equal(s.urls.length,1);resource.dispose();assert.deepEqual(s.revoked,['blob:test-1']);await assert.rejects(async()=>resource.read(),/TEAM_IDENTITY_REQUIRED/);
});
test('account switch or unmount during a request cannot display or cache the response',async()=>{
 for(const mode of ['switch','unmount']){const s=setup();let current=true,resolve;const resource=s.create(()=>new Promise(r=>resolve=r),()=>current),pending=resource.read();if(mode==='switch')current=false;else resource.dispose();resolve(new Blob(['private'],{type:'image/jpeg'}));await assert.rejects(pending,/TEAM_IDENTITY_REQUIRED/);assert.equal(s.urls.length,0)}
});
test('simultaneous loads share a request; cancel aborts and permits a fresh retry',async()=>{
 const s=setup();let count=0;const resource=s.create(options=>{count++;options.onProgress?.({loaded:2,total:4});return count>1?Promise.resolve(new Blob(['data'],{type:'image/png'})):new Promise((_,reject)=>options.signal.addEventListener('abort',()=>{const e=Error('cancel');e.name='CanceledError';reject(e)}))},()=>true);
 let progress;const pending=resource.read(value=>progress=value);assert.equal(resource.read(),pending);resource.cancel();await assert.rejects(pending,{name:'CanceledError'});assert.equal(progress.loaded,2);await resource.read();assert.equal(count,2);resource.dispose();
});
test('empty/oversize/non-attachment response never becomes a blob URL',async()=>{
 const s=setup();for(const blob of [new Blob([],{type:'image/jpeg'}),new Blob(['error'],{type:'application/json'}),new Blob([new Uint8Array(8*1024*1024+1)],{type:'image/jpeg'})]){const resource=s.create(async()=>blob,()=>true);await assert.rejects(resource.read(),/TEAM_FILE_INVALID/);resource.dispose()}assert.equal(s.urls.length,0);
});
