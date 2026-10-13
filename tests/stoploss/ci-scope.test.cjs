const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {selectScope,planRange,imageMatrix}=require('../../scripts/ci-scope.cjs');
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ci-scope-'));const write=(name,source='')=>{fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),source)};return {root,write,close:()=>fs.rmSync(root,{recursive:true,force:true})}}
test('product upload and analysis select API/admin and media checks, without cashier/printing',()=>{
 const f=fixture();try{
  for(const name of ['payment-validation','printer-routing','receipt-layout','order-receipt','ci-scope'])f.write(`tests/stoploss/${name}.test.cjs`);
  for(const name of ['payment-evidence','refund-policy','order-boundary'])f.write(`server/audit-tests/${name}.test.ts`);
  const p=selectScope(['client-admin/src/components/ProductImageEditor.tsx','client-admin/src/pages/product-analysis/ProductAnalysisPage.tsx','server/src/services/ProductInsightsService.ts'],f);
  assert.deepEqual(p.components,['api','admin']);assert.deepEqual(p.typecheck,['api','admin']);assert.deepEqual(p.i18n,['admin']);
  assert.deepEqual(p.domains,['media']);assert.ok(p.media);assert.deepEqual(p.http,[]);assert.deepEqual(p.unitTests,[]);assert.deepEqual(p.auditTests,[]);assert.deepEqual(p.browser.map(b=>b.domain),['media']);assert.deepEqual(imageMatrix(p.components).include.map(i=>i.service),['api','admin']);
 }finally{f.close()}
});
test('metadata-only CI changes do not build business components or select business tests',()=>{
 const f=fixture();try{for(const name of ['ci-scope','batch-build-report','release-source-gate','payment-validation','receipt-layout'])f.write(`tests/stoploss/${name}.test.cjs`);
 const p=selectScope(['.github/workflows/ci.yml','scripts/ci-scope.cjs','scripts/windows-validation-scope.cjs'],f);
 assert.deepEqual(p.components,[]);assert.deepEqual(p.typecheck,[]);assert.deepEqual(p.build,[]);assert.deepEqual(p.browser,[]);assert.ok(!p.needsServer);assert.deepEqual(p.unitTests,['tests/stoploss/batch-build-report.test.cjs','tests/stoploss/ci-scope.test.cjs','tests/stoploss/release-source-gate.test.cjs']);
 }finally{f.close()}
});
test('shared module changes select importing consumers and dependent unit tests, including cycles and aliases',()=>{
 const f=fixture();try{
 f.write('shared/utils/layout.ts');f.write('client-admin/src/components/Card.tsx',"import {layout} from '../../../shared/utils/layout'\nimport './cycle'");f.write('client-admin/src/components/cycle.ts',"import './Card'");f.write('client-admin/src/pages/DashboardPage.tsx',"import Card from '@/components/Card'");
 f.write('tests/stoploss/card-layout.test.cjs',"require('../../client-admin/src/components/Card.tsx')");f.write('tests/stoploss/unrelated.test.cjs',"const fixture=['shared/utils/layout.ts']");
 const p=selectScope(['shared/utils/layout.ts'],f);assert.deepEqual(p.components,['admin']);assert.deepEqual(p.typecheck,['admin']);assert.deepEqual(p.unitTests,['tests/stoploss/card-layout.test.cjs']);
 }finally{f.close()}
});
test('deleted shared modules still trace existing importers',()=>{
 const f=fixture();try{f.write('client-staff/src/App.tsx',"import '../../shared/deleted.ts'");
 const p=selectScope(['shared/deleted.ts'],f);assert.deepEqual(p.components,['staff']);
 }finally{f.close()}
});
test('frontend-only and API-only changes do not force all service images',()=>{
 const f=fixture();try{assert.deepEqual(selectScope(['client-admin/src/pages/products/ProductListPage.tsx'],f).components,['admin']);assert.deepEqual(selectScope(['server/src/routes/media.ts'],f).components,['api']);assert.deepEqual(selectScope(['client-pos/electron/main.ts'],f).components,['pos']);assert.ok(selectScope(['client-pos/electron/main.ts'],f).electronTypes);
 }finally{f.close()}
});
test('core dependencies and explicit full regression include all genuinely affected components',()=>{
 const f=fixture();try{assert.deepEqual(selectScope(['package-lock.json'],f).components,['api','admin','pos','staff']);assert.deepEqual(selectScope([], {...f,full:true}).components,['api','admin','pos','staff']);assert.equal(selectScope([], {...f,full:true}).mode,'full');
 }finally{f.close()}
});
test('unmapped code keeps component type checking without silently running unrelated historical suites',()=>{
 const f=fixture();try{const p=selectScope(['client-admin/src/components/NewPanel.tsx'],f);assert.deepEqual(p.typecheck,['admin']);assert.deepEqual(p.unmappedCode,['client-admin/src/components/NewPanel.tsx']);assert.deepEqual(p.http,[]);assert.deepEqual(p.browser,[]);
 }finally{f.close()}
});
test('range selection includes every commit, rejects unpinned/reversed/empty baselines and mismatched checkout',()=>{
 const f=fixture();const git=(...args)=>execFileSync('git',args,{cwd:f.root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();try{
 git('init','-q');git('config','user.email','ci@example.invalid');git('config','user.name','CI scope test');f.write('baseline.txt','baseline');git('add','baseline.txt');git('commit','-qm','base');const base=git('rev-parse','HEAD');
 f.write('client-admin/src/components/ProductImageEditor.tsx','first');git('add','.');git('commit','-qm','media');const middle=git('rev-parse','HEAD');
 f.write('server/src/services/ProductInsightsService.ts','second');git('add','.');git('commit','-qm','analysis');const head=git('rev-parse','HEAD');
 assert.deepEqual(planRange(base,head,{root:f.root}).components,['api','admin']);assert.equal(planRange(base,head,{root:f.root}).files.length,2);
 for(const [b,h] of [[undefined,head],['HEAD',head],[head,head],[head,base],[base,middle]])assert.throws(()=>planRange(b,h,{root:f.root}));
 assert.equal(planRange(undefined,head,{root:f.root,full:true}).mode,'full');
 }finally{f.close()}
});
test('workflow wiring keeps full suites opt-in and image publication uses the selected matrix',()=>{
 const yaml=require('js-yaml');
 const read=name=>yaml.load(fs.readFileSync(`.github/workflows/${name}.yml`,'utf8'));
 const ci=read('ci');assert.equal(ci.on.workflow_dispatch.inputs.full_regression.default,false);assert.ok(ci.jobs.verify_full.if.includes('inputs.full_regression == true'));assert.equal(ci.jobs.verify.steps.some(s=>s.run?.includes('npm run build\n')),false);assert.ok(ci.jobs.verify.steps.some(s=>s.run==='node scripts/run-scoped-ci.cjs browser'));
 const docker=read('docker-publish');assert.match(docker.jobs.verify.strategy.matrix,/fromJSON/);assert.match(docker.jobs.verify.if,/has_images == 'true'/);assert.ok(docker.jobs.scope.steps.some(s=>s.env?.BASE_SHA==='${{ inputs.base_sha }}'));
 const release=read('release-docker');assert.equal(release.on.workflow_dispatch.inputs.services.default,'auto');assert.match(release.jobs.publish.strategy.matrix.service,/needs.gate.outputs.services/);
 const windows=read('build-windows');assert.ok(windows.on.workflow_dispatch.inputs.base_sha.required);assert.ok(windows.jobs.build.steps.some(s=>s.env?.BASE_SHA==='${{ inputs.base_sha }}'));
});

test('scoped runner executes selected unit checks and leaves unrelated tests untouched',()=>{
 const f=fixture();try{
 const marker=path.join(f.root,'ran');
 f.write('tests/selected.test.cjs',`require('node:fs').writeFileSync(${JSON.stringify(marker)},'selected')`);
 f.write('tests/unrelated.test.cjs',"throw Error('Unrelated suite was invoked')");
 f.write('scope.json',JSON.stringify({mode:'scoped',domains:['ci'],unitTests:[path.join(f.root,'tests/selected.test.cjs')],auditTests:[],python:[]}));
 const childEnv={...process.env,SCOPE_FILE:path.join(f.root,'scope.json')};delete childEnv.NODE_TEST_CONTEXT;
 execFileSync(process.execPath,[path.resolve('scripts/run-scoped-ci.cjs'),'unit'],{cwd:f.root,env:childEnv,stdio:['ignore','pipe','pipe']});
 assert.equal(fs.readFileSync(marker,'utf8'),'selected');
 }finally{f.close()}
});

test('image encoder edits keep image regressions in scope without cashier or print suites',()=>{
 const f=fixture();try{const p=selectScope(['server/src/utils/imageOptimization.ts'],f);assert.deepEqual(p.components,['api']);assert.deepEqual(p.domains,['media']);assert.ok(p.media);assert.deepEqual(p.http,[]);assert.deepEqual(p.browser,[])}finally{f.close()}
});

test('reading server entrypoint text does not make every API edit affect unrelated audits',()=>{
 const f=fixture();try{
  f.write('server/src/utils/imageOptimization.ts');f.write('server/src/index.ts',"import './utils/imageOptimization'")
  f.write('server/audit-tests/ai-config-boundary.test.ts',"fs.readFileSync(path.resolve('server/src/index.ts'),'utf8')")
  f.write('server/audit-tests/image-import.test.ts',"require(path.resolve('server/src/utils/imageOptimization.ts'))")
  const p=selectScope(['server/src/utils/imageOptimization.ts'],f);assert.deepEqual(p.auditTests,['server/audit-tests/image-import.test.ts'])
 }finally{f.close()}
});
