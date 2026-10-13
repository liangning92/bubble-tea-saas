// Exercise real nginx with an isolated mock upstream; never use operational APIs.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const configuration=path.resolve('client-admin/docker/nginx.conf');
test('media upload proxy forwards 4MiB pictures and keeps unrelated API limits',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'media-proxy-limit-'));
 const prefix='media-proxy-test-'+randomUUID().slice(0,8),network=prefix+'-net',backend=prefix+'-backend',front=prefix+'-front';
 const image=process.env.MEDIA_PROXY_NGINX_IMAGE||'nginx:alpine';
 const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const cleanup=(...args)=>{try{docker(...args)}catch{}};
 try{
  const upstream=path.join(root,'upstream.conf');
  fs.writeFileSync(upstream,'server { listen 3000; client_max_body_size 501m; location / { return 200 "mock upstream"; } }\n');
  const small=path.join(root,'small.png'),large=path.join(root,'large.png');
  fs.writeFileSync(small,Buffer.alloc(50*1024));fs.writeFileSync(large,Buffer.alloc(4*1024*1024));
  docker('network','create',network);
  docker('run','-d','--name',backend,'--network',network,'--network-alias','bubble-tea-api','-v',`${upstream}:/etc/nginx/conf.d/default.conf:ro`,image);
  docker('run','-d','--name',front,'--network',network,'-p','127.0.0.1::80','-v',`${configuration}:/etc/nginx/conf.d/default.conf:ro`,image);
  docker('exec',front,'nginx','-t');
  const info=JSON.parse(docker('inspect',front))[0],port=info.NetworkSettings.Ports['80/tcp'][0].HostPort;
  let ready=false;
  for(let i=0;i<40;i++){try{const response=await fetch(`http://127.0.0.1:${port}/`,{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,100))}
  assert.ok(ready,'isolated nginx is ready');
  const post=(uri,file)=>execFileSync('curl',['-sS','--max-time','15','-o','/dev/null','-w','%{http_code}','-F',`files=@${file}`,`http://127.0.0.1:${port}${uri}`],{encoding:'utf8'}).trim();
  assert.equal(post('/api/media?scene=product',small),'200');
  assert.equal(post('/api/media?scene=product',large),'200');
  assert.equal(post('/api/media?scene=library',large),'200');
  assert.equal(post('/api/media/?scene=product',large),'200');
  assert.equal(post('/api/upload/dualScreen',large),'200');
  assert.equal(post('/api/unrelated-json-endpoint',large),'413');
 }finally{cleanup('rm','-f',front,backend);cleanup('network','rm',network);fs.rmSync(root,{recursive:true,force:true})}
});
