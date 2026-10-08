const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),crypto=require('node:crypto'),ts=require('typescript');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pos-update-owned-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const installer=path.join(root,'installer.exe');fs.writeFileSync(installer,'owned synthetic installer bytes');
 const sha512=crypto.createHash('sha512').update(fs.readFileSync(installer)).digest('base64');
 const handlers={},events={},sent=[],actions=[];let failPrepare=false;
 const autoUpdater={installerPath:installer,setFeedURL(){},on:(n,cb)=>events[n]=cb,quitAndInstall:(...args)=>actions.push(['install',...args]),async downloadUpdate(){},async checkForUpdates(){}};
 const versions={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('client-pos/src/utils/updateVersion.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:versions});
 const api={};const source=ts.transpileModule(fs.readFileSync('client-pos/electron/updater.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(source,{exports:api,Buffer,require:n=>n==='electron-updater'?{autoUpdater}:n==='electron'?{ipcMain:{handle:(n,cb)=>handlers[n]=cb},shell:{showItemInFolder(){}},app:{isPackaged:true,getVersion:()=> '2026.10.313',getPath:()=>path.join(root,'profile')}}:n.includes('updateVersion')?versions:require(n),process,console:{log(){},warn(){},error(){}},setTimeout,setInterval,clearTimeout,clearInterval});
 api.setupUpdater({isDestroyed:()=>false,webContents:{send:(...args)=>sent.push(args)}},{prepare:async()=>{actions.push(['prepare']);if(failPrepare)throw Error('UPDATE_LOCAL_SERVER_STILL_RUNNING')},resume:()=>actions.push(['resume'])});
 const snapshot={format:'POSOffline-upgrade-v1',orders:[{id:1,status:'pending',orderNumber:'OFFLINE-owned',finalAmount:16000}],syncQueue:[{id:2,type:'order'}],config:[{key:'owned',value:'retained'}],products:[]};
 const download=(version='2026.10.314')=>events['update-downloaded']({version,files:[{url:'installer.exe',sha512}]});
 return {root,installer,handlers,events,sent,actions,autoUpdater,snapshot,download,failPrepare:()=>failPrepare=true};
}
test('online upgrade verifies installer, durably backs up pending records, prepares shutdown and invokes interactive installer',async t=>{
 const f=fixture(t);f.download();assert.equal(await f.handlers['install-update']({},f.snapshot),true);
 assert.deepEqual(f.actions,[['prepare'],['install',false,true]]);
 const files=fs.readdirSync(path.join(f.root,'profile/data/upgrade-backups'));assert.equal(files.length,1);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.root,'profile/data/upgrade-backups',files[0]))),f.snapshot);
 assert.equal(f.autoUpdater.autoInstallOnAppQuit,false);assert.equal(f.autoUpdater.autoRunAppAfterInstall,true);
});
test('missing downloaded installer or backup does not quit the usable POS',async t=>{
 const f=fixture(t);assert.equal(await f.handlers['install-update']({},f.snapshot),false);f.download();assert.equal(await f.handlers['install-update']({},undefined),false);assert.deepEqual(f.actions,[]);
});
test('same or older downloaded versions do not become installable',async t=>{
 const f=fixture(t);for(const version of ['2026.10.313','2026.10.312']){f.download(version);assert.equal(await f.handlers['install-update']({},f.snapshot),false)}assert.deepEqual(f.actions,[]);
});
test('installer modified after download is refused before shutdown or backup',async t=>{
 const f=fixture(t);f.download();fs.writeFileSync(f.installer,'modified');assert.equal(await f.handlers['install-update']({},f.snapshot),false);assert.deepEqual(f.actions,[]);assert.equal(fs.existsSync(path.join(f.root,'profile')),false);
});
test('backup write failure leaves POS open',async t=>{
 const f=fixture(t);f.download();fs.writeFileSync(path.join(f.root,'profile'),'owned obstruction');assert.equal(await f.handlers['install-update']({},f.snapshot),false);assert.deepEqual(f.actions,[]);
});
test('local server shutdown failure retains backup and resumes service without installation',async t=>{
 const f=fixture(t);f.download();f.failPrepare();assert.equal(await f.handlers['install-update']({},f.snapshot),false);assert.deepEqual(f.actions,[['prepare'],['resume']]);
 assert.equal(fs.readdirSync(path.join(f.root,'profile/data/upgrade-backups')).length,1);
});
test('two install clicks invoke one installer and retain one backup',async t=>{
 const f=fixture(t);f.download();assert.deepEqual(await Promise.all([f.handlers['install-update']({},f.snapshot),f.handlers['install-update']({},f.snapshot)]),[true,false]);assert.equal(f.actions.filter(a=>a[0]==='install').length,1);
});
test('same and lower available versions are suppressed',t=>{
 const f=fixture(t);f.events['update-available']({version:'2026.10.313'});f.events['update-available']({version:'2026.10.312'});f.events['update-available']({version:'2026.10.314'});assert.deepEqual(f.sent.map(e=>e[1]),['up-to-date','up-to-date','available']);
});
