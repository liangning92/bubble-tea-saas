const {test}=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const source=fs.readFileSync('server/src/utils/inventoryActors.ts','utf8');
const exportsObject={};new Function('exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(exportsObject);
const {loadInventoryActors,inventoryLogActorId}=exportsObject;
test('batch resolves staff IDs and historical user IDs within the record store without sensitive fields',async()=>{
 let query;const db={staff:{findMany:async args=>{query=args;return[{id:'staff',userId:'user',name:'真实姓名',employeeNumber:'EMP001',phone:'private'}]}}};
 const people=await loadInventoryActors(db,'own',['staff','user','staff',null,'']);
 assert.equal(query.where.storeId,'own');assert.deepEqual(query.where.OR[0].id.in,['staff','user']);
 assert.deepEqual(query.select,{id:true,userId:true,name:true,employeeNumber:true});
 assert.deepEqual(people.get('staff'),{id:'staff',name:'真实姓名',employeeNumber:'EMP001'});assert.equal(people.get('user'),people.get('staff'));assert.equal(people.get('unknown'),undefined);
});
test('empty identity does not query; missing historical actor is never assigned to current user',async()=>{
 assert.equal((await loadInventoryActors({staff:{findMany:()=>{throw Error('unexpected')}}},'own',[])).size,0);
 assert.equal((await loadInventoryActors({staff:{findMany:async()=>[]}},'own',['unknown'])).size,0);
 assert.equal((await loadInventoryActors({staff:{findMany:()=>{throw Error('store required')}}},undefined,['staff'])).size,0);
});
test('count adjustment actor is recovered only from its own structured audit data',()=>{
 assert.equal(inventoryLogActorId({staffId:'direct',reason:'count_adjustment',note:'{"actor":"other"}'}),'direct');
 assert.equal(inventoryLogActorId({reason:'count_adjustment',note:'{"actor":"reviewer"}'}),'reviewer');
 assert.equal(inventoryLogActorId({reason:'sold',note:'{"actor":"spoof"}'}),null);assert.equal(inventoryLogActorId({reason:'count_adjustment',note:'broken'}),null);
});
