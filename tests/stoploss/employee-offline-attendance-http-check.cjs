// Disposable databases only. No production attendance, payroll, network providers or Docker volumes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),os=require('node:os'),{execFileSync}=require('node:child_process')
process.env.NODE_PATH=path.resolve('server/node_modules')+path.delimiter+path.resolve('node_modules');require('node:module').Module._initPaths()
const ts=require('typescript'),express=require('express'),jwt=require('jsonwebtoken')
const provider=process.env.INTENT_PROVIDER||'sqlite',root=fs.mkdtempSync('/tmp/employee-offline-attendance-test-'),realNow=Date.now
let runtime=process.env.INTENT_RUNTIME,ownedRuntime=false,db,server,pg=false,clock=realNow()-29*86400000
const port='55479'
async function run(){try{
 if(!runtime){runtime=JSON.parse(execFileSync(process.execPath,['scripts/prepare-order-receipt-runtime.cjs'],{encoding:'utf8'})).runtime;ownedRuntime=true}
 assert.match(runtime,/^\/tmp\/pos-idempotency-runtime-[\w-]+$/);assert.ok(['sqlite','postgresql'].includes(provider))
 let url
 if(provider==='sqlite'){execFileSync('python3',['-c','import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.executescript(open(sys.argv[2]).read());c.close()',root+'/test.db',runtime+'/sqlite/schema.sql']);url='file:'+root+'/test.db'}
 else{execFileSync('initdb',['-D',root+'/pg','--auth=trust','--no-locale','-E','UTF8'],{stdio:'ignore'});execFileSync('pg_ctl',['-D',root+'/pg','-l',root+'/pg.log','-o',`-h 127.0.0.1 -p ${port} -k ${root}`,'-w','start'],{stdio:'ignore'});pg=true;execFileSync('createdb',['-h','127.0.0.1','-p',port,'offline_attendance_synthetic']);execFileSync('psql',['-h','127.0.0.1','-p',port,'-d','offline_attendance_synthetic','-v','ON_ERROR_STOP=1','-f',runtime+'/postgresql/schema.sql'],{stdio:'ignore'});url=`postgresql://${os.userInfo().username}@127.0.0.1:${port}/offline_attendance_synthetic`}
 process.env.DATABASE_URL=url;process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');process.env.NODE_ENV='production';process.env.UPLOADS_PATH=root+'/uploads'
 const {PrismaClient}=require(runtime+'/'+provider+'/client');db=new PrismaClient({datasources:{db:{url}}})
 const moduleFile=path.resolve('server/src/config/database.ts');require.cache[moduleFile]={id:moduleFile,filename:moduleFile,loaded:true,exports:{__esModule:true,default:db,prisma:db}}
 require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file)
 await db.tenant.create({data:{id:'t',name:'Synthetic'}});for(const id of ['store','foreign'])await db.store.create({data:{id,tenantId:'t',name:id}})
 const tokens={}
 for(const [id,role,storeId]of [['employee','staff','store'],['other','staff','store'],['cashier','cashier','store'],['foreign','admin','foreign']]){
  await db.user.create({data:{id,role,storeId,phone:id,password:'disabled',updatedAt:new Date(clock-1000)}})
  await db.staff.create({data:{id,userId:id,storeId,name:'Synthetic '+id,employeeNumber:id,status:'active'}})
  tokens[id]=jwt.sign({id,role,storeId,staffId:id,issuedAtMs:realNow()+100},process.env.JWT_SECRET)
 }
 const app=express();app.use(express.json({limit:'1mb'}));const {declareAccessRoutes}=require(path.resolve('server/src/middlewares/staffAccessV2.ts'))
 app.use('/api/auth',declareAccessRoutes('/api/auth',require(path.resolve('server/src/routes/auth.ts')).authRouter));app.use('/api/attendance-qr',declareAccessRoutes('/api/attendance-qr',require(path.resolve('server/src/routes/attendanceQR.ts')).attendanceQRRouter))
 server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle))});const base='http://127.0.0.1:'+server.address().port+'/api'
 async function request(route,{actor,method='GET',body,employee=false}={}){const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(actor?{Authorization:'Bearer '+tokens[actor]}:{}),...(employee?{'X-Client-App':'employee'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:await response.json()}}
 Date.now=()=>clock
 assert.equal((await request('/attendance-qr/offline-prepare',{method:'POST',body:{}})).status,401)
 assert.equal((await request('/attendance-qr/offline-prepare',{method:'POST',body:{},actor:'employee',employee:true})).status,403)
 const bundle=(await request('/attendance-qr/offline-prepare',{method:'POST',body:{},actor:'cashier'}));assert.equal(bundle.status,200)
 const generated=await request('/attendance-qr/generate',{method:'POST',actor:'cashier',body:{posId:'store'}});assert.equal(generated.status,200);assert.equal(generated.body.data.expiresAt,clock+300000);assert.equal(JSON.parse(Buffer.from(generated.body.data.qrData,'base64').toString()).timestamp,clock);const rotating=await request('/attendance-qr/generate',{method:'POST',actor:'cashier',body:{posId:'store',formatVersion:2}});assert.equal(rotating.status,200);assert.equal(JSON.parse(Buffer.from(rotating.body.data.qrData,'base64').toString()).v,2);assert.equal((await request('/attendance-qr/generate',{method:'POST',actor:'employee',employee:true,body:{posId:'store'}})).status,403)
 const prep=(await request('/auth/employee-offline-attendance',{actor:'employee',employee:true}));assert.equal(prep.status,200);assert.ok(!prep.body.data.codes)
 const other=(await request('/auth/employee-offline-attendance',{actor:'other',employee:true})).body.data
 const authorization=prep.body.data.authorization,qrAt=at=>bundle.body.data.codes[String(Math.floor(at/300000)*300000)]
 const eventTime=realNow()-60000,occurredAt=new Date(eventTime).toISOString(),input={id:crypto.randomUUID(),authorization,occurredAt,type:'check_in',qrData:qrAt(eventTime)}
 clock=realNow()+2*86400000
 assert.equal((await request('/auth/employee-offline-attendance/sync',{method:'POST',body:{...input,authorization:tokens.employee}})).status,403)
 const concurrent=await Promise.all([request('/auth/employee-offline-attendance/sync',{method:'POST',body:input}),request('/auth/employee-offline-attendance/sync',{method:'POST',body:input})]);const first=concurrent[0];assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(concurrent[1].status,200,JSON.stringify(concurrent[1].body));assert.deepEqual(concurrent[1].body,first.body);const attendance=first.body.data.attendance
 assert.equal(attendance.staffId,'employee');assert.equal(Date.parse(attendance.checkInTime),eventTime)
 const replay=await request('/auth/employee-offline-attendance/sync',{method:'POST',body:input});assert.deepEqual(replay.body,first.body);assert.equal(await db.attendance.count(),1)
 const expiredCode={...input,id:crypto.randomUUID(),qrData:qrAt(eventTime-600000)};assert.equal((await request('/auth/employee-offline-attendance/sync',{method:'POST',body:expiredCode})).status,400)
 const conflict=await request('/auth/employee-offline-attendance/sync',{method:'POST',body:{...input,type:'check_out',attendanceId:attendance.id}});assert.equal(conflict.status,409)
 const foreignOut=await request('/auth/employee-offline-attendance/sync',{method:'POST',body:{...input,id:crypto.randomUUID(),authorization:other.authorization,type:'check_out',attendanceId:attendance.id}});assert.equal(foreignOut.status,409)
 assert.equal((await db.attendance.findUnique({where:{id:attendance.id}})).checkOutTime,null)
 const outTime=eventTime+3600000,out={id:crypto.randomUUID(),authorization,occurredAt:new Date(outTime).toISOString(),type:'check_out',attendanceId:attendance.id,qrData:qrAt(outTime)}
 const closed=await request('/auth/employee-offline-attendance/sync',{method:'POST',body:out});assert.equal(closed.status,200,JSON.stringify(closed.body));assert.equal(Date.parse(closed.body.data.attendance.checkOutTime),outTime)
 assert.equal((await request('/auth/employee-offline-attendance/sync',{method:'POST',body:out})).status,200);assert.equal(await db.attendance.count(),1)
 await db.user.update({where:{id:'other'},data:{updatedAt:new Date(clock)}})
 const revoked=await request('/auth/employee-offline-attendance/sync',{method:'POST',body:{...input,id:crypto.randomUUID(),authorization:other.authorization}});assert.equal(revoked.status,403)
 assert.equal(await db.config.count({where:{key:{startsWith:'employee.offline.attendance:'}}}),2)
 console.log(JSON.stringify({provider,passed:true,day30OfflineEvent:true,originalTimesPreserved:true,normalJwtCannotUpload:true,anonymousCannotPrepare:true,phoneHasHashesOnly:true,idempotentCheckInAndOut:true,foreignCheckoutRejected:true,revocationRejected:true,syntheticOnly:true}))
 }finally{
 Date.now=realNow;if(server)await new Promise(resolve=>server.close(resolve));if(db)await db.$disconnect();if(pg)execFileSync('pg_ctl',['-D',root+'/pg','-m','immediate','-w','stop'],{stdio:'ignore'});fs.rmSync(root,{recursive:true,force:true});if(ownedRuntime&&runtime?.startsWith('/tmp/pos-idempotency-runtime-'))fs.rmSync(runtime,{recursive:true,force:true})
 }}run().catch(error=>{console.error(error);process.exitCode=1})
