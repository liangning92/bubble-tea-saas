const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function service(db,events=[]){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('server/src/services/POSActionLogService.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require:n=>({'../config/database':{__esModule:true,default:db},'../socket':{socketManager:{emitToStore:(...a)=>events.push(a)}},'../utils/posCartState':{}}[n]),Date,Set,console});return m.exports;}
test('old clients cannot turn normal receipt process events into cashier alerts; real behavior warnings still broadcast',async()=>{
 const rows=[],events=[];const s=service({pOSActionLog:{count:async()=>0,create:async({data})=>{rows.push(data);return {...data,id:'log'}}}},events);
 for(const status of ['pending','sent','paper-confirmed'])await s.logPOSAction({storeId:'owned',action:'receipt_print',metadata:{status},severity:'warning'});
 assert.ok(rows.every(r=>r.severity==='info'));assert.equal(events.length,0);
 await s.logPOSAction({storeId:'owned',action:'receipt_print',metadata:{status:'unknown'},severity:'warning'});
 assert.equal(rows.at(-1).severity,'warning');assert.equal(events.length,0);
 await s.logPOSAction({storeId:'owned',action:'cart_clear',severity:'warning'});
 assert.equal(events.length,1);assert.equal(events[0][0],'owned');assert.equal(events[0][2].data.action,'cart_clear');
});
test('category constraints apply before pagination and cannot be overridden with an action filter',async()=>{
 const queries=[];const s=service({pOSActionLog:{findMany:async q=>{queries.push(q);return []},count:async q=>{queries.push(q);return 0}}});
 for(const category of ['behavior','printing','all']){
  queries.length=0;await s.getPOSActionLogs('owned',{category,action:'receipt_print',severity:'warning',page:2,limit:10});
  for(const q of queries){assert.equal(q.where.storeId,'owned');assert.equal(q.where.action,'receipt_print');assert.equal(q.where.severity,'warning');if(category==='behavior')assert.equal(q.where.AND[0].action.not,'receipt_print');if(category==='printing')assert.equal(q.where.AND[0].action,'receipt_print');if(category==='all')assert.equal(q.where.AND,undefined);}
  assert.equal(queries[0].skip,10);assert.equal(queries[0].take,10);
 }
});
test('historical receipt warnings do not enter behavior counts, while total operation count retains all audit events',async()=>{
 const queries=[];const s=service({pOSActionLog:{count:async q=>{queries.push(q);return 0}}});
 await s.getAlertStats('owned','2026-10-15T00:00:00Z','2026-10-15T23:59:59Z');
 assert.equal(queries[0].where.action.not,'receipt_print');assert.equal(queries[1].where.action.not,'receipt_print');
 assert.equal(queries[0].where.severity,'warning');assert.equal(queries[1].where.severity,'critical');assert.equal(queries[2].where.action,undefined);
 for(const q of queries)assert.equal(q.where.storeId,'owned');
});
