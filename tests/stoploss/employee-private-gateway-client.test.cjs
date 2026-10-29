const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),Module=require('node:module'),http=require('node:http')
const ts=require('../../server/node_modules/typescript')
const filename=require('node:path').resolve(__dirname,'../../server/src/services/teamAgentBridge/employeeGatewayClient.ts')
const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const mod=new Module(filename,module);mod._compile(compiled,filename)
const {createEmployeeGatewayClient}=mod.exports

test('private gateway TS client: private origin, actual HTTP admission and no automatic retry',async()=>{
  for(const origin of ['https://example.com','http://localhost:1','http://127.0.0.1:1/path','http://127.0.0.1:1/?x=1','http://user@127.0.0.1:1'])assert.throws(()=>createEmployeeGatewayClient({origin,bearer:'synthetic'}))
  let count=0,mode='ok',auth
  const id='af557155-ae58-4633-b844-3199c47be02e'
  const server=http.createServer((req,res)=>{
    count++;auth=req.headers.authorization
    if(mode==='lost'){req.socket.destroy();return}
    if(mode==='redirect'){res.writeHead(302,{location:'/unexpected'});res.end();return}
    if(req.url==='/health'){
      res.setHeader('content-type','application/json');res.end(JSON.stringify({status:'ok',protocol:'employee_work_trace_v1',maxConcurrency:mode==='old-capacity'?4:1,queued:2,running:1}));return
    }
    res.setHeader('content-type','application/json');res.end(JSON.stringify({executionId:mode==='wrong-id'?'bf557155-ae58-4633-b844-3199c47be02e':id,state:mode==='queued'?'queued':'running'}))
  })
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  try{
    const client=createEmployeeGatewayClient({origin:`http://127.0.0.1:${server.address().port}`,bearer:'synthetic-secret'})
    const envelope={ticket:{executionId:id},deadlineAt:'synthetic',callbackCredential:'synthetic-callback',providerCredential:'synthetic-provider'}
    assert.equal((await client.start(envelope)).state,'running');assert.equal(auth,'Bearer synthetic-secret')
    assert.equal((await client.get(id)).executionId,id)
    mode='queued';const beforeQueued=count
    assert.equal((await client.start(envelope)).state,'queued');assert.equal(count,beforeQueued+1)
    assert.equal((await client.get(id)).state,'queued')
    assert.equal((await client.health()).maxConcurrency,1)
    mode='old-capacity';await assert.rejects(()=>client.health(),/SINGLE_SLOT_REQUIRED/)
    for(const failure of ['lost','redirect','wrong-id']){
      mode=failure;const before=count
      assert.equal((await client.start(envelope)).state,'admission_unknown');assert.equal(count,before+1)
    }
  }finally{await new Promise(r=>server.close(r))}
})
