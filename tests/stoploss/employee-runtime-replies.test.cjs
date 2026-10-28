const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
function load(file,imports={}){
 const m={exports:{}}
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,
  {module:m,exports:m.exports,require:n=>n in imports?imports[n]:n==='zod'?require('../../server/node_modules/zod'):require(n),Date,console,Buffer,Set,Map})
 return m.exports
}
const contract=load('server/src/services/teamAgentBridge/employeeRuntimeContract.ts')
const {employeeSystemTemplateHash}=load('server/src/services/teamAgentBridge/employeeRuntimeSystem.ts',{'./employeeRuntimeContract':contract})
test('plain Indonesian reply contract preserves the reviewed system template and prior in-flight instruction version',()=>{
 const root='/synthetic/hermes',id='execution'
 const hash=instruction=>employeeSystemTemplateHash([{role:'system',content:'Pinned header\n'+instruction+'\nPinned footer'}],root,id)
 assert.equal(hash(contract.EMPLOYEE_RUNTIME_INSTRUCTION),hash(contract.LEGACY_EMPLOYEE_RUNTIME_INSTRUCTION))
 assert.equal(hash(contract.EMPLOYEE_RUNTIME_REPLY_INSTRUCTION),hash(contract.LEGACY_EMPLOYEE_RUNTIME_INSTRUCTION))
 assert.equal(hash(contract.PREVIOUS_EMPLOYEE_RUNTIME_INSTRUCTION),hash(contract.LEGACY_EMPLOYEE_RUNTIME_INSTRUCTION))
 assert.notEqual(hash(contract.EMPLOYEE_RUNTIME_INSTRUCTION+' injected permission'),hash(contract.LEGACY_EMPLOYEE_RUNTIME_INSTRUCTION))
 assert.match(contract.EMPLOYEE_RUNTIME_INSTRUCTION,/simple everyday Indonesian/)
 assert.match(contract.EMPLOYEE_RUNTIME_INSTRUCTION,/Every employee question needs/)
 assert.match(contract.EMPLOYEE_RUNTIME_INSTRUCTION,/Permission limits still apply on every turn/)
})
const intake=load('server/src/services/teamAgentBridge/employeeIntake.ts',{
 '../TeamCommunicationService':{readTeam:async()=>null},
 './contract':{grantSchema:{parse:()=>{throw Error('must not authorize a missing route')}},taskRefSchema:require('../../server/node_modules/zod').z.object({taskId:require('../../server/node_modules/zod').z.string(),version:require('../../server/node_modules/zod').z.number()})},
 './directDelegation':{readAuthorizedBridgeChannel:async()=>{throw Error('must not authorize a missing route')}},
})
function fixture(agent=true){
 const records=new Map(),channel={id:'channel',members:[{staffId:'staff'},...(agent?[{staffId:'agent:one'}]:[])]}
 const db={config:{findUnique:async()=>null,upsert:async q=>{const k=q.where.storeId_key.key;if(!records.has(k))records.set(k,JSON.parse(q.create.value));return records.get(k)}}}
 const message={id:'message',authorId:'staff',seq:3,text:'Bagaimana cara membersihkan alat ini?',createdAt:'2026-10-28T01:00:00Z'}
 return {db,channel,message,records}
}
test('agent channel without an installed route persists one explicit blocked request, with no legacy/provider fallback',async()=>{
 const f=fixture()
 assert.equal(await intake.enqueueEmployeeIntake(f.db,'store',f.channel,f.message,1),true)
 assert.equal(await intake.enqueueEmployeeIntake(f.db,'store',f.channel,f.message,2),true)
 assert.equal(f.records.size,1)
 const [r]=f.records.values();assert.equal(r.state,'blocked');assert.equal(r.reason,'EMPLOYEE_ROUTE_NOT_CONFIGURED')
 assert.equal(r.messageId,'message');assert.equal(r.sourceStaffId,'staff')
 assert.equal('text' in r,false)
})
test('human-only conversations and nonmember/AI output never acquire a new employee request',async()=>{
 const f=fixture(false);assert.equal(await intake.enqueueEmployeeIntake(f.db,'store',f.channel,f.message),false)
 const g=fixture()
 for(const patch of [{authorId:'outsider'},{ai:{model:'synthetic'}},{agent:{agentId:'one'}}])assert.equal(await intake.enqueueEmployeeIntake(g.db,'store',g.channel,{...g.message,...patch}),false)
 assert.equal(g.records.size,0)
})
