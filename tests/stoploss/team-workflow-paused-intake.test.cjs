const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
function fixture(takeover=true){
 const state=new Map(),writes=[]
 const policy={enabled:true,paused:true,automaticSend:true,operatorUserId:'owner-user',operatorStaffId:'owner',hash:'saved-policy',...(takeover?{takeover:{reason:'human_message',byStaffId:'owner'}}:{})}
 state.set('workflow.policy.channel',policy);state.set('workflow.defaults',{enabled:true,ownerUserId:'owner-user',ownerStaffId:'owner'})
 const ports={read:async(_db,store,key)=>{assert.equal(store,'store');return state.get(key)||null},write:async(_db,store,key,value)=>{assert.equal(store,'store');writes.push(key);state.set(key,value)}}
 let routed=false
 const exports={}
 new Function('require','exports',ts.transpileModule(fs.readFileSync('server/src/services/TeamWorkflowQueue.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>n==='./TeamManagementDefaults'?{inheritManagementPolicy:async()=>({active:true,paused:true})}:n==='./teamAgentBridge/employeeIntake'?{enqueueEmployeeIntake:async()=>routed}:require(n),exports)
 const actor={id:'staff-user',staffId:'staff',storeId:'store',role:'staff'},channel={id:'channel',members:[{staffId:'owner',fromSeq:1},{staffId:'staff',fromSeq:1}]}
 const message={id:'source',seq:5,text:'Saya belum paham. Bisa dijelaskan?',files:[],createdAt:'2026-10-28T01:00:00Z'}
 return {state,writes,policy,message,run:()=>exports.enqueueTeamWorkflow({},actor,channel,message,ports),route:()=>{routed=true}}
}
test('explicit human takeover retains a durable blocked source and never resumes the saved policy',async()=>{
 const f=fixture(),before=JSON.stringify(f.policy);await f.run()
 const row=f.state.get('workflow.job.channel.000000000005')
 assert.equal(row.sourceAuthorId,'staff');assert.equal(row.id,'source');assert.equal(row.status,'blocked')
 assert.equal(row.error,'TEAM_WORKFLOW_PAUSED_HUMAN_TAKEOVER');assert.equal(row.billingStatus,'not_started');assert.equal(row.attempt,0)
 assert.equal(JSON.stringify(f.policy),before);assert(!f.writes.includes('workflow.policy.channel'))
 assert(!f.writes.some(k=>k.includes('aiDraft')))
})
test('paused-source acknowledgement is idempotent and store-scoped',async()=>{
 const f=fixture();await f.run();const n=f.writes.length;await f.run();assert.equal(f.writes.length,n)
 assert.equal([...f.state.keys()].filter(k=>k.startsWith('workflow.job.')).length,1)
})
test('store default pause without takeover retains the pause without claiming a model reply',async()=>{
 const f=fixture(false);await f.run();const row=f.state.get('workflow.job.channel.000000000005')
 assert.equal(row.error,'TEAM_WORKFLOW_PAUSED');assert.equal(row.replyMessageId,undefined);assert.equal(row.result,undefined)
})
test('AI output and an already-routed Hermes source do not create a second paused job',async()=>{
 for(const mode of ['ai','routed']){const f=fixture();if(mode==='ai')f.message.ai={model:'synthetic'};else f.route();await f.run();assert.equal(f.writes.length,0)}
})
