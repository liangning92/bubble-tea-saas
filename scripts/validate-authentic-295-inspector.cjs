// Test runner only. Debugger control of an owned, unmodified historical Electron process.
const WebSocket = require('ws');
const delay = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  let targets;
  for(let i=0;i<90;i++){try{targets=await(await fetch('http://127.0.0.1:19295/json')).json();if(targets.length)break;}catch{}await delay(1000);}
  if(!targets?.length)throw Error('Original 295 inspector did not start');
  const socket=new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j)});
  const pending=new Map();let id=0;
  socket.on('message',raw=>{const msg=JSON.parse(raw);if(msg.id&&pending.has(msg.id)){pending.get(msg.id)(msg);pending.delete(msg.id)}});
  const evaluate=async expression=>{
    const request=++id;
    const response=await new Promise(r=>{pending.set(request,r);socket.send(JSON.stringify({id:request,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}))});
    if(response.error||response.result?.exceptionDetails)throw Error(JSON.stringify(response));
    return response.result.result.value;
  };
  const originalVersion=process.argv[4] || '2026.10.295';
  // Wait for the original setupUpdater to register its IPC handlers.
  if(process.argv[2]==='download') await delay(20000);
  if(process.argv[2]==='download'){
    const result=await evaluate(`(async()=>{const e=process.mainModule.require('electron'); const u=process.mainModule.require('electron-updater').autoUpdater; u.setFeedURL({provider:'generic',url:'http://127.0.0.1:${Number(process.argv[3])}/'});u.disableDifferentialDownload=true;const w=e.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html'));if(!w)throw Error('Original main window missing');await w.webContents.executeJavaScript('window.__upgradeReady=false;window.electronAPI.onUpdateStatus(s=>{if(s==="downloaded")window.__upgradeReady=true})');await w.webContents.executeJavaScript('window.electronAPI.checkForUpdates()');const ok=await w.webContents.executeJavaScript('window.electronAPI.downloadUpdate()');if(!ok)throw Error('Original download IPC failed');for(let i=0;i<180;i++){if(await w.webContents.executeJavaScript('window.__upgradeReady'))break;await new Promise(r=>setTimeout(r,1000));}if(!await w.webContents.executeJavaScript('window.__upgradeReady'))throw Error('Background preparation never became ready');return {version:e.app.getVersion(),userData:e.app.getPath('userData'),installerPath:u.installerPath};})()`);
    console.log(JSON.stringify(result));socket.close();
  }else{
    const snapshot = originalVersion==='2026.10.295' ? '' : JSON.stringify({format:'POSOffline-upgrade-v1',capturedAt:new Date().toISOString(),orders:[],syncQueue:[],config:[],products:[]});
    // Owned fresh Chromium profile contains no transactions. Historical rows are
    // in the SQLite fixture and are checked independently after restart.
    // Fire the same preload method used by the original Update button. App quits.
    await evaluate(`(()=>{const e=process.mainModule.require('electron');const w=e.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html'));w.webContents.executeJavaScript('window.electronAPI.installUpdate(${snapshot})');return true;})()`);
    socket.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1});
