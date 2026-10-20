// Read-only change planner. Missing baselines never silently select a full suite.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const SERVICES=['api','admin','pos','staff'];
const domains={
 teamManagement:{paths:/(?:TeamManagement|team-management)/i,tests:/team-management/i},
 routineAuto:{paths:/(?:TeamRoutinePolicy|team-routine|staff-routine-auto)/i,tests:/team-routine/i},
notificationAwareness:{paths:/(?:EmployeePushDevice|ManagementFollowupReminder|pushDevice|PushSettings|employee-push-device|employee-push-worker|employee-communication-path|Notification(?:Inbox|Approval|Awareness)|notification-awareness|notification-queue|server\/src\/(?:services\/(?:EmployeeReminderService|TeamChatReminderService|TeamCommunicationService)|routes\/teamCommunication)\.ts|TrainingLibraryStore|training(?:-admin)?-update-notices|training-admin-notices|trainingNotices|TrainingPage|TrainingListPage|StaffApprovalInbox|StaffApprovalPage|LeaveListPage|LeavePage|OvertimeRequestListPage|OvertimeRequestPage|ShiftSwapListPage|ShiftSwapPage|AttendanceCorrectionListPage|AttendanceCorrectionPage|ReimbursementListPage|ReimbursementPage|EmployeePrivatePages|EmployeeWorkspacePage|HygienePage)/i,tests:/notification-awareness|approval-notices/i},
 chatNotification:{paths:/(?:TeamChatReminderService|team-chat-notification)/i,tests:/team-chat-notification/i},
 staffProfiles:{paths:/(?:StaffProfileRole|staffProfileRole|Staff(?:List|Detail|Form)Page|staff-profile)/i,tests:/staff-profile-roles/i},
 aiSettings:{paths:/(?:AiSettings|AiPermissions|aiSettingsCopy|TeamAiService|team-ai-settings)/i,tests:/ai-settings/i},
 teamWorkflowReview:{paths:/(?:client-admin\/src\/pages\/(?:staff\/(?:TeamWorkflowPanel|teamWorkflowUi|TeamCommunicationPage)|settings\/(?:TeamWorkflowSettings|AiSettingsPage))|^shared\/TeamCommunication\.tsx$|team-workflow-browser)/i,tests:/team-workflow/i},
 manualStockCorrection:{paths:/(?:ManualStockCorrection|manual-inventory-correction)/i,tests:/manual-inventory-correction/i},
 posRisk:{paths:/(?:POSRiskSummary|POSMonitorPage|POSActionLogService|posActionLog|drawerAudit|DrawerReasonDialog|pos-risk)/i,tests:/pos-risk|pos-cart|cleared-cart|receipt-monitor/i},
 teamCommunication:{paths:/(?:TeamCommunication|TeamOperations|TeamWorkflow|TeamTasks|TeamAi|TeamAttachment|teamCopy|teamWorkCopy|teamOperationCopy|teamOutbox|team-communication|team-operations|team-workflow)/i,tests:/team-communication|team-operations|team-workflow/i},
 todayStockOut:{paths:/(?:TodayStockOutService|TodayStockOuts|inventory-today-stock-out)/i,tests:/inventory-today-stock-out/i},
 staffOffline:{paths:/(?:^client-staff\/.*(?:offlineAuth|OfflineSession|employee-sw)|staff-offline-login|QRCameraScannerModal|OfflineAttendance|AttendanceQRService|attendanceQR\.ts|employee-offline-attendance)/i,tests:/staff-offline-login/i},
 attendanceReport:{paths:/(?:AttendanceReportService|attendanceReport|AttendanceDashboardPage|inventory-attendance-layout)/i,tests:/attendance-report/i},
 adminUi:{paths:/(?:AdminDialog|MainLayout|client-admin\/src\/stores\/auth\.|client-admin\/src\/pages\/LoginPage|client-admin\/src\/index\.css|ChannelProductPricingPage|client-admin\/src\/pages\/SettingsPage|InventoryIndexPage|admin-session-reuse|admin-ui-optimization)/i,tests:/admin-ui-optimization|admin-session-reuse/i},
 tv:{paths:/(?:tv-android-app|server\/public\/tv|TvSignage|tvSchema|\/routes\/tv\.|\/pages\/tv\/|tv-signage|sync-tv-player)/i,tests:/tv-signage/i},
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
 access:{paths:/(?:\/middlewares\/auth\.|\/routes\/auth\.|AuthService|StaffPermission|StaffActionApproval|refundApprovalAccess|staffAccess|EmployeeAccess|\/stores\/auth\.|access.manifest|configAccess)/i,tests:/access|permission|boundary|staff-app-flow|resource-middleware/i},
 marketing:{paths:/(?:marketing|activity|voucher|coupon|reward|lottery|tvScreen|TVScreen|tv-screen|tvMarketing)/i,tests:/activity|voucher|reward|tv-marketing/i},
 inventory:{paths:/(?:inventory|purchase|supplier|stock|Inventory|Purchase|Supplier|Stock)/i,tests:/inventory|count-boundary/i},
 training:{paths:/training/i,tests:/training/i},
 dashboard:{paths:/(?:Dashboard|dashboard|operationsAdvisor)/i,tests:/dashboard|operations-advisor/i},
 offline:{paths:/(?:offline|sync|CloudOrderSync)/i,tests:/offline|sync/i},
 barcode:{paths:/(?:barcode|^client-pos\/.*camera)/i,tests:/barcode/i},
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
 teamManagement:{scripts:['tests/stoploss/team-management-defaults-browser-check.cjs','tests/stoploss/team-management-owner-browser-check.cjs','tests/stoploss/team-management-actions-browser-check.cjs'],components:['admin','staff']},
 notificationAwareness:{scripts:['tests/stoploss/employee-push-device-page-check.cjs','tests/stoploss/employee-communication-path-page-check.cjs','tests/stoploss/employee-push-worker-check.cjs','output/notification-awareness-ui-20261020/browser-check.cjs','output/notification-approval-target-ui-20261020/browser-check.cjs','output/notification-admin-approval-race-20261020/browser-check.cjs','tests/stoploss/training-update-notices-page-check.cjs','tests/stoploss/training-admin-notices-page-check.cjs','tests/stoploss/training-notice-content-race-page-check.cjs'],components:['admin','staff']},
 desktop:{scripts:['tests/stoploss/online-update-page-check.cjs'],components:['pos']},
 staffProfiles:{scripts:['tests/stoploss/staff-profile-page-check.cjs'],components:['admin'],preview:{component:'admin',port:5191}},
 aiSettings:{scripts:['tests/stoploss/team-ai-settings-browser-check.cjs'],components:['admin']},
 teamWorkflowReview:{scripts:['tests/stoploss/team-workflow-browser-check.cjs'],components:['admin']},
 manualStockCorrection:{scripts:['tests/stoploss/manual-inventory-correction-page-check.cjs'],components:['admin']},
 posRisk:{scripts:['tests/stoploss/pos-risk-page-check.cjs','tests/stoploss/cleared-cart-page-check.cjs'],components:['admin']},
 shifts:{scripts:['tests/stoploss/pos-expense-page-check.cjs'],components:['pos']},
 todayStockOut:{scripts:['tests/stoploss/inventory-today-stock-out-page-check.cjs'],components:['staff']},
 staffOffline:{scripts:['tests/stoploss/staff-offline-login-page-check.cjs','tests/stoploss/employee-offline-attendance-page-check.cjs'],components:['staff']},
 attendanceReport:{scripts:['tests/stoploss/inventory-attendance-layout-page-check.cjs'],components:['admin']},
 adminUi:{scripts:['tests/stoploss/admin-ui-optimization-page-check.cjs','tests/stoploss/admin-session-reuse-page-check.cjs','tests/stoploss/store-date-settings-page-check.cjs'],components:['admin']},
 tv:{scripts:['tests/stoploss/tv-signage-page-check.cjs','tests/stoploss/tv-signage-admin-page-check.cjs','tests/stoploss/tv-signage-lottery-page-check.cjs','tests/stoploss/tv-signage-catalog-page-check.cjs'],components:['admin']},
 inventory:{scripts:['tests/stoploss/inventory-count-workspace-page-check.cjs','tests/stoploss/inventory-count-batch-page-check.cjs'],components:['admin']},
 staff:{scripts:['tests/stoploss/staff-basic-access-page-check.cjs'],components:['staff'],preview:{component:'staff',port:5179}},
 orders:{scripts:['tests/stoploss/order-export-page-check.cjs'],components:['admin'],preview:{component:'admin',port:5191}},
 finance:{scripts:['tests/stoploss/revenue-page-check.cjs'],components:['admin']},
 payroll:{scripts:['tests/stoploss/payroll-finance-page-check.cjs','tests/stoploss/payroll-estimate-page-check.cjs','tests/stoploss/payroll-settlement-page-check.cjs'],components:['admin','staff']},
 media:{scripts:['tests/media-insights/browser-check.cjs'],components:['admin'],preview:{component:'admin',port:5187}},
 marketing:{scripts:['tests/stoploss/unified-activity-page-check.cjs','tests/stoploss/marketing-operations-page-check.cjs','tests/stoploss/coupon-code-page-check.cjs'],components:['admin','pos']},
 dashboard:{scripts:['tests/stoploss/admin-dashboard-page-check.cjs','tests/stoploss/dashboard-refund-flow-page-check.cjs'],components:['admin']},
 receipt:{scripts:['tests/stoploss/receipt-layout-page-check.cjs','tests/stoploss/receipt-handover-ui-check.cjs','tests/stoploss/handover-receipt-settings-page-check.cjs'],components:['admin','pos']},
 barcode:{scripts:['tests/stoploss/barcode-page-check.cjs'],components:['pos']},
 display:{scripts:['tests/stoploss/customer-display-parity-page-check.cjs','tests/stoploss/independent-logo-page-check.cjs'],components:['pos','admin']},
 offline:{scripts:['tests/stoploss/continuous-offline-page-check.cjs'],components:['pos']},
 training:{scripts:['tests/stoploss/training-management-page-check.cjs'],components:['admin','staff']},
};
const httpChecks={
 staffProfiles:['tests/stoploss/staff-profile-roles-http-check.cjs'],
 manualStockCorrection:['tests/stoploss/manual-inventory-correction-http-check.cjs'],
 staffOffline:['tests/stoploss/employee-offline-attendance-http-check.cjs'],
 offline:['tests/stoploss/offline-operations-http-check.cjs'],
 attendanceReport:['tests/stoploss/employee-workspace-http-check.cjs'],
 finance:['tests/stoploss/revenue-query-http-check.cjs'],
 tv:['tests/stoploss/tv-signage-integration.cjs'],
 orders:['tests/stoploss/order-receipt-http-check.cjs'],
 shifts:['tests/stoploss/shift-review-http-check.cjs','tests/stoploss/shift-correction-http-check.cjs','tests/stoploss/expense-save-http-check.cjs'],
 access:['tests/stoploss/staff-access-v2-http-check.cjs','tests/stoploss/employee-workspace-http-check.cjs'],
};
function selectScope(files,{root=process.cwd(),full=false,tvSchemaOnly=false}={}){
 const all=sources(root),reverse=reverseDependencies(root,all,files),affected=impactedFiles(files,reverse);
 const selectedDomains=Object.entries(domains).filter(([name,rule])=>files.some(file=>rule.paths.test(file)&&(!file.startsWith('tv-android-app/')||name==='tv')&&(name==='ci'||!domains.ci.paths.test(file))&&!(name==='offline'&&(domains.tv.paths.test(file)||/^client-staff\/|staff-offline-login|employee-offline-attendance/.test(file))))).map(([name])=>name);
 // These shared execution/permission consumers implement the management loop
 // even when the changed file itself has no TeamManagement filename.
 if(!selectedDomains.includes('teamManagement')&&['server/src/services/TeamManagementContext.ts','server/src/services/TeamManagementActions.ts','server/src/services/TeamManagementDefaults.ts','server/src/services/TeamWorkflowService.ts','server/src/services/TeamWorkflowQueue.ts','server/src/services/TeamAiService.ts','server/src/services/TeamCommunicationService.ts','server/src/workers/teamWorkflow.ts','server/src/routes/teamCommunication.ts','client-admin/src/pages/settings/TeamWorkflowSettings.tsx'].some(file=>affected.has(file)))selectedDomains.push('teamManagement');
 if(!selectedDomains.includes('routineAuto')&&['server/src/services/TeamRoutinePolicy.ts','tests/stoploss/team-routine-http-check.cjs'].some(file=>affected.has(file)))selectedDomains.push('routineAuto');
 if(!selectedDomains.includes('chatNotification')&&['server/src/services/TeamChatReminderService.ts','server/src/services/EmployeeReminderService.ts','server/src/routes/employeeWorkspace.ts'].some(file=>affected.has(file)))selectedDomains.push('chatNotification');
 const services=new Set(),typecheck=new Set(),i18n=new Set();
 for(const file of affected){const client=file.match(/^client-(admin|pos|staff)\//);if(client){typecheck.add(client[1]);if(files.includes(file))services.add(client[1])}if(/^server\/(?:src|public|prisma|package|tsconfig|Dockerfile)/.test(file)){typecheck.add('api');if(files.includes(file))services.add('api')}}
 // Shared code affects the clients that import it; standalone shared assets affect all clients.
 if(files.some(file=>file.startsWith('shared/'))){for(const component of typecheck)services.add(component);if(!services.size)for(const service of ['admin','pos','staff']){services.add(service);typecheck.add(service)}}
 if(files.some(file=>/^(?:package(?:-lock)?\.json|tsconfig(?:\.[^/]+)?\.json)$/.test(file))){for(const service of SERVICES){services.add(service);typecheck.add(service)}}
 if(files.some(file=>file.startsWith('server/prisma/')||/^server\/src\/(?:index|config\/database)\./.test(file))){services.add('api');typecheck.add('api');for(const name of (tvSchemaOnly?['access','marketing','media','tv']:['orders','payment','refunds','shifts','payroll','staff','access','inventory','marketing','media']))if(!selectedDomains.includes(name))selectedDomains.push(name)}
 for(const service of typecheck)if(service!=='api')i18n.add(service);
 const unitTests=all.filter(file=>/^tests\/stoploss\/.*\.test\.cjs$/.test(file)&& (affected.has(file)||selectedDomains.some(domain=>domains[domain].tests.test(path.basename(file)))));
 const auditTests=all.filter(file=>/^server\/audit-tests\/.*\.test\.ts$/.test(file)&& (affected.has(file)||selectedDomains.some(domain=>domains[domain].tests.test(path.basename(file)))));
 const browser=[];
 for(const domain of selectedDomains){const check=browserChecks[domain];if(check&&(check.components.some(component=>typecheck.has(component))||(domain==='tv'&&typecheck.has('api'))||(domain==='teamManagement'&&files.some(file=>check.scripts.includes(file)))))browser.push({domain,...check})}
 const http=[...new Set(selectedDomains.flatMap(domain=>httpChecks[domain]||[]))];
 const builds=new Set(typecheck);
 for(const check of browser)for(const component of check.components)builds.add(component);
 const media=selectedDomains.includes('media')||files.some(file=>/^(?:server\/audit-tests\/(?:media-library|product-insights)\.check\.ts|tests\/media-insights\/)/.test(file));
 const python=[];if(selectedDomains.includes('desktop')||files.some(file=>file.startsWith('server/prisma/')))python.push('tests/stoploss/desktop-upgrade-preflight.test.py','tests/stoploss/desktop-db-upgrade.test.py');
 if(files.some(file=>/^(?:scripts\/with-docker-test\.py|tests\/stoploss\/(?:docker-test-cleanup\.test\.py|media-upload-proxy-limit\.test\.cjs))$/.test(file)))python.push('tests/stoploss/docker-test-cleanup.test.py');
 const electronTypes=files.some(file=>/^client-pos\/(?:electron\/|tsconfig\.electron\.json)/.test(file));
 if(full){for(const service of SERVICES){services.add(service);typecheck.add(service);builds.add(service);if(service!=='api')i18n.add(service)}}
 const order=list=>SERVICES.filter(s=>list.has(s));
 const teamManagement=selectedDomains.includes('teamManagement');
 const teamCommunication=selectedDomains.includes('teamCommunication'),aiSettings=selectedDomains.includes('aiSettings'),routineAuto=selectedDomains.includes('routineAuto'),chatNotification=selectedDomains.includes('chatNotification'),notificationAwareness=selectedDomains.includes('notificationAwareness');
 return {mode:full?'full':'scoped',files,domains:selectedDomains.sort(),components:order(services),typecheck:order(typecheck),electronTypes,i18n:order(i18n),build:order(builds),unitTests:unitTests.sort(),auditTests:auditTests.sort(),media,inventoryFlow:files.some(file=>/OrderConsumption|EmployeeConsumption|InventoryAlert|InventoryForecast|inventoryFlowUpgrade|audit-flow-tests|check-employee-inventory-flow/.test(file)),http,python,browser,needsDependencies:teamManagement||routineAuto||chatNotification||notificationAwareness||aiSettings||teamCommunication||typecheck.size>0||unitTests.length>0||auditTests.length>0||media||http.length>0||python.length>0,needsServer:teamManagement||routineAuto||chatNotification||notificationAwareness||aiSettings||teamCommunication||typecheck.has('api')||auditTests.length>0||media||http.length>0,needsBrowser:browser.length>0,unmappedCode:files.filter(file=>/^(?:server\/src|client-(?:admin|pos|staff)\/src|shared)\//.test(file)&&!Object.values(domains).some(rule=>rule.paths.test(file))),teamCommunication,teamManagement,aiSettings,routineAuto,chatNotification,notificationAwareness,note:'Unmapped code still receives affected-component type checks. Review the listed tests before confirming a build; full regression is opt-in.'};
}
function planRange(base,head,{root=process.cwd(),full=false,componentBaselines}={}){
 if(!/^[a-f0-9]{40}$/.test(head||''))throw Error('HEAD_SHA must be a full source SHA');
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trimEnd();
 if(git('rev-parse','HEAD')!==head)throw Error('Checkout does not match reviewed source SHA');
 if(componentBaselines){
  if(full)throw Error('Component baselines cannot restrict explicit full regression');
  if(typeof componentBaselines!=='object'||Array.isArray(componentBaselines)||Object.keys(componentBaselines).length!==SERVICES.length||SERVICES.some(service=>!/^[a-f0-9]{40}$/.test(componentBaselines[service]||'')))throw Error('Component baselines require all four verified full service SHAs');
  const owner=file=>file.startsWith('server/')?'api':file.match(/^client-(admin|pos|staff)\//)?.[1];
  const ranges={},union=new Set(),components=[];
  for(const service of SERVICES){
   const serviceBase=componentBaselines[service];git('merge-base','--is-ancestor',serviceBase,head);
   const files=git('diff','--no-renames','--name-only','-z',serviceBase,head).split('\0').filter(file=>file&&(!owner(file)||owner(file)===service));
   ranges[service]={baseSha:serviceBase,files};for(const file of files)union.add(file);
   if(selectScope(files,{root}).components.includes(service))components.push(service);
  }
  if(base&&base!==componentBaselines.api)throw Error('BASE_SHA must match the verified API baseline when component baselines are supplied');
  const files=[...union].sort();
  if(!files.length)throw Error('No component differs from the reviewed source');
  return {...selectScope(files,{root}),components,baseSha:componentBaselines.api,componentBaselines,componentRanges:ranges,headSha:head};
 }
 if(!base&&full)return {...selectScope([],{root,full}),baseSha:null,headSha:head};
 if(!/^[a-f0-9]{40}$/.test(base||''))throw Error('Scoped CI requires the full confirmed BASE_SHA; no automatic full-suite fallback');
 if(base===head&&!full)throw Error('BASE_SHA must precede HEAD_SHA for scoped checks');
 git('merge-base','--is-ancestor',base,head);
 const files=git('diff','--no-renames','--name-only','-z',base,head).split('\0').filter(Boolean);
 const stripTvModels=text=>text.replace(/\/\/ Store-scoped TV signage[^\n]*\n/g,'').replace(/^model Tv(?:Screen|Device|PairSession) \{[\s\S]*?^\}\s*/gm,'').trimEnd();
 const schemaFiles=files.filter(file=>/^server\/prisma\/schema(?:\.sqlite)?\.prisma$/.test(file));
 const tvSchemaOnly=files.includes('server/src/services/TvSignageService.ts')&&schemaFiles.length>0&&schemaFiles.every(file=>{const previous=git('show',`${base}:${file}`),current=git('show',`${head}:${file}`);return !/^model Tv(?:Screen|Device|PairSession) /m.test(previous)&&stripTvModels(previous)===stripTvModels(current)});
 return {...selectScope(files,{root,full,tvSchemaOnly}),tvSchemaOnly,baseSha:base,headSha:head};
}
function imageMatrix(components){return {include:components.map(service=>({service,context:service==='api'?'server':'.',dockerfile:service==='api'?'server/Dockerfile':`client-${service}/Dockerfile`}))};}
module.exports={selectScope,planRange,imageMatrix,SERVICES};
if(require.main===module){try{
 const plan=planRange(process.env.BASE_SHA,process.env.HEAD_SHA,{full:process.env.FULL_REGRESSION==='true',componentBaselines:process.env.COMPONENT_BASELINES?JSON.parse(process.env.COMPONENT_BASELINES):undefined});
 const output=process.env.SCOPE_FILE||'ci-scope.json';fs.writeFileSync(output,JSON.stringify(plan,null,2)+'\n');
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`dependencies=${!!plan.needsDependencies}\nserver=${!!plan.needsServer}\nbrowser=${!!plan.needsBrowser}\nfull=${plan.mode==='full'}\nmatrix=${JSON.stringify(imageMatrix(plan.mode==='full'?SERVICES:plan.components))}\nhas_images=${plan.mode==='full'||plan.components.length>0}\n`);
 console.log(JSON.stringify(plan,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}}
