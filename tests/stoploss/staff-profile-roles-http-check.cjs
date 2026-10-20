// Owned temporary PostgreSQL fixture only; never connects to production.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('node:assert/strict'),crypto=require('crypto'),{execFileSync:exec}=require('child_process');
const root=path.resolve(__dirname,'../..'),deps=root+'/server/node_modules';const Module=require('module');process.env.NODE_PATH=deps+':'+root+'/node_modules';Module._initPaths();const ts=require('typescript'),express=require('express'),jwt=require('jsonwebtoken'),bcrypt=require('bcryptjs');const dir=fs.mkdtempSync('/tmp/staff-profile-role-fixture-'),port=55574;let pg=false,db,server;
(async()=>{try{
 exec((process.platform==='darwin'?'/usr/local/bin/initdb':'initdb'),['-D',dir+'/pg','--auth=trust','--no-locale','-E','UTF8'],{stdio:'ignore'});exec((process.platform==='darwin'?'/usr/local/bin/pg_ctl':'pg_ctl'),['-D',dir+'/pg','-l',dir+'/pg.log','-o',`-h 127.0.0.1 -p ${port} -k ${dir}`,'-w','start'],{stdio:'ignore'});pg=true;exec((process.platform==='darwin'?'/usr/local/bin/createdb':'createdb'),['-h','127.0.0.1','-p',String(port),'staff_profile_synthetic']);

 process.env.DATABASE_URL=`postgresql://${os.userInfo().username}@127.0.0.1:${port}/staff_profile_synthetic`;process.env.JWT_SECRET='synthetic-test-only-staff-access-session';process.env.NODE_ENV='test';process.env.UPLOADS_PATH=dir+'/uploads';
 exec(process.execPath,[root+'/server/node_modules/prisma/build/index.js','db','push','--schema',root+'/server/prisma/schema.prisma','--skip-generate'],{env:{...process.env},stdio:'ignore'});
 const {PrismaClient}=require(deps+'/@prisma/client');db=new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL}}});const dbFile=root+'/server/src/config/database.ts';require.cache[dbFile]={id:dbFile,filename:dbFile,loaded:true,exports:{__esModule:true,default:db,prisma:db}};
 require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText,file);

 await db.tenant.create({data:{id:'tenant',name:'Synthetic tenant'}});
 for(const id of ['store','foreign'])await db.store.create({data:{id,tenantId:'tenant',name:id}});
 for(const [id,role,storeId] of [['owner','admin','store'],['editor','manager','store'],['employee','cashier','store'],['foreign','cashier','foreign']]){
  await db.user.create({data:{id,phone:'synthetic-'+id,password:'unused-synthetic',role,storeId}});
  await db.staff.create({data:{id:id+'-staff',userId:id,storeId,name:id,position:'barista',employeeNumber:id,baseSalary:3000000,hourlyRate:0,weeklyHours:0,hireDate:new Date('2026-10-01T00:00:00Z')}});
 }
 const {defaultRolesV2}=require(root+'/server/src/services/StaffPermissionV2Core.ts');
 const policy={version:2,active:true,revision:4,roles:defaultRolesV2.map(r=>r.id==='manager'?{...r,permissions:{...r.permissions,'staff.write':'allow'}}:r),assignments:[{staffId:'editor-staff',roleId:'manager',overrides:{}},{staffId:'employee-staff',roleId:'production',overrides:{}}]};
 await db.config.create({data:{storeId:'store',key:'staff.access.policy.v2',category:'staff',value:JSON.stringify(policy)}});
 const app=express();app.use(express.json());app.use('/api',require(root+'/server/src/middlewares/auth.ts').authenticateBeforeRouting);app.use('/api/staff',require(root+'/server/src/middlewares/staffAccessV2.ts').declareAccessRoutes('/api/staff',require(root+'/server/src/routes/staff.ts').staffRouter));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
 async function call(actor,method,url,body,status=200){
  const role=actor==='owner'?'admin':'manager';const token=jwt.sign({id:actor,role,storeId:'store',staffId:actor+'-staff',issuedAtMs:Date.now()+1000},process.env.JWT_SECRET,{expiresIn:'5m'});
  const response=await fetch(origin+'/api/staff'+url,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();assert.ok((Array.isArray(status)?status:[status]).includes(response.status),JSON.stringify({status:response.status,result}));return result.data;
 }
 const before=await db.staff.findUnique({where:{id:'employee-staff'}});
 const detail=await call('owner','GET','/employee-staff');assert.equal(detail.accessRole.id,'production');assert.equal(detail.accessRoleSelection,'production');
 assert.equal((await call('owner','GET','?storeId=store')).list.find(s=>s.id==='employee-staff').accessRole.id,'production');
 await call('owner','PUT','/employee-staff',{name:'Renamed',role:'admin',roleId:'manager',accessRole:{id:'manager'}});
 const after=await db.staff.findUnique({where:{id:'employee-staff'}});
 for(const key of ['position','baseSalary','hourlyRate','weeklyHours','employmentType','hireDate','terminationDate'])assert.deepEqual(after[key],before[key],key);
 assert.equal((await db.user.findUnique({where:{id:'employee'}})).role,'cashier');
 assert.deepEqual(JSON.parse((await db.config.findUnique({where:{storeId_key:{storeId:'store',key:'staff.access.policy.v2'}}})).value),policy);
 await call('editor','GET','/employee-staff');await call('editor','GET','/foreign-staff',undefined,[403,404]);await call('editor','PUT','/foreign-staff',{name:'Denied'},[403,404]);
 await call('editor','PUT','/owner-staff',{name:'Denied'},403);
 assert.equal((await db.staff.findUnique({where:{id:'foreign-staff'}})).name,'foreign');
 assert.equal((await db.staff.findUnique({where:{id:'owner-staff'}})).name,'owner');
 console.log('PASS actual HTTP profile projection, legacy job preserved, injected role ignored, payroll fields unchanged, owner protection and cross-store read/write denial');
}finally{if(server)await new Promise(r=>server.close(r));if(db)await db.$disconnect();if(pg)exec((process.platform==='darwin'?'/usr/local/bin/pg_ctl':'pg_ctl'),['-D',dir+'/pg','-m','immediate','stop'],{stdio:'ignore'});fs.rmSync(dir,{recursive:true,force:true})}})().catch(error=>{console.error(error);process.exitCode=1});
