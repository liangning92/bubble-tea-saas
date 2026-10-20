
const path=require('node:path'),fs=require('node:fs'),Module=require('node:module'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
if((process.argv[1]||'').endsWith('notification-awareness-http-check.cjs')){
 const root=process.cwd(),oldSha='108e4b0638f6392051ac355b97f17f655d0135c5',sourcePath='server/src/services/EmployeeReminderService.ts',target=path.join(root,'server/dist/services/EmployeeReminderService.js');
 const source=execFileSync('git',['show',oldSha+':'+sourcePath],{cwd:root,encoding:'utf8'}),ts=require(require.resolve('typescript',{paths:[root,root+'/server']}));
 const loaded=ts.readConfigFile(path.join(root,'server/tsconfig.json'),ts.sys.readFile);if(loaded.error)throw Error('TSCONFIG_READ_FAILED');const options=ts.parseJsonConfigFileContent(loaded.config,ts.sys,path.join(root,'server')).options;
 const compiled=ts.transpileModule(source,{compilerOptions:options,fileName:path.join(root,sourcePath)}).outputText,hash=value=>createHash('sha256').update(value).digest('hex');
 const proof={oldWorkerCommit:oldSha,oldWorkerSourceSha256:hash(source),newWorkerSourceSha256:hash(fs.readFileSync(path.join(root,sourcePath))),newWorkerCompiledSha256:hash(fs.readFileSync(target)),oldWorkerTranspiledSha256:hash(compiled),bootstrapSha256:hash(fs.readFileSync(__filename)),targetModule:target,overlay:'require.cache only; repository TS and dist unmodified',scope:'Only old EmployeeReminderService; remaining runtime current, not a whole-tree old-SHA test',batch:process.env.BT_TEST_RUN};
 fs.writeFileSync(path.join(root,'output/notification-awareness/subscription-cas-old-worker-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log('OLD_WORKER_PROOF',JSON.stringify(proof));
 const injected=new Module(target,module);injected.filename=target;injected.paths=Module._nodeModulePaths(path.dirname(target));require.cache[target]=injected;injected._compile(compiled,target);injected.loaded=true;
}
