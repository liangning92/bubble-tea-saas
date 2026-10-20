/* Built admin + actual management middleware/router + disposable PostgreSQL. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),{chromium}=require(root+'/node_modules/playwright'),express=require(root+'/server/node_modules/express'),jwt=require(root+'/server/node_modules/jsonwebtoken');
const {prisma}=require(root+'/server/dist/config/database'),{config}=require(root+'/server/dist/config/env');
const {authenticate,authenticateBeforeRouting}=require(root+'/server/dist/middlewares/auth'),{declareAccessRoutes}=require(root+'/server/dist/middlewares/staffAccessV2');
const {configRouter}=require(root+'/server/dist/routes/config');
const {externalAccess}=require(root+'/server/dist/services/externalAccess/service'),{postgresExternalRepository}=require(root+'/server/dist/services/externalAccess/postgresRepository'),{externalAccessRouter}=require(root+'/server/dist/routes/externalAccess');
const url=new URL(process.env.DATABASE_URL);assert.equal(url.pathname,'/team_test');assert.equal(url.hostname,'127.0.0.1');assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));
const out=root+'/output/external-access';fs.mkdirSync(out,{recursive:true});const passed=[],errors=[];let server,browser,mode='ok';
async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name)}
(async()=>{try{
 const tenant=await prisma.tenant.create({data:{name:'External isolated fixture'}});
 for(const storeId of ['external-store','other-store'])await prisma.store.create({data:{id:storeId,name:storeId,tenantId:tenant.id}});
 for(const [id,role,storeId,n]of [['owner','admin','external-store',1],['manager','manager','external-store',2],['outsider','admin','other-store',3]])await prisma.user.create({data:{id,phone:'0800099900'+n,password:'not-a-login-credential',role,storeId,staff:{create:{id:'staff-'+id,storeId,name:id,employeeNumber:'EXT-'+id}}}});
 const user=await prisma.user.findUniqueOrThrow({where:{id:'owner'},include:{staff:true}});
 async function token(id){const u=await prisma.user.findUniqueOrThrow({where:{id},include:{staff:true}});return jwt.sign({id:u.id,phone:u.phone,role:u.role,storeId:u.storeId,staffId:u.staff.id,issuedAtMs:Date.now()},config.jwt.secret,{expiresIn:'10m'})}
 const adminToken=await token('owner'),managerToken=await token('manager'),otherToken=await token('outsider');
 const app=express();app.use(express.json());
 app.use('/api/external-access',(req,res,next)=>{if(mode==='drop_once'&&['POST','PUT'].includes(req.method)){mode='ok';res.json=()=>{req.socket.destroy();return res}}if(mode==='outage')return res.status(503).json({code:503,message:'ISOLATED_OUTAGE'});next()},authenticateBeforeRouting,declareAccessRoutes('/api/external-access',externalAccessRouter(externalAccess(postgresExternalRepository(prisma)),authenticate)));
 app.use('/api/config',authenticateBeforeRouting,declareAccessRoutes('/api/config',configRouter));
 app.all('/api/*',(req,res)=>{if(req.path==='/api/auth/me')return res.json({code:200,data:{...user,managementAccess:true}});if(req.path==='/api/team/ai/settings')return res.json({code:200,data:{version:0,enabled:false,provider:'minimax',model:'MiniMax-M3',region:'cn',checkRevision:0,month:'2026-10',estimatedMonthUsd:0,connection:null,monthlyBudgetUsd:null,inputPerMillionUsd:.3,outputPerMillionUsd:1.2,keyConfigured:false}});return res.json({code:200,data:[]})});
 app.use(express.static(root+'/client-admin/dist'));app.get('*',(_req,res)=>res.sendFile(root+'/client-admin/dist/index.html'));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
 async function api(method,relative,body,credential=adminToken){const response=await fetch(origin+'/api/external-access'+relative,{method,headers:{'Content-Type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:await response.json()}}
 await check('real auth denies unauthenticated and manager configuration access',async()=>{assert.equal((await api('GET','',null,null)).status,401);assert.equal((await api('GET','',null,managerToken)).status,403)});
 browser=await chromium.launch({headless:true});
 async function open(language='zh',viewport={width:1440,height:1100}){
  const context=await browser.newContext({viewport});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await context.addInitScript(({language,token})=>{localStorage.setItem('bubble-tea-language',language);sessionStorage.setItem('auth-storage',JSON.stringify({state:{token,isAuthenticated:true,user:{id:'owner',role:'admin',storeId:'external-store',managementAccess:true,staff:{id:'staff-owner',name:'Synthetic admin'}}},version:0}));},{language,token:adminToken});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',async r=>{if(r.url().includes('/external-access')&&r.status()>=400)console.log('External API status',r.status(),(await r.text()).slice(0,180))});await page.goto(origin+'/settings/ai');try{await page.getByTestId('external-name').waitFor({timeout:15000})}catch(e){await page.screenshot({path:out+'/failure.png',fullPage:true});fs.writeFileSync(out+'/failure.txt',(await page.locator('body').innerText())+'\n'+JSON.stringify(errors));throw e}return{context,page,section:page.getByTestId('external-agent-settings')};
 }
 const {context,page,section}=await open();
 await check('empty state and disabled production state render without connection claim',async()=>{await section.getByText('尚未配置外部客户端。').waitFor();assert((await section.getByTestId('external-production-state').textContent()).includes('未建立真实连接'))});
 await check('admin creates actual disabled Postgres configuration, reload restores settings',async()=>{
  await section.getByTestId('external-name').fill('Isolated client A');await section.getByTestId('external-tool-0').check();await section.getByTestId('external-channels').fill('11111111-1111-4111-8111-111111111111');await section.getByTestId('external-save').click();await section.getByRole('status').filter({hasText:'已保存禁用配置'}).waitFor();
  const rows=(await api('GET','')).body.data;assert.equal(rows.length,1);assert.equal(rows[0].enabled,false);assert.equal(rows[0].authState,'unconfigured');assert.deepEqual(rows[0].tools,['tasks.read']);assert.equal((await prisma.config.findMany({where:{storeId:'external-store',key:'externalAgent.access.v1'}})).length,1);
  await page.reload();await section.getByRole('button',{name:'编辑',exact:true}).click();assert.equal(await section.getByTestId('external-name').inputValue(),'Isolated client A');assert(await section.getByTestId('external-tool-0').isChecked());await page.screenshot({fullPage:true,path:out+'/saved-registration.png'});
 });
 await check('generic config routes cannot read, overwrite, batch-write or delete access state',async()=>{
  async function generic(method,relative,body,credential=managerToken){const r=await fetch(origin+'/api/config'+relative,{method,headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,body:await r.json()}}
  assert(!Object.keys((await generic('GET','')).body.data).some(k=>k.startsWith('externalAgent.')));
  for(const credential of [adminToken,managerToken]){
   assert.notEqual((await generic('GET','/external-store/externalAgent.access.v1',null,credential)).status,200);
   assert.notEqual((await generic('POST','',{storeId:'external-store',key:'externalAgent.access.v1',value:{registrations:[]},category:'externalAgent'},credential)).status,200);
   assert.notEqual((await generic('POST','/batch',{storeId:'external-store',configs:[{key:'externalAgent.access.v1',value:{registrations:[]}}]},credential)).status,200);
   assert.notEqual((await generic('DELETE','/external-store/externalAgent.access.v1',null,credential)).status,200);
  }
  assert.equal((await api('GET','')).body.data.length,1);
 });
 await check('validation is accurate and client replacement preserves disabled state, advances revisions',async()=>{
  await section.getByTestId('external-validate').click();await section.getByRole('status').filter({hasText:'配置已校验'}).waitFor();
  await section.getByTestId('external-type').selectOption('adapter_required');await section.getByTestId('external-name').fill('Other agent requiring adapter');await section.getByTestId('external-tool-2').check();await section.getByTestId('external-save').click();await section.getByRole('status').filter({hasText:'已保存禁用配置'}).waitFor();
  assert(await section.getByTestId('external-validate').isDisabled());const row=(await api('GET','')).body.data[0];assert.equal(row.version,2);assert.equal(row.authVersion,2);assert.equal(row.clientRevision,2);assert.equal(row.connectionState,'not_tested');assert.equal(row.enabled,false);
 });
 await check('cross-store lookup and arbitrary store scope denied; concurrent Postgres CAS permits one writer',async()=>{
  let row=(await api('GET','')).body.data[0];assert.deepEqual((await api('GET','',null,otherToken)).body.data,[]);
  const payload={expectedVersion:row.version,name:row.name,clientType:row.clientType,enabled:false,storeIds:['external-store'],channelIds:row.channelIds,tools:row.tools,approvalRequired:true};
  assert.equal((await api('PUT','/'+row.id,payload,otherToken)).status,403);assert.equal((await api('PUT','/'+row.id,{...payload,storeIds:['other-store']})).status,403);assert.equal((await api('PUT','/'+row.id,{...payload,enabled:true})).status,409);
  const results=await Promise.all([api('PUT','/'+row.id,{...payload,name:'concurrent A'}),api('PUT','/'+row.id,{...payload,name:'concurrent B'})]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
  await section.getByTestId('external-name').fill('stale edit');await section.getByTestId('external-save').click();await section.getByRole('alert').filter({hasText:'配置已变化'}).waitFor();assert(await section.getByTestId('external-save').isDisabled());await section.getByRole('button',{name:'重新读取已保存配置'}).click();await section.getByTestId('external-selected-version').filter({hasText:'配置版本 3'}).waitFor();
 });
 await check('lost save response locks edits, read-only refresh recovers committed result without duplicate write',async()=>{
  const before=(await api('GET','')).body.data[0].version;mode='drop_once';await section.getByTestId('external-name').fill('committed with lost response');await section.getByTestId('external-save').click();await section.getByRole('alert').filter({hasText:/结果不明|配置已变化/}).waitFor();assert(await section.getByTestId('external-save').isDisabled());
  assert.equal((await api('GET','')).body.data[0].version,before+1);await section.getByRole('button',{name:'重新读取已保存配置'}).click();await section.getByTestId('external-selected-version').filter({hasText:'配置版本 '+(before+1)}).waitFor();assert.equal(await section.getByTestId('external-name').inputValue(),'committed with lost response');assert.equal((await api('GET','')).body.data[0].version,before+1);
 });
 await check('revoke and remove use actual API, preserve audit without secret or content',async()=>{
  await section.getByTestId('external-revoke').click();await section.getByRole('status').filter({hasText:'授权已撤销'}).waitFor();const row=(await api('GET','')).body.data[0];assert.equal(row.authState,'revoked');assert.equal(row.executionState,'frozen');
  await section.locator('summary').click();await section.getByTestId('external-audits').waitFor();assert(!(await section.getByTestId('external-audits').textContent()).includes('Isolated client A'));
  await section.getByTestId('external-remove').click();await section.getByTestId('external-confirm-remove').click();await section.getByText('尚未配置外部客户端。').waitFor();assert.deepEqual((await api('GET','')).body.data,[]);assert((await api('GET','/audits')).body.data.some(a=>a.action==='remove'));
 });
 await check('outage is explicit and refresh recovers without silent write retry',async()=>{mode='outage';await section.getByRole('button',{name:'重新读取已保存配置'}).click();await section.getByRole('alert').waitFor();mode='ok';await section.getByRole('button',{name:'重新读取已保存配置'}).click();await section.getByTestId('external-name').waitFor()});
 await context.close();
 for(const language of ['zh','en','id'])for(const [label,viewport]of [['desktop',{width:1440,height:1100}],['tablet',{width:768,height:1024}],['phone',{width:390,height:844}]])await check(language+' '+label+' responsive controls and disabled state',async()=>{
  const v=await open(language,viewport);await v.section.scrollIntoViewIfNeeded();assert(await v.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await v.section.getByTestId('external-name').isVisible());await v.page.screenshot({fullPage:true,path:out+'/settings-'+language+'-'+label+'.png'});await v.context.close();
 });
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/postgres-browser-results.json',JSON.stringify({passed,errors,actualPostgres:true,actualManagementAuth:true,productionWrites:false,externalAgentCalls:0},null,2)+'\n');
}finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await prisma.$disconnect()}})().catch(e=>{console.error(e);process.exitCode=1});
