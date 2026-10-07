// Generate schemas/clients in a newly owned /tmp tree; never opens a database.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=fs.mkdtempSync('/tmp/pos-idempotency-runtime-');
const serverRequire=require('node:module').createRequire(path.resolve('server/package.json'));
const deps=path.dirname(path.dirname(serverRequire.resolve('prisma/package.json')));
const cli=serverRequire.resolve('prisma/build/index.js');
fs.writeFileSync(path.join(root,'package.json'),'{"name":"owned-order-receipt-runtime","private":true}');
fs.symlinkSync(deps,path.join(root,'node_modules'),'junction');
const source=fs.readFileSync('server/prisma/schema.prisma','utf8');
const env={...process.env,PRISMA_GENERATE_SKIP_AUTOINSTALL:'1'};
for(const provider of ['sqlite','postgresql']){
 const folder=path.join(root,provider);fs.mkdirSync(folder);
 const schema=source.replace(/generator client \{[\s\S]*?\}/,`generator client {\n provider = "prisma-client-js"\n output = "${folder}/client"\n binaryTargets = ["native"]\n}`).replace(/provider\s*=\s*"postgresql"/,`provider = "${provider}"`);
 const file=path.join(folder,'schema.prisma');fs.writeFileSync(file,schema);
 execFileSync(process.execPath,[cli,'generate','--schema',file],{cwd:root,env,stdio:['ignore','ignore','pipe']});
 const sql=execFileSync(process.execPath,[cli,'migrate','diff','--from-empty','--to-schema-datamodel',file,'--script'],{cwd:root,env,encoding:'utf8'});
 fs.writeFileSync(path.join(folder,'schema.sql'),sql);
}
console.log(JSON.stringify({runtime:root,providers:['sqlite','postgresql'],noDatabaseAccess:true}));
