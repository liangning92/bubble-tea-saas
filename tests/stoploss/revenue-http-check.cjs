// Actual Express revenue router, RevenueService, JWT/auth and Prisma queries.
// Fresh owned /tmp SQLite equivalent of current PostgreSQL schema; never production.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
process.env.NODE_PATH=path.resolve('server/node_modules')+path.delimiter+path.resolve('node_modules');require('node:module').Module._initPaths();
const ts=require('typescript'),express=require('express'),jwt=require('jsonwebtoken');
const root=fs.mkdtempSync('/tmp/revenue-http-'),runtime='/tmp/pos-intent-http-runtime/sqlite';let prisma,http;
(async()=>{try{
 const original=fs.readFileSync('server/prisma/schema.prisma','utf8'),equivalent=fs.readFileSync(runtime+'/schema.prisma','utf8');assert.equal(equivalent,original.replace('binaryTargets = ["native", "windows"]','output = "/tmp/pos-intent-http-runtime/sqlite/client"\n  binaryTargets = ["native"]').replace('provider = "postgresql"','provider = "sqlite"'),'Existing isolated schema must match current tracked model');
 assert.ok(!fs.existsSync(root+'/synthetic.db'));execFileSync('python3',['-c','import sqlite3,sys; c=sqlite3.connect(sys.argv[1]);c.executescript(open(sys.argv[2]).read());c.close()',root+'/synthetic.db',runtime+'/schema.sql']);
 process.env.NODE_ENV='production';process.env.TZ=process.env.REVENUE_TEST_TZ||'UTC';process.env.DATABASE_URL='file:'+root+'/synthetic.db';process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');process.env.CORS_ORIGIN='http://127.0.0.1';
 const {PrismaClient}=require(runtime+'/client');prisma=new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL}}});const dbFile=path.resolve('server/src/config/database.ts');require.cache[dbFile]={id:dbFile,filename:dbFile,loaded:true,exports:{__esModule:true,default:prisma,prisma}};
 require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);
 await prisma.tenant.create({data:{id:'synthetic',name:'Synthetic'}});for(const id of ['own','foreign'])await prisma.store.create({data:{id,tenantId:'synthetic',name:id}});
 const tokens={};for(const role of ['manager','cashier','admin']){const user=await prisma.user.create({data:{id:role,role,storeId:'own',phone:'synthetic-'+role,password:'disabled-synthetic'}});tokens[role]=jwt.sign({id:user.id,phone:user.phone,role,storeId:'own',staffId:'',issuedAtMs:Date.now()+1000},process.env.JWT_SECRET,{expiresIn:'1h'});}
 const seed=async(id,at,amount,storeId='own',status='completed')=>prisma.order.create({data:{id,storeId,staffId:'synthetic',orderNumber:id,totalAmount:amount,finalAmount:amount,paymentMethod:'cash',createdAt:new Date(at),status}});
 const seedEdges=async(prefix,start,end)=>{for(const [suffix,time,amount] of [['before',Date.parse(start)-1,100],['start',Date.parse(start),200],['end',Date.parse(end),300],['after',Date.parse(end)+1,400]])await seed(prefix+'-'+suffix,time,amount,'own',suffix==='end'?'paid':'completed');await seed(prefix+'-foreign',start,999999,'foreign');await seed(prefix+'-pending',start,888888,'own','pending');};
 const app=express();app.use(express.json());app.use('/api/revenue',require(path.resolve('server/src/routes/revenue.ts')).revenueRouter);http=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});const origin='http://127.0.0.1:'+http.address().port;
 const get=async(endpoint,params={},role='manager')=>{const response=await fetch(origin+'/api/revenue/'+endpoint+'?'+(()=>{const query=new URLSearchParams();for(const [key,value] of Object.entries(params))for(const entry of Array.isArray(value)?value:[value])query.append(key,entry);return query})(),{headers:role?{Authorization:'Bearer '+tokens[role]}:{}});return {status:response.status,body:await response.json()};};
 const evidence={timezone:process.env.TZ,syntheticDb:root+'/synthetic.db',checks:[]};
 const verifyRange=async(name,startDate,endDate,start,end)=>{await seedEdges(name,start,end);const params={period:'custom',startDate,endDate,storeId:'own'};const detail=await get('by-channel',params),summary=await get('summary',params),daily=await get('daily',{startDate,endDate});assert.equal(detail.status,200);assert.deepEqual(detail.body.data,[{channel:'POS',revenue:500,orders:2,avgOrderValue:250}]);assert.equal(summary.status,200);assert.deepEqual(summary.body.data.current,{revenue:500,orders:2,avgOrderValue:250});assert.equal(daily.status,200);assert.equal(daily.body.data.reduce((sum,row)=>sum+row.revenue,0),500);evidence.checks.push({name,startDate,endDate,start,end,detail,summary,daily});console.log('PASS actual HTTP '+process.env.TZ+' '+name+': ±1ms, inclusive endpoints, table/summary parity, foreign/pending excluded');};
 await verifyRange('business-day','2026-10-07','2026-10-07','2026-10-06T17:00:00.000Z','2026-10-07T16:59:59.999Z');assert.deepEqual(evidence.checks[0].daily.body.data.map(row=>row.date),['2026-10-07']);
 await verifyRange('cross-month','2026-09-30','2026-10-01','2026-09-29T17:00:00.000Z','2026-10-01T16:59:59.999Z');assert.deepEqual(evidence.checks[1].daily.body.data.map(row=>row.date),['2026-09-30','2026-10-01']);
 // Separate exact historical instants so previous fixtures cannot enter this tiny interval.
 await verifyRange('explicit-offset','2026-08-07T10:12:13.001+07:00','2026-08-07T10:12:13.999+07:00','2026-08-07T03:12:13.001Z','2026-08-07T03:12:13.999Z');
 // Review regression: explicit comparison bounds, including month-end clamp collisions.
 const comparisonCases=[
  ['common-February','2026-03-30T20:00:00.001+07:00','2026-03-31T10:00:00.999+07:00','2026-02-27T13:00:00.001Z','2026-02-28T03:00:00.999Z',true],
  ['leap-February','2024-03-30T20:00:00.001+07:00','2024-03-31T10:00:00.999+07:00','2024-02-28T13:00:00.001Z','2024-02-29T03:00:00.999Z',true],
  ['two-milliseconds','2025-03-30T23:59:59.999+07:00','2025-03-31T00:00:00.001+07:00','2025-02-27T16:59:59.999Z','2025-02-27T17:00:00.001Z',true],
  ['equal-clock','2023-03-30T10:00:00.123+07:00','2023-03-31T10:00:00.123+07:00','2023-02-27T03:00:00.123Z','2023-02-28T03:00:00.123Z',true],
  ['normal-clamp','2022-03-31','2022-03-31','2022-02-27T17:00:00.000Z','2022-02-28T16:59:59.999Z',false],
 ];
 for(const [name,startDate,endDate,start,end,adjusted] of comparisonCases){
  await seedEdges('previous-'+name,start,end);
  const currentAt=/T/.test(startDate)?new Date(startDate):new Date('2022-03-30T17:00:00.000Z');await seed('current-'+name,currentAt,250);
  const response=await get('summary',{period:'custom',startDate,endDate});assert.equal(response.status,200);assert.deepEqual(response.body.data.current,{revenue:250,orders:1,avgOrderValue:250});assert.deepEqual(response.body.data.previous,{revenue:500,orders:2,avgOrderValue:250});assert.equal(response.body.data.revenueChange,-50);assert.deepEqual(response.body.data.comparisonRange,{startDate:start,endDate:end,adjusted});
  if(adjusted)assert.equal(Date.parse(end)-Date.parse(start),Date.parse(endDate)-Date.parse(startDate));
  evidence.checks.push({name,response});console.log('PASS actual HTTP '+process.env.TZ+' comparison '+name+': explicit ordered bounds, same precision/duration on collision, previous edge±1ms and scope');
 }
 // Reproduce the exact reviewer fixture in its own authenticated synthetic store.
 await prisma.store.create({data:{id:'review-only',tenantId:'synthetic',name:'Review only'}});
 const reviewUser=await prisma.user.create({data:{id:'review-manager',role:'manager',storeId:'review-only',phone:'synthetic-review',password:'disabled-synthetic'}});
 tokens['review-manager']=jwt.sign({id:reviewUser.id,phone:reviewUser.phone,role:'manager',storeId:'review-only',staffId:'',issuedAtMs:Date.now()+1000},process.env.JWT_SECRET,{expiresIn:'1h'});
 await seed('review-current','2026-03-30T21:00:00+07:00',100,'review-only');await seed('review-outside-previous','2026-02-28T15:00:00+07:00',200,'review-only');
 const reviewParams={period:'custom',startDate:'2026-03-30T20:00:00+07:00',endDate:'2026-03-31T10:00:00+07:00',storeId:'review-only'};
 const reviewer=await get('summary',reviewParams,'review-manager');assert.equal(reviewer.status,200);assert.equal(reviewer.body.data.current.revenue,100);assert.equal(reviewer.body.data.previous.revenue,0);assert.deepEqual(reviewer.body.data.comparisonRange,{startDate:'2026-02-27T13:00:00.000Z',endDate:'2026-02-28T03:00:00.000Z',adjusted:true});
 // 15:00 lies after this precise 10:00 end, so zero is now legitimate and auditable.
 // An actual order inside that ordered interval produces the original -50% formula.
 await seed('review-inside-previous','2026-02-28T05:00:00+07:00',200,'review-only');const withInside=await get('summary',reviewParams,'review-manager');assert.equal(withInside.status,200);assert.equal(withInside.body.data.current.revenue,100);assert.equal(withInside.body.data.previous.revenue,200);assert.equal(withInside.body.data.revenueChange,-50);
 evidence.checks.push({name:'exact-reviewer-fixture-auditable-range',withoutInside:reviewer,withInside});console.log('PASS actual HTTP '+process.env.TZ+' exact reviewer fixture: zero only for auditable outside-range order; inside-range200 gives -50%');
 for(const endpoint of ['by-channel','summary']){
  for(const period of [undefined,'today','week','month'])for(const dates of [{startDate:'bad',endDate:'2026-10-07'},{startDate:'2026-02-30',endDate:'2026-10-07'},{startDate:['bad','worse'],endDate:'2026-10-07'},{startDate:'2026-10-09',endDate:'2026-10-07'},{startDate:'2026-10-07',endDate:'2026-10-07'},{endDate:'2026-10-07'}]){
   const params={...dates};if(period!==undefined)params.period=period;const response=await get(endpoint,params);assert.equal(response.status,400,'Validate every supplied date and reject conflicting fixed/default selection');
  }
 }
 console.log('PASS actual HTTP '+process.env.TZ+' all supplied dates: invalid, repeated, reverse and valid fixed/default conflicts reject400');
 for(const endpoint of ['by-channel','summary','daily']){
  for(const invalid of [{startDate:'bad',endDate:'2026-10-07'},{startDate:'2026-02-30',endDate:'2026-10-07'},{startDate:'2026-10-08',endDate:'2026-10-07'},{startDate:'2026-10-07T10:00:00',endDate:'2026-10-07'}])assert.equal((await get(endpoint,{period:'custom',...invalid})).status,400,endpoint+' rejects invalid dates');
  assert.equal((await get(endpoint,{period:'custom',startDate:'2026-10-07',endDate:'2026-10-07',storeId:'foreign'})).status,403);
  assert.equal((await get(endpoint,{},'cashier')).status,403);assert.equal((await get(endpoint,{},null)).status,401);
  const admin=await get(endpoint,{period:'custom',startDate:'2026-10-07',endDate:'2026-10-07',storeId:'foreign'},'admin');assert.equal(admin.status,200);const amount=endpoint==='summary'?admin.body.data.current.revenue:admin.body.data.reduce((sum,row)=>sum+row.revenue,0);assert.equal(amount,500,'Admin result stays authenticated store under existing endpoint semantics');
 }
 for(const endpoint of ['by-channel','summary'])for(const params of [{period:'custom'},{period:'custom',startDate:'2026-10-07'},{period:'custom',endDate:'2026-10-07'},{period:'custom',startDate:['2026-10-07','2026-10-08'],endDate:'2026-10-09'},{period:'wrong'}])assert.equal((await get(endpoint,params)).status,400);
 const emptyParams={period:'custom',startDate:'2026-06-07',endDate:'2026-06-07'};assert.deepEqual((await get('by-channel',emptyParams)).body.data,[]);assert.deepEqual((await get('summary',emptyParams)).body.data.current,{revenue:0,orders:0,avgOrderValue:0});
 console.log('PASS actual HTTP '+process.env.TZ+' input400/auth401/role403/manager foreign403 and admin auth-store filtering');
 for(const endpoint of ['by-channel','summary','daily'])assert.equal((await get(endpoint)).status,200);for(const params of [{startDate:'2026-10-01'},{endDate:'2026-10-07'}])assert.equal((await get('daily',params)).status,200);console.log('PASS actual HTTP '+process.env.TZ+' missing-period defaults and optional daily dates');
 fs.writeFileSync(root+'/evidence.json',JSON.stringify(evidence,null,2));console.log('Evidence: '+root+'/evidence.json');
 }finally{if(http)await new Promise(resolve=>http.close(resolve));if(prisma)await prisma.$disconnect();}
})().catch(error=>{console.error(error);process.exitCode=1;});
