// A real loopback gateway can return 503 before it forwards an original request.
const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
module.exports=async function delayedGateway({configure,settings,check,budget,calls,setMode,test,origin,realFetch,tokens,root}){
 const express=require(root+'/server/node_modules/express'),observations=[];
 assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));
 for(const sameId of [false,true])await test('delayed gateway original plus '+(sameId?'same-ID replay':'different-ID race')+' invokes model only once',async()=>{
  const config=await configure();setMode('ok');await check(config.version);const before=await settings(),priorCalls=calls(),funds=await budget();
  const original={expectedVersion:before.version,expectedCheckRevision:before.checkRevision,requestId:randomUUID(),consent:true};let held,hold=true,server;
  const forward=body=>realFetch(origin+'/api/team/ai/connection-check',{method:'POST',headers:{authorization:'Bearer '+tokens.owner,'content-type':'application/json'},body:JSON.stringify(body)});
  const app=express();app.use(express.json());app.post('/check',async(req,res)=>{if(hold){hold=false;held=structuredClone(req.body);return res.status(503).json({code:503,message:'SYNTHETIC_DELAYED_GATEWAY'})}const response=await forward(req.body);return res.status(response.status).json(await response.json())});
  try{
   server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const gateway='http://127.0.0.1:'+server.address().port+'/check';
   const post=body=>realFetch(gateway,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
   assert.equal((await post(original)).status,503);assert.equal(calls(),priorCalls);assert.deepEqual(await budget(),funds);
   const stale=await settings();assert.equal(stale.connection.status,'ready');assert.notEqual(stale.connection.requestId,original.requestId);assert.equal(stale.checkRevision,original.expectedCheckRevision);
   const second={...original,requestId:sameId?original.requestId:randomUUID()},accepted=await post(second);assert.equal(accepted.status,200);const receipt=(await accepted.json()).data;assert.equal(receipt.requestId,second.requestId);assert.equal(calls(),priorCalls+1);
   const after=await budget(),late=await forward(held);assert.equal(late.status,sameId?200:409);assert.equal(calls(),priorCalls+1);assert.deepEqual(await budget(),after);
   observations.push({sameId,lateStatus:late.status,additionalModelCalls:calls()-priorCalls,newReservationFromLateRequest:0});
  }finally{if(server)await new Promise(r=>server.close(r))}
 });
 fs.mkdirSync(root+'/output/ai-settings/p2-refresh',{recursive:true});fs.writeFileSync(root+'/output/ai-settings/p2-refresh/delayed-gateway.json',JSON.stringify({run:process.env.BT_TEST_RUN,observations,realProviderRequests:0,productionWrites:false},null,2)+'\n');
};
