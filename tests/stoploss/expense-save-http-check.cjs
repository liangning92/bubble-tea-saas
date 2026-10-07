// Real expense route + JWT middleware + Prisma, fresh isolated SQLite/PG only.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process'),Module=require('node:module');
const runtime=process.env.INTENT_RUNTIME || '/tmp/pos-intent-http-runtime',deps=process.env.INTENT_DEPS || '/tmp/bubble-audit-sqlite-6_ckv58q/node_modules',provider=process.env.INTENT_PROVIDER||'sqlite';
if(!/^\/tmp\/pos-(?:intent-http-runtime(?:-[\w-]+)?|idempotency-runtime-[\w-]+)$/.test(runtime)||!['sqlite','postgresql'].includes(provider))throw Error('Owned synthetic runtime required');
process.env.NODE_PATH=deps;Module._initPaths();const ts=require('typescript'),express=require('express'),jwt=require('jsonwebtoken');const root=fs.mkdtempSync('/tmp/pos-intent-http-');let pgStarted=false,prisma,server,preview,browser;
const pgPort='55461';
(async()=>{try{
let url;if(provider==='sqlite'){url='file:'+root+'/orders.db';execFileSync('python3',['-c','import sqlite3,sys; c=sqlite3.connect(sys.argv[1]);c.executescript(open(sys.argv[2]).read());c.close()',root+'/orders.db',runtime+'/sqlite/schema.sql']);}
else{execFileSync('initdb',['-D',root+'/pg','--auth=trust','--no-locale','-E','UTF8'],{stdio:'ignore'});execFileSync('pg_ctl',['-D',root+'/pg','-l',root+'/pg.log','-o',`-h 127.0.0.1 -p ${pgPort} -k ${root}`,'-w','start'],{stdio:'ignore'});pgStarted=true;execFileSync('createdb',['-h','127.0.0.1','-p',pgPort,'pos_intent_synthetic']);execFileSync('psql',['-h','127.0.0.1','-p',pgPort,'-d','pos_intent_synthetic','-v','ON_ERROR_STOP=1','-f',runtime+'/postgresql/schema.sql'],{stdio:'ignore'});url=`postgresql://${os.userInfo().username}@127.0.0.1:${pgPort}/pos_intent_synthetic`;}
process.env.NODE_ENV='production';process.env.DATABASE_URL=url;process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');process.env.CORS_ORIGIN='http://127.0.0.1';const {PrismaClient}=require(runtime+'/'+provider+'/client');prisma=new PrismaClient({datasources:{db:{url}}});
// Redirect exactly the runtime database module. Every route/service/auth operation remains original source.
const dbFile=path.resolve('server/src/config/database.ts');require.cache[dbFile]={id:dbFile,filename:dbFile,loaded:true,exports:{__esModule:true,default:prisma,prisma}};
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);
await prisma.tenant.create({data:{id:'tenant',name:'Synthetic'}});for(const id of ['store','foreign'])await prisma.store.create({data:{id,tenantId:'tenant',name:id}});const user=await prisma.user.create({data:{id:'cashier',phone:'synthetic',password:'disabled-synthetic',role:'cashier',storeId:'store'}});await prisma.staff.create({data:{id:'staff',userId:user.id,storeId:'store',name:'Synthetic',employeeNumber:'SYNTHETIC'}});
const heldReplies=new Map();const app=express();app.use(express.json());app.use((req,res,next)=>{if(req.headers['x-synthetic-hold-response']){const end=res.end;res.end=(...args)=>{heldReplies.set(req.headers['x-synthetic-hold-response'],()=>end.apply(res,args));return res;};}if(req.headers['x-synthetic-drop-response']==='after-commit'){res.end=()=>{res.socket.destroy();return res;};}next();});app.use('/api/expenses',require(path.resolve('server/src/routes/expense.ts')).expenseRouter);server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const base='http://127.0.0.1:'+server.address().port;const token=jwt.sign({id:'cashier',phone:'synthetic',role:'cashier',storeId:'store',staffId:'staff',issuedAtMs:Date.now()+100},process.env.JWT_SECRET,{expiresIn:'5m'});const originalFetch=global.fetch;global.fetch=(input,init)=>{const u=new URL(input);if(u.origin!==base)throw Error('External HTTP forbidden');return originalFetch(input,init);};
const owner=await prisma.user.create({data:{id:'owner',phone:'owner',password:'synthetic',role:'admin',storeId:'store'}});
const ownerToken=jwt.sign({id:owner.id,role:'admin',storeId:'store',staffId:'',issuedAtMs:Date.now()+100},process.env.JWT_SECRET,{expiresIn:'5m'});
const send=(method,path,body)=>fetch(base+'/api/expenses'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+ownerToken},body:body===undefined?undefined:JSON.stringify(body)});
const payload={storeId:'foreign',type:'operational',category:'rent',amount:458000000,description:'Synthetic only',date:'2026-10-07'};
const created=await send('POST','',payload);assert.equal(created.status,201);const row=(await created.json()).data;assert.equal(row.storeId,'store');assert.equal(row.amount,458000000);assert.equal(row.date,'2026-10-06T17:00:00.000Z');
const stored=await prisma.expense.findUnique({where:{id:row.id}});assert.equal(stored.amount,458000000);assert.equal(await prisma.financeAuditLog.count(),1);
const edited=await send('PUT','/'+row.id,{amount:1600000,date:'2026-10-06'});assert.equal(edited.status,200);assert.equal((await edited.json()).data.date,'2026-10-05T17:00:00.000Z');assert.equal((await prisma.expense.findUnique({where:{id:row.id}})).amount,1600000);
for(const date of ['', '2026-02-30','invalid']) {assert.equal((await send('POST','',{...payload,date})).status,400);assert.equal((await send('PUT','/'+row.id,{date})).status,400);}
for(const amount of [0,-1,1.5,2147483648])assert.equal((await send('POST','',{...payload,amount})).status,400);
assert.equal(await prisma.expense.count(),1);assert.equal(await prisma.financeAuditLog.count(),2);
const list=await send('GET','');assert.equal(list.status,200);assert.equal((await list.json()).data.list[0].amount,1600000);
const iso=await send('POST','',{...payload,date:'2026-10-07T10:30:00.000Z'});assert.equal(iso.status,201);assert.equal((await iso.json()).data.date,'2026-10-07T10:30:00.000Z');
console.log('PASS '+provider+' real HTTP expense create/edit/list: date-only conversion, ISO compatibility, amount precision, audit logs, invalid dates/amounts rejected without writes, authenticated store binding');
const category={key:'custom_delivery',label:'Synthetic delivery fee',color:'text-blue-600',isDefault:false};
assert.equal((await send('PUT','/categories',{categories:[category]})).status,200);
const categories=await send('GET','/categories');assert.equal(categories.status,200);assert.deepEqual((await categories.json()).data.list,[category]);
assert.deepEqual(JSON.parse((await prisma.config.findUnique({where:{storeId_key:{storeId:'store',key:'expense.categories'}}})).value),[category]);
assert.equal(await prisma.expense.count(),2);assert.equal(await prisma.financeAuditLog.count(),3);
assert.equal((await send('PUT','/categories',{categories:[{...category,label:'Renamed'}]})).status,200);
assert.equal((await (await send('GET','/categories')).json()).data.list[0].label,'Renamed');
assert.equal((await send('PUT','/categories',{categories:[]})).status,200);
assert.deepEqual((await (await send('GET','/categories')).json()).data.list,[]);
console.log('PASS '+provider+' category collection PUT bypasses expense-id route: persisted create/read/rename/remove, no expense mutations');
const {expenseAmountFromInput,expenseCalendarDate}=require(path.resolve('client-admin/src/utils/expenseInput.ts'));
for(const text of ['4580000','4.580.000','4,580,000'])assert.equal(expenseAmountFromInput(text),458000000);
for(const text of ['', '0','-100','1.5','1,5','abc','999999999999'])assert.equal(expenseAmountFromInput(text),null);
assert.equal(expenseCalendarDate('2026-10-06T17:01:00Z'),'2026-10-07');assert.equal(expenseCalendarDate('2026-10-06T16:59:00Z'),'2026-10-06');assert.equal(expenseCalendarDate('2026-10-05T17:00:00Z'),'2026-10-06');
console.log('PASS expense form amount separators and Jakarta calendar boundary/edit roundtrip');
}finally{if(browser)await browser.close();if(preview)await preview.close();if(server)await new Promise(r=>server.close(r));if(prisma)await prisma.$disconnect();if(pgStarted)execFileSync('pg_ctl',['-D',root+'/pg','-m','fast','-w','stop'],{stdio:'ignore'});}})().catch(e=>{console.error(e);process.exitCode=1;});
