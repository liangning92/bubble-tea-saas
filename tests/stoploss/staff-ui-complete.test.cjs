const ts=require('typescript'),fs=require('fs'),vm=require('vm');
const assert=require('node:assert/strict');
// Execute the real salary route with a minimal persistence boundary. No real DB or account is used.
const source=fs.readFileSync('server/src/routes/staff.ts','utf8'),file=ts.createSourceFile('staff.ts',source,99,true,ts.ScriptKind.TS);
let handler;function walk(n){if(ts.isCallExpression(n)&&n.expression.getText(file)==='router.get'&&n.arguments[0]?.text==='/salary/my')handler=n.arguments[n.arguments.length-1].getText(file);ts.forEachChild(n,walk)}walk(file);
assert.ok(handler);
const code=ts.transpileModule('module.exports='+handler,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const test = require('node:test');
test('salary profile availability preserves configured and paid salaries', async()=>{for(const scenario of ['unconfigured','configured','paid']){let calculations=0,body,status=200;const record=scenario==='paid'?{id:'salary',status:'paid',month:'2026-10'}:null;
 const sandbox={module:{exports:{}},console,formatDate:()=> '2026-10-15',prisma:{staff:{findFirst:async()=>({id:'e',storeId:'s',baseSalary:scenario==='configured'?3000000:null})},salary:{findFirst:async()=>record}},readPayslip:async()=>({status:'paid',totalSalary:1234567}),savedPayrollBasis:async()=>null,isLegacyAutomaticBasis:()=>false,calculateSalary:async()=>{calculations++;return {payrollBasis:{eligibleDays:0}}}};vm.runInNewContext(code,sandbox);await sandbox.module.exports({query:{month:'10',year:'2026'},user:{id:'u'}},{status(n){status=n;return this},json(data){body=data;return this}});
 assert.equal(status,200);if(scenario==='unconfigured'){assert.equal(body.data,null);assert.equal(body.unavailableReason,'STAFF_BASE_SALARY_REQUIRED');assert.equal(calculations,0)}else if(scenario==='configured'){assert.equal(body.data,null);assert.equal(calculations,1)}else {assert.equal(body.data.totalSalary,1234567);assert.equal(calculations,0)}console.log('PASS salary route:',scenario)}});

const presentationSource = fs.readFileSync('client-staff/src/utils/trainingPresentation.ts', 'utf8');
const presentationModule = {exports:{}};
new Function('module','exports',ts.transpileModule(presentationSource,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(presentationModule,presentationModule.exports);
test('published legacy training copy is clarified without rewriting custom text, parameters or progress',()=>{
 const old={revision:'published-unchanged',module:{subtitle:{zh:'老板独享到账查询；员工私密取证待对账。逐项退款等改动未发布，不虚构系统按钮。',id:'Store-custom instruction'},temperature:74,documentId:'approved-pdf',answer:0},completed:true};
 const result=presentationModule.exports.employeeTrainingPresentation(old);
 assert.ok(!result.module.subtitle.zh.includes('不虚构系统按钮'));
 assert.equal(result.module.subtitle.id,'Store-custom instruction');assert.equal(result.revision,old.revision);assert.equal(result.module.temperature,74);assert.equal(result.module.answer,0);assert.equal(result.module.documentId,'approved-pdf');assert.equal(result.completed,true);
 assert.ok(old.module.subtitle.zh.includes('不虚构系统按钮'));
});
