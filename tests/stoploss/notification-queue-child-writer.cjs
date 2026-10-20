/* Separate writer process: real transaction/outbox, no HTTP server/worker/model/Push. */
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
assert(process.send,'Use only as an IPC child of the owned queue fixture');
const url=new URL(process.env.DATABASE_URL||'http://invalid');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/notification_awareness_test');
assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));assert(process.env.UPLOADS_PATH?.includes(process.env.BT_TEST_RUN));
const root=path.resolve(__dirname,'../..');
const push=require(root+'/server/node_modules/web-push');push.generateVAPIDKeys=()=>{throw Error('CHILD_CREDENTIAL_CREATION_FORBIDDEN')};push.sendNotification=()=>{throw Error('CHILD_PUSH_FORBIDDEN')};
global.fetch=()=>{throw Error('CHILD_EXTERNAL_HTTP_FORBIDDEN')};
const {prisma:db}=require(root+'/server/dist/config/database'),{teamCommunication}=require(root+'/server/dist/services/TeamCommunicationService');
let decision;const gate=new Promise(resolve=>decision=resolve);let started=false;
process.on('message',async command=>{
 if(command?.type==='decision'){decision(command.action);return}
 if(command?.type!=='write'||started)return;started=true;
 try{
  assert(command.actor?.storeId?.startsWith('queue-store-'));assert.equal(command.actor.role,'admin');
  const facade=command.staged?{...db,$transaction:fn=>db.$transaction(async tx=>{
   const value=await fn(tx);process.send({type:'staged',message:value,stagedAt:Date.now(),pid:process.pid});
   const action=await gate;if(action==='rollback')throw Error('SYNTHETIC_ROLLBACK');assert.equal(action,'commit');return value;
  },{timeout:20000})}:db;
  const message=await teamCommunication(facade).send(command.actor,command.channelId,{requestId:randomUUID(),text:'Synthetic cross-process routine message',files:[]});
  process.send({type:'committed',message,committedAt:Date.now(),pid:process.pid});
 }catch(error){process.send({type:error.message==='SYNTHETIC_ROLLBACK'?'rolledback':'error',message:error.message,pid:process.pid});if(error.message!=='SYNTHETIC_ROLLBACK')process.exitCode=1}
 finally{await db.$disconnect();process.disconnect()}
});
