const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process')
test('gross profit calculations and classified query contract',()=>{
 const result=spawnSync(process.execPath,['--import',path.resolve('server/node_modules/tsx/dist/loader.mjs'),'--test','server/audit-tests/revenue-gross-profit.check.ts'],{encoding:'utf8'})
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr)
})
