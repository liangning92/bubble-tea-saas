const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),{EventEmitter}=require('node:events');
function load(file,imports={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require:n=>n in imports?imports[n]:require(n),Buffer,Date,setTimeout,clearTimeout});return m.exports;}
const code=load('client-pos/electron/windowsRawCode.ts');const {WindowsRawPrinter}=load('client-pos/electron/windowsRawPrinter.ts',{'./windowsRawCode':code});
function fake(){const children=[],jobs=[];const launch=(command,args,options)=>{assert.equal(command,'powershell.exe');assert.equal(options.windowsHide,true);const script=Buffer.from(args.at(-1),'base64').toString('utf16le');assert.match(script,/while.*ReadLine/);assert.match(script,/Add-Type/);const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.write=(line,callback)=>{jobs.push({child,...JSON.parse(line)});callback?.();return true};child.kill=()=>{child.killed=true;child.emit('close',1)};children.push(child);setImmediate(()=>{child.stdout.emit('data',Buffer.from('{"rea'));child.stdout.emit('data',Buffer.from('dy":true}\r\n'))});return child};return {launch,children,jobs,reply(job,success=true){job.child.stdout.emit('data',Buffer.from(JSON.stringify({id:job.id,success})+'\r\n'))}};}
const tick=()=>new Promise(r=>setImmediate(r));
test('startup and interop compile once; Unicode job names are data and queued jobs never overlap',async()=>{const f=fake(),worker=new WindowsRawPrinter(f.launch,1000);try{await worker.warm();const first=worker.printFile("收银打印机 ' POS",'C:\\测试\\receipt.bin'),second=worker.printFile('Receipt','C:\\next.bin');await tick();assert.equal(f.children.length,1);assert.equal(f.jobs.length,1);assert.equal(f.jobs[0].printer,"收银打印机 ' POS");f.reply(f.jobs[0]);await first;await tick();assert.equal(f.jobs.length,2);f.reply(f.jobs[1]);await second;assert.equal(f.children.length,1)}finally{worker.dispose()}});
test('lost worker response rejects once and never automatically resends; a new job starts a fresh worker',async()=>{const f=fake(),worker=new WindowsRawPrinter(f.launch,1000);try{const first=worker.printFile('Receipt','one.bin');await tick();await tick();const rejected=assert.rejects(first,/delivery unconfirmed/);f.children[0].emit('close',1);await rejected;assert.equal(f.jobs.length,1);const second=worker.printFile('Receipt','two.bin');await tick();await tick();assert.equal(f.children.length,2);assert.equal(f.jobs.length,2);assert.equal(f.jobs[1].file,'two.bin');f.reply(f.jobs[1]);await second}finally{worker.dispose()}});
test('uncertain timeout kills the worker without retrying the job',async()=>{const f=fake(),worker=new WindowsRawPrinter(f.launch,30);await assert.rejects(worker.printFile('Receipt','one.bin'),/delivery unconfirmed/);assert.equal(f.jobs.length,1);assert.equal(f.children[0].killed,true);worker.dispose()});
test('failed spool reply is not reported as success and shutdown rejects future jobs',async()=>{const f=fake(),worker=new WindowsRawPrinter(f.launch,1000);const first=worker.printFile('Receipt','one.bin');await tick();await tick();f.reply(f.jobs[0],false);await assert.rejects(first,/delivery unconfirmed/);worker.dispose();await assert.rejects(worker.printFile('Receipt','two.bin'),/stopped/);assert.equal(f.jobs.length,1)});

test('synchronous launch failure clears startup state so the next explicit job can start',async()=>{const f=fake();let attempts=0;const worker=new WindowsRawPrinter((...args)=>{if(++attempts===1)throw Error('Launch failed');return f.launch(...args)},1000);await assert.rejects(worker.warm(),/Launch failed/);await worker.warm();assert.equal(attempts,2);worker.dispose()});

test('a stalled queue refusal stays not-sent, retains native details, and never resends',async()=>{
 const f=fake(),worker=new WindowsRawPrinter(f.launch,1000);
 try{
  const pending=worker.printFile('Receipt','new.bin','BTPS_RECEIPT:example:copy1');
  await tick();await tick();assert.equal(f.jobs[0].document,'BTPS_RECEIPT:example:copy1');
  const rejected=assert.rejects(pending,error=>{assert.equal(error.deliveryStatus,'not-sent');assert.match(error.message,/PRINT_QUEUE_BLOCKED/);assert.equal(error.bytesSubmitted,0);return true});
  f.jobs[0].child.stdout.emit('data',Buffer.from(JSON.stringify({id:f.jobs[0].id,success:false,deliveryStatus:'not-sent',error:'PRINT_QUEUE_BLOCKED job=94 status=8208',jobId:0,bytesSubmitted:0})+'\n'));
  await rejected;assert.equal(f.jobs.length,1);
 }finally{worker.dispose()}
});
test('a job accepted but still queued stays unconfirmed with its exact spool job ID',async()=>{
 const f=fake(),worker=new WindowsRawPrinter(f.launch,1000);
 try{
  const pending=worker.printFile('Receipt','one.bin');await tick();await tick();
  const rejected=assert.rejects(pending,error=>{assert.equal(error.deliveryStatus,'unconfirmed');assert.equal(error.jobId,94);assert.equal(error.bytesSubmitted,33783);assert.equal(error.status,8208);return true});
  f.jobs[0].child.stdout.emit('data',Buffer.from(JSON.stringify({id:f.jobs[0].id,success:false,deliveryStatus:'unconfirmed',jobId:94,bytesSubmitted:33783,status:8208,error:'PRINT_JOB_STILL_QUEUED'})+'\n'));
  await rejected;assert.equal(f.jobs.length,1);
 }finally{worker.dispose()}
});
test('completion returns exact job metadata for diagnostics without claiming physical paper',async()=>{
 const f=fake(),worker=new WindowsRawPrinter(f.launch,1000);
 try{
  const pending=worker.printFile('Receipt','one.bin');await tick();await tick();
  f.jobs[0].child.stdout.emit('data',Buffer.from(JSON.stringify({id:f.jobs[0].id,success:true,jobId:95,bytesSubmitted:33783,deliveryStatus:'spool-completed'})+'\n'));
  const result=await pending;assert.equal(result.jobId,95);assert.equal(result.bytesSubmitted,33783);assert.equal(result.deliveryStatus,'spool-completed');assert.equal(f.jobs.length,1);
 }finally{worker.dispose()}
});
