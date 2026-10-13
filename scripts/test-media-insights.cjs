// All writes target a disposable database/upload folder and the local generated client.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process')
const root=path.resolve(__dirname,'..'),server=path.join(root,'server')
const prisma=path.join(server,'node_modules/prisma/build/index.js')
const loader=path.join(server,'node_modules/tsx/dist/loader.mjs')
const temp=fs.mkdtempSync('/tmp/media-product-regression-')
const env={...process.env,NODE_ENV:'test',DATABASE_URL:`file:${temp}/test.db`,UPLOADS_PATH:`${temp}/uploads`,CORS_ORIGIN:'http://127.0.0.1'}
function run(binary,args){const result=spawnSync(binary,args,{cwd:root,env,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)throw Error(`CHECK_FAILED: ${args.join(' ')}`)}
try{
 run(process.execPath,[prisma,'generate','--schema','server/prisma/schema.sqlite.prisma'])
 run(process.execPath,[prisma,'db','push','--schema','server/prisma/schema.sqlite.prisma','--skip-generate'])
 fs.copyFileSync(`${temp}/test.db`,`${temp}/template.db`)
 run('python3',['tests/media-insights/sqlite-upgrade-check.py',`${temp}/template.db`])
 run(process.execPath,['--import',loader,'tests/media-insights/translations-check.cjs'])
 run(process.execPath,['--import',loader,'--test','server/audit-tests/product-insights.check.ts','server/audit-tests/media-library.check.ts','server/audit-tests/image-optimization.check.ts'])
}catch(error){console.error(error.message);process.exitCode=1}
finally{
 const restored=spawnSync(process.execPath,[prisma,'generate','--schema','server/prisma/schema.prisma'],{cwd:root,env,stdio:'inherit'})
 if(restored.status!==0)process.exitCode=1
 fs.rmSync(temp,{recursive:true,force:true})
}
