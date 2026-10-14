// Two standalone Electron processes; exact packaged code, synthetic token, owned profile.
const {app}=require('electron'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const arg=name=>process.argv[process.argv.indexOf(name)+1];
const resources=path.resolve(arg('--resources')),root=path.resolve(arg('--profile')),phase=arg('--phase');
assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.platform,'win32');
assert.ok(root.startsWith(path.resolve(process.env.RUNNER_TEMP)+path.sep));assert.ok(path.basename(root).startsWith('btps-session-owned-'));
const owner=path.join(root,'fixture-owner.json');
if(phase==='save'){assert.equal(fs.existsSync(root),false);fs.mkdirSync(root);fs.writeFileSync(owner,JSON.stringify({sourceSha:process.env.GITHUB_SHA}));}
else{assert.equal(phase,'restore');assert.equal(JSON.parse(fs.readFileSync(owner)).sourceSha,process.env.GITHUB_SHA);}
app.setPath('userData',root);
const timer=setTimeout(()=>app.exit(1),30000);
app.whenReady().then(async()=>{
 const {saveUpgradeSession,consumeUpgradeSession}=require(path.join(resources,'app.asar/client-pos/dist-electron/electron/upgradeSession.js'));
 const auth={state:{isAuthenticated:true,token:'synthetic-upgrade-token',apiUrl:'https://synthetic.example/api',user:{id:'synthetic',phone:'synthetic',role:'cashier',storeId:'synthetic-store',staff:null}},version:0};
 if(phase==='save'){
  await saveUpgradeSession(JSON.stringify(auth));
  const bytes=fs.readFileSync(path.join(root,'data/upgrade-session.bin'));assert.ok(!bytes.includes(Buffer.from(auth.state.token)));
 }else{
  assert.deepEqual(JSON.parse(await consumeUpgradeSession()),auth);assert.equal(await consumeUpgradeSession(),null);
  fs.writeFileSync('upgrade-session-validation.json',JSON.stringify({sourceSha:process.env.GITHUB_SHA,passed:true,syntheticOnly:true,encrypted:true,oneTime:true,separateProcesses:true,accountAndBackendPreserved:true},null,2));
 }
 console.log('PASS exact packaged upgrade login handoff: '+phase);clearTimeout(timer);app.quit();
}).catch(error=>{console.error(error);clearTimeout(timer);app.exit(1)});
