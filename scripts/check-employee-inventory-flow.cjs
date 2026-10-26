// No build or deployment. Creates a fresh SQLite database and a private Prisma client.
const fs=require('fs'),path=require('path'),os=require('os'),{execFileSync}=require('child_process');
const repo=path.resolve(__dirname,'..'),server=path.join(repo,'server'),run=fs.mkdtempSync('/tmp/bubble-inventory-flow-');
const prisma=path.join(server,'node_modules/prisma/build/index.js'),jest=path.join(server,'node_modules/jest/bin/jest.js');
const env={...process.env,NODE_ENV:'test',DATABASE_URL:`file:${run}/test.db`,CORS_ORIGIN:'http://127.0.0.1',PRISMA_GENERATE_SKIP_AUTOINSTALL:'true'};
const schema=fs.readFileSync(path.join(server,'prisma/schema.sqlite.prisma'),'utf8').replace('generator client {',`generator client {\n  output = "${run}/client"`);
fs.writeFileSync(path.join(run,'package.json'),JSON.stringify({name:'inventory-flow-disposable-test',private:true}));
fs.symlinkSync(path.join(server,'node_modules'),path.join(run,'node_modules'),'dir');
const file=path.join(run,'schema.prisma');fs.writeFileSync(file,schema);
const invoke=args=>execFileSync(process.execPath,[prisma,...args],{cwd:repo,env,stdio:'inherit'});
// Retain the pre-feature schema for the real upgrade test, without copying any store DB.
const legacy=execFileSync('git',['show','c2e2086e829be74c48f808a18ab4615a7faf0b8f:server/prisma/schema.sqlite.prisma'],{cwd:repo,encoding:'utf8'});
fs.writeFileSync(path.join(run,'legacy.prisma'),legacy);
const sql=execFileSync(process.execPath,[prisma,'migrate','diff','--from-empty','--to-schema-datamodel',path.join(run,'legacy.prisma'),'--script'],{cwd:repo,env,encoding:'utf8'});
// Keep later, unrelated order fields present in the supported inventory-upgrade fixture.
const currentSql=execFileSync(process.execPath,[prisma,'migrate','diff','--from-empty','--to-schema-datamodel',file,'--script'],{cwd:repo,env,encoding:'utf8'});
let legacySql=sql;
for(const table of ['Order','OrderItem']){
 const block=new RegExp(String.raw`CREATE TABLE "${table}" \(([\s\S]*?)\);`);
 const old=sql.match(block)?.[1]||'',now=currentSql.match(block)?.[1]||'';
 for(const line of now.split('\n')){const column=line.match(/^\s+"([^"]+)"\s+(.+?),?$/);if(column&&!old.includes('"'+column[1]+'"'))legacySql+='\nALTER TABLE "'+table+'" ADD COLUMN "'+column[1]+'" '+column[2].replace(/,$/,'')+';';}
}
fs.writeFileSync(path.join(run,'legacy.sql'),legacySql);env.INVENTORY_FLOW_LEGACY_SQL=path.join(run,'legacy.sql');
invoke(['generate','--schema',file]);invoke(['db','push','--skip-generate','--schema',file]);
const config={rootDir:server,testEnvironment:'node',testMatch:[path.join(server,'audit-flow-tests/**/*.test.ts')],transform:{'^.+\\.ts$':[path.join(server,'node_modules/ts-jest'),{tsconfig:{module:'CommonJS',esModuleInterop:true},diagnostics:true}]},maxWorkers:1,cache:false,testTimeout:30000,setupFiles:[path.join(server,'audit-flow-tests/safety.cjs')],moduleNameMapper:{'^@prisma/client$':`${run}/client`}};
console.log('Disposable check directory: '+run);
execFileSync(process.execPath,[jest,'--config',JSON.stringify(config),'--runInBand'],{cwd:repo,env,stdio:'inherit'});
