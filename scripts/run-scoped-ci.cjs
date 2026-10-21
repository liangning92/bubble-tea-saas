const fs=require('node:fs'),path=require('node:path'),{spawnSync,spawn}=require('node:child_process');
const phase=process.argv[2],plan=JSON.parse(fs.readFileSync(process.env.SCOPE_FILE||'ci-scope.json','utf8'));
if(plan.mode!=='scoped')throw Error('The scoped runner cannot replace an explicitly requested full regression');
const env={...process.env,INTENT_DEPS:[path.resolve('server/node_modules'),path.resolve('node_modules')].join(path.delimiter)};
const npm=process.platform==='win32'?'npm.cmd':'npm';
const vite=path.resolve('node_modules/vite/bin/vite.js');
function run(command,args,extra={}){const result=spawnSync(command,args,{stdio:'inherit',env:{...env,...extra}});if(result.error)throw result.error;if(result.status!==0)throw Error(`Failed ${command} ${args.join(' ')}`)}
function node(file,extra={}){run(process.execPath,[file],extra)}
async function browserCheck(check){
 let preview;
 try{
  if(check.preview){const {component,port}=check.preview;preview=spawn(process.execPath,[vite,'preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('client-'+component),stdio:'inherit',env});
   let ready=false;for(let i=0;i<60;i++){if(preview.exitCode!==null)throw Error('Preview exited before becoming ready');try{if((await fetch(`http://127.0.0.1:${port}`,{signal:AbortSignal.timeout(1000)})).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,250))}if(!ready)throw Error('Preview unavailable');
  }
  for(const file of check.scripts)node(file,{ACTIVITY_ADMIN_BUILD:path.resolve('client-admin/dist'),ACTIVITY_POS_BUILD:path.resolve('client-pos/dist'),MARKETING_ADMIN_BUILD:path.resolve('client-admin/dist'),TV_STANDBY_ADMIN_BUILD:path.resolve('client-admin/dist'),TV_STANDBY_POS_BUILD:path.resolve('client-pos/dist')});
 }finally{if(preview)preview.kill('SIGTERM')}
}
(async()=>{
 console.log(`Scoped ${phase}: ${plan.domains.join(', ')||'documentation only'}`);
 switch(phase){
 case 'types':for(const service of plan.typecheck)run(npm,['run','typecheck:'+ (service==='api'?'server':service)]);if(plan.electronTypes)run(npm,['exec','--','tsc','--noEmit','-p','client-pos/tsconfig.electron.json']);break;
 case 'i18n':for(const service of plan.i18n)run(npm,['run','i18n:check:'+service]);break;
 case 'unit':
  if(plan.agentTasks)run('python3',['scripts/test-hermes-pdca.py'],{PYTHONDONTWRITEBYTECODE:'1'});
  if(plan.agentTasks)run(process.execPath,['--import',path.resolve('server/node_modules/tsx/dist/loader.mjs'),'--test','server/src/__tests__/hermesTransport.test.ts']);
  if(plan.inventoryFlow)node('scripts/check-employee-inventory-flow.cjs');
  if(plan.unitTests.length)run(process.execPath,['--test',...plan.unitTests]);
  if(plan.auditTests.length)run(npm,['exec','--prefix','server','--','jest','--config','server/jest.audit.config.cjs','--runInBand','--runTestsByPath',...plan.auditTests.map(f=>path.resolve(f))]);
  for(const file of plan.python)run('python3',[file],{PYTHONDONTWRITEBYTECODE:'1'});
  break;
 case 'media':if(plan.media)node('scripts/test-media-insights.cjs');break;
 case 'http':
  if(plan.agentTasks){run(npm,['run','build:server']);run('python3',['scripts/with-docker-test.py','--','python3','scripts/test-agent-tasks.py']);run('python3',['scripts/with-docker-test.py','--','python3','scripts/test-agent-pilot-host.py'])}
  if(plan.teamManagement){run(npm,['run','build:server']);run('python3',['scripts/with-docker-test.py','--','python3','scripts/test-team-communication.py','--management-loop']);run('python3',['scripts/with-docker-test.py','--','python3','tests/stoploss/team-management-actions-pg.py'])}
  if(plan.routineAuto){run(npm,['run','build:server']);run('python3',['scripts/with-docker-test.py','--','python3','scripts/test-team-communication.py','--routine-auto'])}
  if(plan.notificationAwareness){run(npm,['run','build:server']);for(const script of ['scripts/test-notification-awareness.py','scripts/test-training-update-notices.py','scripts/test-approval-notices.py'])run('python3',['scripts/with-docker-test.py','--','python3',script])}
  if(plan.chatNotification){if(!plan.notificationAwareness)run(npm,['run','build:server']);run('python3',['scripts/with-docker-test.py','--','python3','scripts/test-team-communication.py','--chat-notify'])}
  if(plan.domains.includes('externalMcpEvents')){run(npm,['run','build:server']);run('python3',['scripts/with-docker-test.py','--','python3','scripts/test-external-mcp-events.py']);run('python3',['scripts/with-docker-test.py','--','python3','scripts/test-external-mcp-events.py','--automatic'])}
  if(plan.employeeRuntime){run(npm,['run','build:server']);run('python3',['scripts/with-docker-test.py','--','python3','scripts/test-employee-runtime.py'])}
  if(plan.teamAgentBridge){run(npm,['run','build:server']);run('python3',['scripts/with-docker-test.py','--','python3','scripts/test-team-agent-bridge.py'])}
  if(plan.teamWorkItems){run(npm,['run','build:server']);run('python3',['scripts/with-docker-test.py','--','python3','scripts/test-team-work-items.py'])}
  if(plan.teamCommunication){run(npm,['run','build:server']);run('python3',['scripts/with-docker-test.py','--','python3','scripts/test-team-communication.py'])}
  if(plan.aiSettings){if(!plan.teamCommunication)run(npm,['run','build:server']);run('python3',['scripts/with-docker-test.py','--','python3','scripts/test-team-communication.py','--ai-settings'])}
  if(plan.http.length){
   const prepared=spawnSync(process.execPath,['scripts/prepare-order-receipt-runtime.cjs'],{encoding:'utf8',env});if(prepared.status!==0)throw Error(prepared.stderr||'Cannot prepare disposable HTTP runtime');
   const runtime=JSON.parse(prepared.stdout).runtime;
   try{for(const provider of ['sqlite','postgresql'])for(const file of plan.http)node(file,{INTENT_RUNTIME:runtime,RECEIPT_RUNTIME:runtime,INTENT_PROVIDER:provider,RECEIPT_PROVIDER:provider,RECEIPT_DEPS:env.INTENT_DEPS})}
   finally{if(!runtime.startsWith('/tmp/pos-idempotency-runtime-'))throw Error('Refuse unowned runtime cleanup');fs.rmSync(runtime,{recursive:true,force:true})}
  }break;
 case 'build':for(const service of plan.build.filter(s=>s!=='api'))run(npm,['run','build:'+service]);break;
 case 'browser':for(const check of plan.browser)await browserCheck(check);if(plan.aiSettings)node('tests/stoploss/team-ai-settings-budget-browser.cjs');break;
 default:throw Error('Unknown scoped CI phase');
 }
})().catch(error=>{console.error(error.message);process.exitCode=1});
