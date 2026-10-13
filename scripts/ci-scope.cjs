// Read-only change planner. Missing baselines never silently select a full suite.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const SERVICES=['api','admin','pos','staff'];
const domains={
 media:{paths:/(?:ProductImageEditor|MediaLibrary|\/services\/media\.|\/routes\/media\.|MediaService|mediaFiles|imageOptimization|image-optimization|ProductInsights|productInsights|ProductAnalysisPage|\/media-insights\/|test-media-insights)/i,tests:/media|product-insights/i},
 products:{paths:/(?:\/pages\/products\/|\/routes\/product(?:Price)?\.|Product(?:Management)?Service|\/productStore\.|\/publicProduct\.|\/routes\/bom\.|BomService)/i,tests:/product|channel-bootstrap/i},
 orders:{paths:/(?:\/pages\/orders\/|\/routes\/order\.|OrderService|orderRequest|orderReceipt|orderExport|orderStatus|posCartState|cartAudit|\/cartStore\.)/i,tests:/order|cart-audit|pos-cart|cleared-cart/i},
 payment:{paths:/(?:\/routes\/payment\.|PaymentService|Checkout|checkout|payment|\/pages\/POSPage\.|\/stores\/pos\.)/i,tests:/payment|checkout|order-request-replay/i},
 refunds:{paths:/(?:\/pages\/.*Refund|\/routes\/refund|Refund|refundAllocation|refundPolicy)/i,tests:/refund|order-finance/i},
 receipt:{paths:/(?:receipt|printer|printWorker|cup.?label|barcode.*print)/i,tests:/receipt|printer|print-worker|cup-label/i},
 shifts:{paths:/(?:shift|posCash|posExpense|PosExpense|expenseCategories|\/pages\/expense\/|\/routes\/expense\.)/i,tests:/shift|expense|handover/i},
 finance:{paths:/(?:\/pages\/finance\/|\/routes\/(?:finance|revenue)\.|FinanceService|RevenueService|revenue|dashboardNavigation)/i,tests:/finance|revenue/i},
 payroll:{paths:/(?:salary|payroll|attendance|probation|workingDays|leave|roster)/i,tests:/salary|payroll|probation|attendance|staff-offboarding/i},
 staff:{paths:/(?:\/pages\/staff\/|\/routes\/staff\.|StaffService|EmployeeNumber|employeeNumber|\/client-staff\/|^client-staff\/)/i,tests:/staff|employee-number/i},
 access:{paths:/(?:\/middlewares\/auth\.|\/routes\/auth\.|AuthService|StaffPermission|staffAccess|EmployeeAccess|\/stores\/auth\.|access.manifest|configAccess)/i,tests:/access|permission|boundary|staff-app-flow|resource-middleware/i},
 marketing:{paths:/(?:marketing|activity|voucher|coupon|reward|lottery|tvScreen|TVScreen|tv-screen|tvMarketing)/i,tests:/activity|voucher|reward|tv-marketing/i},
 inventory:{paths:/(?:inventory|purchase|supplier|stock|Inventory|Purchase|Supplier|Stock)/i,tests:/inventory|count-boundary/i},
 training:{paths:/training/i,tests:/training/i},
 dashboard:{paths:/(?:Dashboard|dashboard|operationsAdvisor)/i,tests:/dashboard|operations-advisor/i},
 offline:{paths:/(?:offline|sync|CloudOrderSync)/i,tests:/offline|sync/i},
 barcode:{paths:/(?:barcode|Barcode|camera)/i,tests:/barcode/i},
 display:{paths:/(?:CustomerDisplay|customer-display|dualScreen|DisplayCanvas|independent.*logo)/i,tests:/display|logo/i},
 desktop:{paths:/(?:^client-pos\/electron\/|electron-builder|installer\.nsh|desktop-db-|desktop-template|windows-validation|validate-windows|UpdateNotification|onlineUpdate|updater)/i,tests:/desktop|windows|update-version/i},
 routes:{paths:/(?:^server\/src\/index\.|\/App\.tsx$|\/lazyRoute\.|route.?split)/i,tests:/route-reachability|collection-route|staff-routing/i},
 ci:{paths:/^(?:\.github\/|scripts\/(?:ci-scope|run-scoped-ci|batch-build-report|windows-validation-scope)|tests\/stoploss\/(?:ci-scope|release-source-gate|batch-build-report|windows-validation-scope|windows-release-tag)\.|AGENTS\.md$|docs\/BATCH-BUILD-WORKFLOW\.md$)/,tests:/ci-scope|release-source-gate|batch-build-report|windows-validation-scope|windows-release-tag/},
 i18n:{paths:/(?:\/i18n\/|i18n-check|i18n-parser)/,tests:/i18n-parser/},
};
function sources(root){
 const result=[];
 function walk(relative){const directory=path.join(root,relative);if(!fs.existsSync(directory))return;for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.posix.join(relative,entry.name);if(entry.isDirectory())walk(file);else if(/\.(?:tsx?|[cm]?js)$/.test(file))result.push(file)}}
 for(const dir of ['server/src','server/audit-tests','shared','client-admin/src','client-pos/src','client-staff/src','tests/stoploss','tests/media-insights','scripts','.github/scripts'])walk(dir);
 return result;
}
function reverseDependencies(root,files,changed=[]){
 const known=new Set([...files,...changed]),reverse=new Map(),inspection=new Map();
 const resolve=(file,reference)=>{
  const candidates=[];
  if(reference.startsWith('.'))candidates.push(path.posix.normalize(path.posix.join(path.posix.dirname(file),reference)));
  else if(reference.startsWith('@/')){const client=file.split('/')[0];candidates.push(client+'/src/'+reference.slice(2))}
  else if(/^(?:server|shared|client-(?:admin|pos|staff)|scripts|tests|\.github)\//.test(reference))candidates.push(reference.replace(/^server\/dist\//,'server/src/'));
  for(const base of candidates)for(const target of [base,base.replace(/\.[cm]?js$/,'.ts'),...['.ts','.tsx','.cjs','.js','/index.ts','/index.tsx'].map(ext=>base+ext)])if(known.has(target))return target;
 };
 for(const file of files){const text=fs.readFileSync(path.join(root,file),'utf8');for(const match of text.matchAll(/\b(from|import)\s*(?:\(\s*)?['"]([^'"\r\n]+)['"]|\b(require|readFileSync|readFile|readModule|loadModule|compile|load|resolve)\(\s*['"]([^'"\r\n]+)['"]/g)){
  const target=resolve(file,match[2]||match[4]);if(!target)continue
  const method=match[1]||match[3],prefix=text.slice(Math.max(0,match.index-60),match.index)
  // A source-text assertion depends on that file's text, not everything it imports.
  const shallow=method==='readFileSync'||method==='readFile'||(method==='resolve'&&!/require\(\s*(?:path\.)?$/.test(prefix))
  const graph=shallow?inspection:reverse;if(!graph.has(target))graph.set(target,new Set());graph.get(target).add(file)
 }}
 return {reverse,inspection};
}
function impactedFiles(files,{reverse,inspection}){
 const affected=new Set(files),queue=[...files];
 for(const file of files)for(const consumer of inspection.get(file)||[])affected.add(consumer)
 for(let i=0;i<queue.length;i++)for(const consumer of reverse.get(queue[i])||[])if(!affected.has(consumer)){affected.add(consumer);queue.push(consumer)}
 return affected;
}
const browserChecks={
 inventory:{scripts:['tests/stoploss/inventory-count-workspace-page-check.cjs'],components:['admin']},
 staff:{scripts:['tests/stoploss/staff-basic-access-page-check.cjs'],components:['staff'],preview:{component:'staff',port:5179}},
 orders:{scripts:['tests/stoploss/order-export-page-check.cjs'],components:['admin'],preview:{component:'admin',port:5191}},
 finance:{scripts:['tests/stoploss/revenue-page-check.cjs'],components:['admin']},
 payroll:{scripts:['tests/stoploss/payroll-finance-page-check.cjs','tests/stoploss/payroll-estimate-page-check.cjs'],components:['admin','staff']},
 media:{scripts:['tests/media-insights/browser-check.cjs'],components:['admin'],preview:{component:'admin',port:5187}},
 marketing:{scripts:['tests/stoploss/unified-activity-page-check.cjs','tests/stoploss/marketing-operations-page-check.cjs'],components:['admin','pos']},
 dashboard:{scripts:['tests/stoploss/admin-dashboard-page-check.cjs'],components:['admin']},
 receipt:{scripts:['tests/stoploss/receipt-layout-page-check.cjs','tests/stoploss/receipt-handover-ui-check.cjs','tests/stoploss/handover-receipt-settings-page-check.cjs'],components:['admin','pos']},
 barcode:{scripts:['tests/stoploss/barcode-page-check.cjs'],components:['pos']},
 display:{scripts:['tests/stoploss/customer-display-parity-page-check.cjs','tests/stoploss/independent-logo-page-check.cjs'],components:['pos','admin']},
 offline:{scripts:['tests/stoploss/continuous-offline-page-check.cjs'],components:['pos']},
 training:{scripts:['tests/stoploss/training-management-page-check.cjs'],components:['admin','staff']},
};
const httpChecks={
 orders:['tests/stoploss/order-receipt-http-check.cjs'],
 shifts:['tests/stoploss/shift-review-http-check.cjs','tests/stoploss/shift-correction-http-check.cjs','tests/stoploss/expense-save-http-check.cjs'],
 access:['tests/stoploss/staff-access-v2-http-check.cjs','tests/stoploss/employee-workspace-http-check.cjs'],
};
function selectScope(files,{root=process.cwd(),full=false}={}){
 const all=sources(root),reverse=reverseDependencies(root,all,files),affected=impactedFiles(files,reverse);
 const selectedDomains=Object.entries(domains).filter(([name,rule])=>files.some(file=>rule.paths.test(file)&&(name==='ci'||!domains.ci.paths.test(file)))).map(([name])=>name);
 const services=new Set(),typecheck=new Set(),i18n=new Set();
 for(const file of affected){const client=file.match(/^client-(admin|pos|staff)\//);if(client){typecheck.add(client[1]);if(files.includes(file))services.add(client[1])}if(/^server\/(?:src|prisma|package|tsconfig|Dockerfile)/.test(file)){typecheck.add('api');if(files.includes(file))services.add('api')}}
 // Shared code affects the clients that import it; standalone shared assets affect all clients.
 if(files.some(file=>file.startsWith('shared/'))){for(const component of typecheck)services.add(component);if(!services.size)for(const service of ['admin','pos','staff']){services.add(service);typecheck.add(service)}}
 if(files.some(file=>/^(?:package(?:-lock)?\.json|tsconfig(?:\.[^/]+)?\.json)$/.test(file))){for(const service of SERVICES){services.add(service);typecheck.add(service)}for(const name of Object.keys(domains).filter(name=>!['ci','i18n'].includes(name)))if(!selectedDomains.includes(name))selectedDomains.push(name)}
 if(files.some(file=>file.startsWith('server/prisma/')||/^server\/src\/(?:index|config\/database)\./.test(file))){services.add('api');typecheck.add('api');for(const name of ['orders','payment','refunds','shifts','payroll','staff','access','inventory','marketing','media'])if(!selectedDomains.includes(name))selectedDomains.push(name)}
 for(const service of typecheck)if(service!=='api')i18n.add(service);
 const unitTests=all.filter(file=>/^tests\/stoploss\/.*\.test\.cjs$/.test(file)&& (affected.has(file)||selectedDomains.some(domain=>domains[domain].tests.test(path.basename(file)))));
 const auditTests=all.filter(file=>/^server\/audit-tests\/.*\.test\.ts$/.test(file)&& (affected.has(file)||selectedDomains.some(domain=>domains[domain].tests.test(path.basename(file)))));
 const browser=[];
 for(const domain of selectedDomains){const check=browserChecks[domain];if(check&&check.components.some(component=>typecheck.has(component)))browser.push({domain,...check})}
 const http=[...new Set(selectedDomains.flatMap(domain=>httpChecks[domain]||[]))];
 const builds=new Set(typecheck);
 for(const check of browser)for(const component of check.components)builds.add(component);
 const media=selectedDomains.includes('media')||files.some(file=>/^(?:server\/audit-tests\/(?:media-library|product-insights)\.check\.ts|tests\/media-insights\/)/.test(file));
 const python=[];if(selectedDomains.includes('desktop')||files.some(file=>file.startsWith('server/prisma/')))python.push('tests/stoploss/desktop-upgrade-preflight.test.py','tests/stoploss/desktop-db-upgrade.test.py');
 const electronTypes=files.some(file=>/^client-pos\/(?:electron\/|tsconfig\.electron\.json)/.test(file));
 if(full){for(const service of SERVICES){services.add(service);typecheck.add(service);builds.add(service);if(service!=='api')i18n.add(service)}}
 const order=list=>SERVICES.filter(s=>list.has(s));
 return {mode:full?'full':'scoped',files,domains:selectedDomains.sort(),components:order(services),typecheck:order(typecheck),electronTypes,i18n:order(i18n),build:order(builds),unitTests:unitTests.sort(),auditTests:auditTests.sort(),media,inventoryFlow:files.some(file=>/OrderConsumption|EmployeeConsumption|InventoryAlert|InventoryForecast|inventoryFlowUpgrade|audit-flow-tests|check-employee-inventory-flow/.test(file)),http,python,browser,needsDependencies:typecheck.size>0||unitTests.length>0||auditTests.length>0||media||http.length>0||python.length>0,needsServer:typecheck.has('api')||auditTests.length>0||media||http.length>0,needsBrowser:browser.length>0,unmappedCode:files.filter(file=>/^(?:server\/src|client-(?:admin|pos|staff)\/src|shared)\//.test(file)&&!Object.values(domains).some(rule=>rule.paths.test(file))),note:'Unmapped code still receives affected-component type checks. Review the listed tests before confirming a build; full regression is opt-in.'};
}
function planRange(base,head,{root=process.cwd(),full=false}={}){
 if(!/^[a-f0-9]{40}$/.test(head||''))throw Error('HEAD_SHA must be a full source SHA');
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trimEnd();
 if(git('rev-parse','HEAD')!==head)throw Error('Checkout does not match reviewed source SHA');
 if(!base&&full)return {...selectScope([],{root,full}),baseSha:null,headSha:head};
 if(!/^[a-f0-9]{40}$/.test(base||''))throw Error('Scoped CI requires the full confirmed BASE_SHA; no automatic full-suite fallback');
 if(base===head&&!full)throw Error('BASE_SHA must precede HEAD_SHA for scoped checks');
 git('merge-base','--is-ancestor',base,head);
 const files=git('diff','--no-renames','--name-only','-z',base,head).split('\0').filter(Boolean);
 return {...selectScope(files,{root,full}),baseSha:base,headSha:head};
}
function imageMatrix(components){return {include:components.map(service=>({service,context:service==='api'?'server':'.',dockerfile:service==='api'?'server/Dockerfile':`client-${service}/Dockerfile`}))};}
module.exports={selectScope,planRange,imageMatrix,SERVICES};
if(require.main===module){try{
 const plan=planRange(process.env.BASE_SHA,process.env.HEAD_SHA,{full:process.env.FULL_REGRESSION==='true'});
 const output=process.env.SCOPE_FILE||'ci-scope.json';fs.writeFileSync(output,JSON.stringify(plan,null,2)+'\n');
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`dependencies=${!!plan.needsDependencies}\nserver=${!!plan.needsServer}\nbrowser=${!!plan.needsBrowser}\nfull=${plan.mode==='full'}\nmatrix=${JSON.stringify(imageMatrix(plan.mode==='full'?SERVICES:plan.components))}\nhas_images=${plan.mode==='full'||plan.components.length>0}\n`);
 console.log(JSON.stringify(plan,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}}
