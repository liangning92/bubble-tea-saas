/* Interactive acceptance on disposable accounts and an isolated PostgreSQL only. */
const assert=require('node:assert/strict'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..'), express=require(root+'/server/node_modules/express'), bcrypt=require(root+'/server/node_modules/bcryptjs');
const {prisma}=require(root+'/server/dist/config/database');
const {authenticateBeforeRouting}=require(root+'/server/dist/middlewares/auth');
const {declareAccessRoutes}=require(root+'/server/dist/middlewares/staffAccessV2');
const {teamCommunication}=require(root+'/server/dist/services/TeamCommunicationService');
const {teamOperations}=require(root+'/server/dist/services/TeamOperationsService');
const {teamAi}=require(root+'/server/dist/services/TeamAiService');
const db=new URL(process.env.DATABASE_URL);assert.equal(db.pathname,'/team_test');assert.equal(db.hostname,'127.0.0.1');
assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));assert(process.env.UPLOADS_PATH?.includes(process.env.BT_TEST_RUN));
global.fetch=async(url)=>{assert.equal(url,'https://api.minimax.io/v1/chat/completions','All real outbound calls are disabled in this fixture');return new Response(JSON.stringify({id:'mock-ui-only',choices:[{finish_reason:'stop',message:{content:'Mohon periksa mesin uji dan kirim hasil sesuai tugas yang disetujui.'}}],usage:{prompt_tokens:100,completion_tokens:20}}));};
async function main(){
 const tenant=await prisma.tenant.create({data:{name:'ISOLATED operations UI'}});
 await prisma.store.create({data:{id:'ops-ui-store',tenantId:tenant.id,name:'ISOLATED operations store'}});
 const password=await bcrypt.hash('team-test-only-2026',4);
 for(const [id,phone,role,name] of [['owner','08000000001','admin','Synthetic Owner'],['bob','08000000003','staff','Synthetic Bob']])await prisma.user.create({data:{id:'u-'+id,phone,password,role,storeId:'ops-ui-store',staff:{create:{id:'s-'+id,storeId:'ops-ui-store',name,employeeNumber:'OPS-'+id}}}});
 const actor={id:'u-owner',staffId:'s-owner',storeId:'ops-ui-store',role:'admin'};
 const team=teamCommunication(prisma), c=await team.create(actor,{requestId:randomUUID(),title:'ISOLATED · Operations acceptance',kind:'group',members:['s-bob']});
 await team.send(actor,c.id,{requestId:randomUUID(),text:'Synthetic fixture only. No production employees or business data.'});
 await teamAi(prisma).saveSettings(actor,{expectedVersion:0,provider:'minimax',model:'MiniMax-M3',enabled:true,monthlyBudgetUsd:null,inputPerMillionUsd:0.3,outputPerMillionUsd:1.2,apiKey:'synthetic-ui-key-only'});
 await teamOperations(prisma).import(actor,c.id,{requestId:randomUUID(),expectedVersion:0,content:{schema:'team.operations.plan.v1',title:'Synthetic inspection plan',objective:'Inspect an isolated machine; no business-data actions.',reviewerId:'s-owner',items:[{key:'machine',text:'Periksa mesin uji dan kirim hasil pemeriksaan.',ownerId:'s-bob',acceptByAt:new Date(Date.now()-7200000).toISOString(),deadlineAt:new Date(Date.now()-3600000).toISOString(),evidenceRequired:'Pesan hasil dari pelaksana.',acceptanceCriteria:'Atasan memeriksa hasil dan memberi keputusan.'}]}});
 const app=express();app.use(express.json({limit:'256kb'}));
 for(const [base,moduleName,exportName] of [
  ['/api/auth','auth','authRouter'],['/api/team','teamCommunication','teamCommunicationRouter'],['/api/staff-work','employeeWorkspace','employeeWorkspaceRouter'],['/api/staff-permissions','staffPermissions','staffPermissionsRouter'],['/api/config','config','configRouter']]){
  const router=require(root+'/server/dist/routes/'+moduleName)[exportName];
  if(base==='/api/auth')app.use(base,declareAccessRoutes(base,router));else app.use(base,authenticateBeforeRouting,declareAccessRoutes(base,router));
 }
 app.use('/api',(_req,res)=>res.status(404).json({code:404,message:'ISOLATED_ENDPOINT_NOT_MOUNTED'}));
 const dist=req=>path.join(root,req.headers.host?.startsWith('localhost:')?'client-admin/dist':'client-staff/dist');
 app.use((req,res,next)=>express.static(dist(req))(req,res,next));app.get('*',(req,res)=>res.sendFile(path.join(dist(req),'index.html')));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 console.log('ISOLATED_ADMIN_URL http://localhost:'+server.address().port+'/staff/communication');
 console.log('ISOLATED_STAFF_URL http://127.0.0.1:'+server.address().port+'/team');
 console.log('Synthetic accounts owner 08000000001; bob 08000000003; password team-test-only-2026. Model mocked; type stop to clean up.');
 try{await new Promise(resolve=>{const reader=require('node:readline').createInterface({input:process.stdin});reader.on('line',line=>{if(line==='stop'){reader.close();resolve();}});});}
 finally{await new Promise(r=>server.close(r));await prisma.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
