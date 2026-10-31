// Owned temporary PostgreSQL fixture only; never connects to production.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('node:assert/strict'),crypto=require('crypto'),{execFileSync:exec}=require('child_process');
const root=path.resolve(__dirname,'../..'),deps=root+'/server/node_modules';const Module=require('module');process.env.NODE_PATH=deps+':'+root+'/node_modules';Module._initPaths();const ts=require('typescript'),express=require('express'),jwt=require('jsonwebtoken'),bcrypt=require('bcryptjs');const dir=fs.mkdtempSync('/tmp/pos-log-permission-fixture-'),port=55579;let pg=false,db,server;
(async()=>{try{
 exec((process.platform==='darwin'?'/usr/local/bin/initdb':'initdb'),['-D',dir+'/pg','--auth=trust','--no-locale','-E','UTF8'],{stdio:'ignore'});exec((process.platform==='darwin'?'/usr/local/bin/pg_ctl':'pg_ctl'),['-D',dir+'/pg','-l',dir+'/pg.log','-o',`-h 127.0.0.1 -p ${port} -k ${dir}`,'-w','start'],{stdio:'ignore'});pg=true;exec((process.platform==='darwin'?'/usr/local/bin/createdb':'createdb'),['-h','127.0.0.1','-p',String(port),'staff_access_synthetic']);

 process.env.DATABASE_URL=`postgresql://${os.userInfo().username}@127.0.0.1:${port}/staff_access_synthetic`;process.env.JWT_SECRET='synthetic-test-only-staff-access-session';process.env.NODE_ENV='test';process.env.UPLOADS_PATH=dir+'/uploads';
 exec(process.execPath,[root+'/server/node_modules/prisma/build/index.js','db','push','--schema',root+'/server/prisma/schema.prisma','--skip-generate'],{env:{...process.env},stdio:'ignore'});
 const {PrismaClient}=require(deps+'/@prisma/client');db=new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL}}});const dbFile=root+'/server/src/config/database.ts';require.cache[dbFile]={id:dbFile,filename:dbFile,loaded:true,exports:{__esModule:true,default:db,prisma:db}};
 require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText,file);
 await db.tenant.create({data:{id:'tenant',name:'Synthetic tenant'}});for(const id of ['store','foreign'])await db.store.create({data:{id,tenantId:'tenant',name:id}});
 const password=await bcrypt.hash('SyntheticPassword2026',4);for(const [id,role] of [['owner','admin'],['manager','staff'],['cashier','cashier'],['production','staff'],['inventory','staff'],['finance','staff'],['basic','staff'],['foreign','staff']]){await db.user.create({data:{id,phone:'synthetic-'+id,password,role,storeId:id==='owner'?null:id==='foreign'?'foreign':'store'}});if(id!=='owner')await db.staff.create({data:{id:id+'-staff',userId:id,storeId:id==='foreign'?'foreign':'store',name:'Synthetic '+id,employeeNumber:'SYN-'+id,baseSalary:3000000,bankAccount:'PRIVATE',bankName:'PRIVATE',address:'PRIVATE',hireDate:new Date('2026-10-01T00:00:00+07:00')}})}
 const app=express();app.use(express.json());
 const {declareAccessRoutes}=require(root+'/server/src/middlewares/staffAccessV2.ts');
 app.use('/api',require(root+'/server/src/middlewares/auth.ts').authenticateBeforeRouting);
 for(const [prefix,file,name] of [['staff-permissions','staffPermissions','staffPermissionsRouter'],['pos-action-logs','posActionLog','posActionLogRouter']])app.use('/api/'+prefix,declareAccessRoutes('/api/'+prefix,require(root+'/server/src/routes/'+file+'.ts')[name]));
 app.use((e,_req,res,_next)=>res.status(500).json({message:e.message}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
 const token=id=>jwt.sign({id,phone:'synthetic-'+id,role:id==='owner'?'admin':id==='cashier'?'cashier':'staff',storeId:id==='owner'?'':id==='foreign'?'foreign':'store',staffId:id==='owner'?'':id+'-staff',issuedAtMs:Date.now()+1000},process.env.JWT_SECRET,{expiresIn:'20m'});
 const call=async(id,method,url,body,status=200)=>{const r=await fetch(origin+'/api/'+url,{method,headers:{...(id?{authorization:'Bearer '+token(id)}:{}),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,status,method+' '+url+' '+JSON.stringify(data));return data.data};
 const log={action:'checkout_failed',sessionId:'synthetic-pos-session',description:'Synthetic quote verification failed',metadata:{failureCode:'ETIMEDOUT',phase:'price_verification'},severity:'warning'};
 await call(null,'POST','pos-action-logs',log,401);
 const legacy=await call('cashier','POST','pos-action-logs',{...log,staffId:'foreign-staff',staffName:'Forged name'},201);
 assert.equal(legacy.storeId,'store');assert.equal(legacy.staffId,'cashier-staff');assert.equal(legacy.staffName,'Synthetic cashier');
 for(const path of ['pos-action-logs','pos-action-logs/stats','pos-action-logs/sessions','pos-action-logs/risks?startDate=2026-10-01&endDate=2026-10-31'])await call('cashier','GET',path,undefined,403);
 const state=await call('owner','GET','staff-permissions?version=2&storeId=store');
 const policy={version:2,revision:0,roles:state.roles,assignments:['manager','cashier','basic'].map(id=>({staffId:id+'-staff',roleId:id,overrides:{}}))};
 const preview=await call('owner','POST','staff-permissions/preview?storeId=store',policy);
 await call('owner','POST','staff-permissions/activate?storeId=store',{...policy,hash:preview.hash});
 const v2=await call('cashier','POST','pos-action-logs',log,201);assert.equal(v2.storeId,'store');assert.equal(v2.staffId,'cashier-staff');
 await call('basic','POST','pos-action-logs',log,403);
 await call('cashier','POST','pos-action-logs',{...log,storeId:'foreign'},403);
 for(const path of ['pos-action-logs','pos-action-logs/stats','pos-action-logs/sessions'])await call('cashier','GET',path,undefined,403);
 const foreign=await call('foreign','POST','pos-action-logs',log,201);assert.equal(foreign.storeId,'foreign');
 assert.equal(await db.pOSActionLog.count({where:{storeId:'store'}}),2);
 assert.equal(await db.pOSActionLog.count({where:{storeId:'foreign'}}),1);
 console.log('PASS actual authentication + route declarations + PostgreSQL: legacy/V2 cashier upload; anonymous/restricted denied; actor/store bound; all log reads still denied; clean temporary database');
}finally{if(server)await new Promise(r=>server.close(r));if(db)await db.$disconnect();if(pg)exec((process.platform==='darwin'?'/usr/local/bin/pg_ctl':'pg_ctl'),['-D',dir+'/pg','-m','immediate','stop'],{stdio:'ignore'});fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exit(1)})
