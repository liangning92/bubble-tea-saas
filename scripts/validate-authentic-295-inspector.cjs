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
  // Wait for the original setupUpdater to register its IPC handlers.
  await delay(20000);
  if(process.argv[2]==='download'){
    const result=await evaluate(`(async()=>{const e=process.mainModule.require('electron'); const u=process.mainModule.require('electron-updater').autoUpdater; u.setFeedURL({provider:'generic',url:'http://127.0.0.1:${Number(process.argv[3])}/'});u.disableDifferentialDownload=true;const w=e.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html'));if(!w)throw Error('Original main window missing');await w.webContents.executeJavaScript('window.electronAPI.checkForUpdates()');const ok=await w.webContents.executeJavaScript('window.electronAPI.downloadUpdate()');if(!ok)throw Error('Original download IPC failed');return {version:e.app.getVersion(),userData:e.app.getPath('userData'),installerPath:u.installerPath};})()`);
    console.log(JSON.stringify(result));socket.close();
  }else{
    // Fire the same preload method used by the original Update button. App quits.
    await evaluate(`(()=>{const e=process.mainModule.require('electron');const w=e.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html'));w.webContents.executeJavaScript('window.electronAPI.installUpdate()');return true;})()`);
    socket.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1});
