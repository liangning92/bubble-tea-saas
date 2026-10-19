const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const crypto=require('node:crypto'),{Readable}=require('node:stream'),ts=require('typescript');
const busboy=require('../../server/node_modules/busboy');
const source=fs.readFileSync('client-staff/src/utils/privateUpload.ts','utf8');
const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const sandbox={exports:{},Blob,crypto:crypto.webcrypto,setTimeout,clearTimeout};vm.runInNewContext(output,sandbox);
const {privateUploadBody}=sandbox.exports, requestId=crypto.randomUUID()+':0';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
function parse(body,type){return new Promise((resolve,reject)=>{const parser=busboy({headers:{'content-type':type}}),fields={},files=[];
 parser.on('field',(name,value)=>fields[name]=value);parser.on('file',(name,stream,info)=>{const chunks=[];stream.on('data',data=>chunks.push(data));stream.on('error',reject);stream.on('end',()=>files.push({name,...info,bytes:Buffer.concat(chunks)}))});
 parser.on('error',reject);parser.on('close',()=>resolve({fields,files}));Readable.from([body]).pipe(parser);
})}
test('queued private file becomes a complete multipart body with unchanged bytes and request identity',async()=>{
 const file=new File([png],'private-name.png',{type:'image/png'}),body=await privateUploadBody(file,'team',requestId),data=Buffer.from(await body.arrayBuffer());
 const result=await parse(data,body.type);assert.deepEqual(result.fields,{purpose:'team',uploadRequestId:requestId});assert.equal(result.files.length,1);
 assert.equal(result.files[0].name,'file');assert.equal(result.files[0].filename,'attachment');assert.equal(result.files[0].mimeType,'image/png');assert.deepEqual(result.files[0].bytes,png);
 assert.equal(file.name,'private-name.png');assert.deepEqual(Buffer.from(await file.arrayBuffer()),png);assert(!data.includes(Buffer.from('private-name.png')));
 const boundary=body.type.split('boundary=')[1];assert(data.subarray(-Buffer.byteLength(`\r\n--${boundary}--\r\n`)).equals(Buffer.from(`\r\n--${boundary}--\r\n`)));
});
test('8MiB file and multipart overhead stay below existing 9MiB Staff proxy envelope',async()=>{
 const bytes=Buffer.alloc(8*1024*1024);png.copy(bytes);const body=await privateUploadBody(new File([bytes],'max.png',{type:'image/png'}),'team',requestId);
 assert(body.size>bytes.length&&body.size<9*1024*1024);assert.deepEqual((await parse(Buffer.from(await body.arrayBuffer()),body.type)).files[0].bytes,bytes);
 await assert.rejects(privateUploadBody(new File([Buffer.alloc(bytes.length+1)],'too-large.png')),{message:'STAFF_FILE_SIZE_INVALID'});
});
test('file read failures and invalid slots reject before a request body is returned, preserving the original file',async()=>{
 const file={size:png.length,type:'image/png',arrayBuffer:async()=>{throw Error('synthetic unreadable file')}};
 await assert.rejects(privateUploadBody(file,'team',requestId),{message:'STAFF_FILE_READ_FAILED'});
 await assert.rejects(privateUploadBody({...file,arrayBuffer:async()=>new ArrayBuffer(0)},'team',requestId),{message:'STAFF_FILE_READ_FAILED'});
 await assert.rejects(privateUploadBody(new File([png],'valid.png'),'team','bad\r\nheader'),{message:'STAFF_UPLOAD_REQUEST_INVALID'});
 await assert.rejects(privateUploadBody(new File([png],'valid.png'),'bad\r\nfield'),{message:'STAFF_UPLOAD_PURPOSE_INVALID'});
});
test('empty-caption uploads, missing picker MIME and untrusted filenames do not corrupt multipart headers',async()=>{
 const file=new File([png],'x"\r\nX-Injected: yes',{type:''}),body=await privateUploadBody(file),result=await parse(Buffer.from(await body.arrayBuffer()),body.type);
 assert.deepEqual(result.fields,{});assert.equal(result.files[0].filename,'attachment');assert.equal(result.files[0].mimeType,'application/octet-stream');assert.deepEqual(result.files[0].bytes,png);
 const truncated=Buffer.from(await body.arrayBuffer()).subarray(0,-80);await assert.rejects(parse(truncated,body.type),/Unexpected end of (?:form|file)/);
});
test('an account switch while reading a queued file never uploads old bytes using the new account token',async()=>{
 const apiSource=fs.readFileSync('client-staff/src/services/api.ts','utf8'),tree=ts.createSourceFile('api.ts',apiSource,ts.ScriptTarget.Latest,true);
 const fn=tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='uploadPrivateFile');assert(fn);
 const code=ts.transpileModule(fn.getText(tree)+'\nexports.uploadPrivateFile=uploadPrivateFile;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 let state={token:'synthetic-a',user:{id:'a',storeId:'store-a',staffId:'staff-a'}},releaseRead,calls=0;
 const read=new Promise(resolve=>{releaseRead=resolve}),file={size:png.length,type:'image/png',arrayBuffer:()=>read};
 const sessionSandbox={exports:{},privateUploadBody,API_BASE:'/api',useAuthStore:{getState:()=>state},getAuthHeader:()=>({Authorization:'Bearer '+state.token,'X-Client-App':'employee'}),http:{post:async()=>{calls++;return{data:{data:{id:'file-a'}}}}}};
 vm.runInNewContext(code,sessionSandbox);const upload=sessionSandbox.exports.uploadPrivateFile(file,'team',requestId);
 state={token:'synthetic-b',user:{id:'b',storeId:'store-b',staffId:'staff-b'}};releaseRead(png.buffer.slice(png.byteOffset,png.byteOffset+png.byteLength));
 await assert.rejects(upload,{message:'TEAM_IDENTITY_REQUIRED'});assert.equal(calls,0);
});
test('an unresponsive file read has a deadline and cannot hold the pending queue forever',async()=>{
 let expire,cleared=false;const timed={exports:{},Blob,crypto:crypto.webcrypto,setTimeout:callback=>{expire=callback;return 1},clearTimeout:id=>{assert.equal(id,1);cleared=true}};
 vm.runInNewContext(output,timed);const file={size:png.length,type:'image/png',arrayBuffer:()=>new Promise(()=>{})};
 const request=timed.exports.privateUploadBody(file,'team',requestId);expire();await assert.rejects(request,{message:'STAFF_FILE_READ_FAILED'});assert(cleared);
});
