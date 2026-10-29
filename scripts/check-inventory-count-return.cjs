// Fresh private SQLite database/client only. No production data or Docker resources.
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const repo=path.resolve(__dirname,'..'),server=path.join(repo,'server'),run=fs.mkdtempSync('/tmp/bubble-inventory-flow-count-return-');
const env={...process.env,NODE_ENV:'test',DATABASE_URL:`file:${run}/test.db`,CORS_ORIGIN:'http://127.0.0.1',PRISMA_GENERATE_SKIP_AUTOINSTALL:'true'};
try{
 const schema=fs.readFileSync(path.join(server,'prisma/schema.sqlite.prisma'),'utf8').replace('generator client {',`generator client {\n output = "${run}/client"`);
 fs.writeFileSync(path.join(run,'package.json'),JSON.stringify({name:'count-return-disposable-test',private:true}));fs.symlinkSync(path.join(server,'node_modules'),path.join(run,'node_modules'),'dir');
 const file=path.join(run,'schema.prisma');fs.writeFileSync(file,schema);
 for(const args of [['generate','--schema',file],['db','push','--skip-generate','--schema',file]])execFileSync(process.execPath,[path.join(server,'node_modules/prisma/build/index.js'),...args],{cwd:repo,env,stdio:'inherit'});
 const config={rootDir:server,testEnvironment:'node',testMatch:[path.join(server,'audit-flow-tests/inventory-count-return.test.ts')],transform:{'^.+\\.ts$':[path.join(server,'node_modules/ts-jest'),{tsconfig:{module:'CommonJS',esModuleInterop:true},diagnostics:true}]},maxWorkers:1,cache:false,testTimeout:30000,setupFiles:[path.join(server,'audit-flow-tests/safety.cjs')],moduleNameMapper:{'^@prisma/client$':`${run}/client`}};
 execFileSync(process.execPath,[path.join(server,'node_modules/jest/bin/jest.js'),'--config',JSON.stringify(config),'--runInBand'],{cwd:repo,env,stdio:'inherit'});
}finally{fs.rmSync(run,{recursive:true,force:true})}
