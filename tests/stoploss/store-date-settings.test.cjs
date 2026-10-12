const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,imports={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require:n=>imports[n],Date,Intl,Map,Set,console});return m.exports;}
const settings=load('server/src/utils/storeDateSettings.ts'),dates=load('server/src/utils/revenueDateRange.ts',{'./storeDateSettings':settings}),display=load('client-admin/src/utils/storeDateTime.ts'),presets=load('client-admin/src/utils/queryPeriods.ts',{'./storeDateTime':display});
test('same instant uses each store calendar without changing stored timestamps',()=>{
 const now=new Date('2026-10-12T18:00:00Z');assert.equal(settings.calendarDate(now,'Asia/Jakarta'),'2026-10-13');assert.equal(settings.calendarDate(now,'America/Los_Angeles'),'2026-10-12');assert.equal(dates.revenuePeriodRange({period:'today'},now,'today','Asia/Jakarta').start.toISOString(),'2026-10-12T17:00:00.000Z');assert.equal(now.toISOString(),'2026-10-12T18:00:00.000Z');
});
test('DST day lengths are 23 and 25 hours, not a hardcoded offset',()=>{
 for(const [date,hours] of [['2026-03-08',23],['2026-11-01',25]]){const r=dates.revenuePeriodRange({period:'custom',startDate:date,endDate:date},new Date(),'today','America/New_York');assert.equal((r.end-r.start+1)/3600000,hours);const browser=presets.queryInstantRange('today','America/New_York',new Date(date+'T12:00Z'));assert.equal(browser.startDate,r.start.toISOString());assert.equal(browser.endDate,r.end.toISOString());}
});
test('all shortcuts use the same order and Monday calendar week on client and server',()=>{
 assert.deepEqual(Array.from(presets.QUERY_PERIODS),['yesterday','today','week','month']);const now=new Date('2026-10-12T18:00Z');for(const zone of ['Asia/Jakarta','UTC','America/New_York','Asia/Kathmandu'])for(const period of presets.QUERY_PERIODS){const client=presets.queryInstantRange(period,zone,now),server=dates.revenuePeriodRange({period},now,'today',zone);assert.equal(client.startDate,server.start.toISOString());assert.equal(client.endDate,server.end.toISOString());}
 const yesterday=dates.revenuePeriodRange({period:'yesterday'},now,'today','Asia/Jakarta');assert.equal(settings.calendarDate(yesterday.start,'Asia/Jakarta'),'2026-10-12');
});
test('store and global settings are read independently, invalid legacy values default safely',async()=>{
 const own={timezone:'America/New_York',dateFormat:'DD/MM/YYYY'};let reads=[];const db={config:{findUnique:async q=>{reads.push(q.where.storeId_key.storeId);return {value:JSON.stringify(own)}}}};assert.equal((await settings.loadStoreDateSettings(db,'store')).timezone,'America/New_York');assert.deepEqual(reads,['store']);
 const legacy=await settings.loadStoreDateSettings({config:{findUnique:async()=>({value:'{"timezone":"invalid","dateFormat":"invalid"}'})}},'other');assert.equal(legacy.timezone,'Asia/Jakarta');assert.equal(legacy.dateFormat,'YYYY-MM-DD');assert.equal(settings.validTimezone('Invalid/Zone'),false);
});
test('date format applies to timestamps and calendar labels without shifting date-only inputs',()=>{
 const instant='2026-10-12T18:00Z';assert.equal(display.formatStoreDate(instant,{timezone:'Asia/Jakarta',dateFormat:'YYYY-MM-DD'}),'2026-10-13');assert.equal(display.formatStoreDate(instant,{timezone:'America/New_York',dateFormat:'DD/MM/YYYY'},true),'12/10/2026 14:00');assert.equal(display.formatStoreDate('2026-10-13',{timezone:'America/Los_Angeles',dateFormat:'MM/DD/YYYY'}),'10/13/2026');
});
