/* Actual built Admin UI, synthetic session and loopback API only. No provider calls. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),{chromium}=require(root+'/node_modules/playwright'),express=require(root+'/server/node_modules/express');
const out=root+'/output/ai-diagnostics';fs.mkdirSync(out,{recursive:true});
let state={version:4,checkRevision:0,provider:'minimax',model:'MiniMax-M3',region:'cn',enabled:true,monthlyBudgetUsd:null,inputPerMillionUsd:.3,outputPerMillionUsd:1.2,maxOutputTokens:null,keyConfigured:true,month:'2026-10',estimatedMonthUsd:.01,connection:null};
let mode='ok',checks=0,saves=0,server,browser;const passed=[],errors=[];
const app=express();app.use(express.json());app.all('/api/*',(req,res)=>{
 const ok=data=>res.json({code:200,data});
 if(req.path==='/api/team/ai/settings'&&req.method==='GET')return ok(state);
 if(req.path==='/api/team/ai/settings'&&req.method==='PUT'){saves++;const {expectedVersion,targetConfirmed,removeKey,...fields}=req.body;assert.equal(expectedVersion,state.version);state={...state,...fields,version:state.version+1,connection:null};return ok(state);}
 if(req.path==='/api/team/ai/connection-check'){
  checks++;if(mode!=='ok')return res.status(mode==='gateway'?503:409).json({code:mode==='gateway'?503:409,message:mode==='gateway'?'SYNTHETIC_GATEWAY_FAILURE':mode});
  assert.equal(req.body.expectedCheckRevision,state.checkRevision);state.checkRevision++;state.connection={requestId:req.body.requestId,checkRevision:state.checkRevision,configVersion:state.version,region:state.region,model:state.model,status:'ready',checkedAt:new Date().toISOString()};return ok(state.connection);
 }
 if(req.path.startsWith('/api/ai/permissions'))return ok({executionEnabled:false,read:{sales:false,inventory:false},actions:{refund:'deny',purchase:'deny',price:'deny'}});
 if(req.path==='/api/auth/me')return ok({id:'synthetic-admin',role:'admin',storeId:'synthetic-store',managementAccess:true,staff:{id:'synthetic-staff',name:'Synthetic Owner',position:'admin'}});
 return ok([]);
});app.use(express.static(root+'/client-admin/dist'));app.get('*',(_req,res)=>res.sendFile(root+'/client-admin/dist/index.html'));
async function pass(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
(async()=>{try{
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true});
 async function open(language='zh',viewport={width:1440,height:1000}){
  const context=await browser.newContext({viewport});await context.addInitScript(({language})=>{localStorage.setItem('bubble-tea-language',language);sessionStorage.setItem('auth-storage',JSON.stringify({state:{token:'synthetic-browser-only',isAuthenticated:true,user:{id:'synthetic-admin',phone:'08000000001',role:'admin',managementAccess:true,storeId:'synthetic-store',staff:{id:'synthetic-staff',name:'Synthetic Owner',position:'admin'}}},version:0}));},{language});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>assert.equal(new URL(r.url()).origin,origin,'External browser requests prohibited'));await page.goto(origin+'/settings/ai');await page.getByTestId('ai-save').waitFor();return{page,context};
 }
 const {page,context}=await open();
 await pass('no optional limit control is offered before a successful connection',async()=>{assert.equal(await page.getByTestId('ai-output-limit').count(),0);assert.equal(state.maxOutputTokens,null);});
 for(const code of ['TEAM_AI_COST_ESTIMATE_REQUIRED','TEAM_AI_BUDGET_STATE_INVALID','TEAM_AI_BUDGET_LIMIT'])await pass(code+' explicitly reports not sent and clears only the unadmitted ticket',async()=>{
  mode=code;const before=checks,writes=saves;await page.getByTestId('ai-check-consent').check();await page.getByRole('button',{name:'验证已保存连接',exact:true}).click();await page.getByRole('alert').filter({hasText:'未调用模型'}).waitFor();assert.equal(checks,before+1);assert.equal(saves,writes);assert.equal(await page.getByRole('button',{name:'核对原验证',exact:true}).count(),0);assert(!(await page.getByTestId('ai-connection-state').textContent()).includes('待核实'));assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('bubble-tea:ai-check:')).length),0);assert.equal(state.checkRevision,0);
 });
 await pass('after success, limit remains blank until chosen; explicit value survives save/reopen and null clears it',async()=>{
  mode='ok';await page.getByTestId('ai-check-consent').check();await page.getByRole('button',{name:'验证已保存连接',exact:true}).click();await page.getByTestId('ai-connection-state').filter({hasText:'已验证'}).waitFor();await page.locator('details').last().locator('summary').click();assert.equal(await page.getByTestId('ai-output-limit').inputValue(),'');
  const before=saves;await page.getByTestId('ai-output-limit').fill('0');await page.getByTestId('ai-save').click();await page.getByRole('alert').filter({hasText:'整数'}).waitFor();assert.equal(saves,before);
  await page.getByTestId('ai-output-limit').fill('128');await page.getByTestId('ai-save').click();await page.getByTestId('ai-saved-region').filter({hasText:'版本 5'}).waitFor();assert.equal(state.maxOutputTokens,128);await page.reload();await page.getByTestId('ai-save').waitFor();await page.locator('details').last().locator('summary').click();assert.equal(await page.getByTestId('ai-output-limit').inputValue(),'128');
  await page.getByTestId('ai-output-limit').fill('');await page.getByTestId('ai-save').click();await page.getByTestId('ai-saved-region').filter({hasText:'版本 6'}).waitFor();assert.equal(state.maxOutputTokens,null);assert.equal(await page.getByTestId('ai-output-limit').count(),0);
  await page.getByTestId('ai-check-consent').check();await page.getByRole('button',{name:'验证已保存连接',exact:true}).click();await page.getByTestId('ai-connection-state').filter({hasText:'已验证'}).waitFor();
 });
 await context.close();
 for(const language of ['zh','en','id'])for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['phone',{width:390,height:844}],...(language==='zh'?[['tablet',{width:768,height:1024}]]:[])])await pass(language+' '+label+' optional blank limit is readable after success',async()=>{
  const {page,context}=await open(language,viewport);await page.locator('details').last().locator('summary').click();const input=page.getByTestId('ai-output-limit');await input.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));assert.equal(await input.inputValue(),'');assert(await input.evaluate(el=>{const b=el.getBoundingClientRect();return b.y>=56&&b.bottom<innerHeight-80&&document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===el;}),'optional input is visible and not covered by the sticky save bar');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/optional-limit-'+language+'-'+label+'.png'});await context.close();
 });
 const later=await open();await pass('an uncertain gateway result still retains original ticket across read-only refresh and reload',async()=>{
  state={...state,version:state.version+1,connection:null};mode='gateway';await later.page.reload();await later.page.getByTestId('ai-save').waitFor();const before=checks;await later.page.getByTestId('ai-check-consent').check();await later.page.getByRole('button',{name:'验证已保存连接',exact:true}).click();await later.page.getByTestId('ai-connection-state').filter({hasText:'待核实'}).waitFor();await later.page.getByRole('button',{name:'刷新状态',exact:true}).click();await later.page.reload();await later.page.getByTestId('ai-save').waitFor();await later.page.getByTestId('ai-connection-state').filter({hasText:'待核实'}).waitFor();assert.equal(checks,before+1);assert.equal(await later.page.getByRole('button',{name:'核对原验证',exact:true}).count(),1);assert.equal(await later.page.getByTestId('ai-output-limit').count(),0);
 });await later.context.close();assert.deepEqual(errors,[]);fs.writeFileSync(out+'/budget-browser-results.json',JSON.stringify({passed,errors,allApiRequestsMocked:true,productionWrites:false,realProviderRequests:0},null,2)+'\n');
}finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
