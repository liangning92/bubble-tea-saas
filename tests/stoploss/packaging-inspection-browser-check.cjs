/* Synthetic component fixture; no application session, production data or AI transport. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),express=require(root+'/server/node_modules/express');
const {chromium}=require(root+'/node_modules/playwright'),esbuild=require(root+'/node_modules/esbuild');
const tasksSource=require.resolve('../../shared/TeamTasks.tsx'),plansSource=require.resolve('../../shared/TeamOperations.tsx');
const out=root+'/output/packaging-inspection/browser';fs.mkdirSync(out,{recursive:true});
const entry=out+'/fixture.tsx';
fs.writeFileSync(entry,`import React,{useMemo,useState} from 'react';import{createRoot}from'react-dom/client';
import{TeamOperations}from'${plansSource}';import{TeamTasks}from'${tasksSource}';
const q=new URLSearchParams(location.search),role=q.get('role')||'alice',language=q.get('lang')||'id',enabled=q.get('inspection')!=='0';
const channelId='00000000-0000-4000-8000-000000000001',now=new Date();
const snapshot={capturedAt:now.toISOString(),timezone:'Asia/Jakarta',businessDate:'2026-10-20',items:[{inventoryId:'synthetic-cup',name:'Synthetic packaging cup with a deliberately long descriptive name for responsive verification',unit:'pcs',quantity:20,minStock:30,safetyStock:40,lastValidCount:null,pendingArrivals:[{quantity:8,expectedAt:null}],quality:['no_valid_count','below_threshold','arrival_date_unknown','bulk_issue_usage_not_daily_consumption']}]};
const initial={id:'00000000-0000-4000-8000-000000000002',text:'Periksa persediaan fisik kemasan; semua hasil masih menunggu verifikasi manusia.',ownerId:'alice',dueDate:'2026-10-21',fromSeq:1,sourceSeq:[],minuteVersion:1,status:'accepted',version:2,events:[],planId:'00000000-0000-4000-8000-000000000003',planRevision:1,reviewerId:'owner',acceptByAt:now.toISOString(),deadlineAt:now.toISOString(),evidenceRequired:'Stok opname terkait dan bukti.',acceptanceCriteria:'Human verification required.',...(enabled?{inspectionId:'synthetic-inspection'}:{})};
const plan={id:initial.planId,version:1,revision:1,status:'draft',...(enabled?{inspectionId:'synthetic-inspection',inspectionSnapshot:snapshot}:{}),content:{schema:'team.operations.plan.v1',title:'Synthetic packaging inspection',objective:'AI draft; physical count is unverified.',reviewerId:'owner',items:[{key:'packaging-count',text:initial.text,ownerId:'alice',acceptByAt:now.toISOString(),deadlineAt:now.toISOString(),evidenceRequired:initial.evidenceRequired,acceptanceCriteria:initial.acceptanceCriteria}]}};
if(q.get('archived')==='1'){Object.assign(plan,{status:'published',inspectionArchived:true});Object.assign(initial,{status:'completed',inventoryCountId:'synthetic-linked-count'})}
window.fixtureCalls=[];function App(){const[tasks,setTasks]=useState([initial]);const client=useMemo(()=>({current:()=>true,request:async(method,url,data)=>{window.fixtureCalls.push({method,url,data});if(url.includes('/ai/'))throw Error('MODEL_FORBIDDEN');if(method==='get'&&url.endsWith('/operations'))return[plan];if(method==='post'&&url.endsWith('/inspection-count')){setTasks(t=>t.map(x=>({...x,inventoryCountId:'synthetic-linked-count',version:3})));return{countId:'synthetic-linked-count'}}throw Error('UNEXPECTED_FIXTURE_REQUEST')},upload:async()=>{throw Error('UPLOAD_FORBIDDEN')},download:async()=>{throw Error('DOWNLOAD_FORBIDDEN')}}),[]);return <main className="mx-auto max-w-4xl space-y-4 p-4"><h1 className="text-xl font-bold">Synthetic packaging inspection fixture</h1>{role==='owner'&&<TeamOperations client={client} channelId={channelId} scope="synthetic" staffId={role} language={language} directory={[{id:'owner',name:'Synthetic reviewer'},{id:'alice',name:'Synthetic assignee'}]} tasks={tasks} onChanged={()=>{}}/>}<TeamTasks tasks={tasks} client={client} channelId={channelId} staffId={role} language={language} name={id=>id} canManage={role==='owner'} readOnly={false} messages={[]} onChanged={()=>{}}/></main>};createRoot(document.getElementById('root')).render(<App/>);`);
const app=express();let browser,server;
(async()=>{
 await esbuild.build({entryPoints:[entry],bundle:true,outfile:out+'/fixture.js',platform:'browser',format:'iife',jsx:'automatic',logLevel:'silent'});
 const css=(fs.readFileSync(root+'/client-admin/dist/index.html','utf8').match(/href="([^\"]+\.css)"/)||[])[1];assert(css,'Build admin CSS before browser fixture');
 app.use('/assets',express.static(root+'/client-admin/dist/assets'));app.get('/fixture.js',(_req,res)=>res.sendFile(out+'/fixture.js'));
 app.get('*',(_req,res)=>res.type('html').send('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="'+css+'"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/*',route=>{assert.equal(new URL(route.request().url()).hostname,'127.0.0.1');return route.continue()});
 const checks=[];
 for(const [width,height] of [[390,844],[768,1024],[1365,900]]){
  await page.setViewportSize({width,height});
  await page.goto(base+'/?role=owner&lang=zh&inspection=0');await page.getByTestId('team-operations').locator('summary').first().click();
  await page.screenshot({path:out+'/before-owner-'+width+'.png',fullPage:true});
  await page.goto(base+'/?role=owner&lang=zh');await page.getByTestId('team-operations').locator('summary').first().click();
  await page.getByTestId('inspection-snapshot').waitFor();assert(await page.getByText('20 pcs',{exact:false}).count());
  assert.equal(await page.getByRole('button',{name:'修订',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'创建关联盘点',exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:out+'/after-owner-'+width+'.png',fullPage:true});
  await page.goto(base+'/?role=alice&lang=id');const start=page.getByRole('button',{name:'Buat stok opname terkait',exact:true});await start.click();
  const link=page.getByRole('link',{name:/Buka stok opname terkait/});await link.waitFor();assert.equal(await link.getAttribute('href'),'/inventory/count?countId=synthetic-linked-count');
  const calls=await page.evaluate(()=>window.fixtureCalls);assert.equal(calls.filter(c=>c.method==='post').length,1);assert(calls[0].data.requestId);assert.equal(calls[0].data.expectedVersion,2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:out+'/after-assignee-'+width+'.png',fullPage:true});
  await page.goto(base+'/?role=bob&lang=en');await page.getByTestId('team-tasks').waitFor();assert.equal(await page.getByRole('button',{name:'Create linked count',exact:true}).count(),0);
  await page.goto(base+'/?role=owner&lang=zh&archived=1');await page.getByTestId('team-operations').locator('summary').first().click();
  await page.getByText('已归档的巡检记录，只读保留。',{exact:true}).waitFor();assert.equal(await page.getByText('发布 / 暂停 / 恢复说明',{exact:true}).count(),0);
  await page.screenshot({path:out+'/archived-owner-'+width+'.png',fullPage:true});
  checks.push({width,ownerSnapshot:true,assigneeLink:true,otherStaffCannotCreate:true,noOverflow:true});console.log('PASS inspection snapshot and count link UI at',width);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/results.json',JSON.stringify({syntheticOnly:true,realModelCalls:0,checks},null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));for(const file of [entry,out+'/fixture.js'])if(fs.existsSync(file))fs.unlinkSync(file)});
