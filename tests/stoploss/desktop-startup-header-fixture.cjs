// Owned business-boundary fixtures for the actual POS entry point; never production data.
const path=require('node:path'),{pathToFileURL}=require('node:url');
exports.createFixture=async(port=6255)=>{
 const {createServer}=await import(pathToFileURL(path.join(path.dirname(require.resolve('vite/package.json')),'dist/node/index.js')).href);
 const tailwind=(await import(pathToFileURL(path.resolve('client-pos/tailwind.config.js')).href)).default;
 const origin='http://127.0.0.1:'+port,state={tasks:true,ready:false,reads:0,apiCalls:0,painted:false},waiting=new Set();
 const server=await createServer({configFile:false,esbuild:{jsx:'automatic'},root:path.resolve('client-pos'),cacheDir:'/tmp/btps-startup-header-owned-'+port,css:{postcss:{plugins:[require('tailwindcss')({...tailwind,content:[path.resolve('client-pos/src/**/*.{js,ts,jsx,tsx}')]})]}},server:{host:'127.0.0.1',port,strictPort:true},plugins:[{name:'owned-boundary',configureServer(s){s.middlewares.use(async(req,res,next)=>{
  const u=new URL(req.url,origin);const send=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data))};
  if(u.pathname==='/fixture-controls'){
   if(req.method==='POST'){if(u.searchParams.has('tasks'))state.tasks=u.searchParams.get('tasks')==='true';if(u.searchParams.has('ready')){state.ready=true;for(const w of waiting)w.end('{"ready":true}');waiting.clear()}send({ok:true});return}
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<title>Owned test controls</title><h1>测试边界控制（示例数据）</h1><form method="POST" action="/fixture-controls?ready=true"><button>本地服务就绪</button></form><form method="POST" action="/fixture-controls?tasks=false"><button>隐藏任务</button></form><form method="POST" action="/fixture-controls?tasks=true"><button>显示任务</button></form>');return
  }
  if(u.pathname==='/fixture-ready'){res.setHeader('Content-Type','application/json');if(state.ready)res.end('{"ready":true}');else{waiting.add(res);res.on('close',()=>waiting.delete(res))}return}
  if(u.pathname==='/fixture-painted'){state.painted=true;send({ok:true});return}
  if(u.pathname==='/fixture'){
   const bootstrap=`localStorage.setItem('pos-api-url',location.origin+'/api');for(const k of ['pos_language','pos_lang','bubble-tea-language'])localStorage.setItem(k,'zh');const isPos=new URL(location.href).searchParams.has('pos');window.electronAPI={waitForLocalServer:()=>new URL(location.href).searchParams.has('hold')?fetch('/fixture-ready').then(r=>r.json()):Promise.resolve({ready:true}),notifyLoginReady:()=>{void fetch('/fixture-painted')},consumeUpgradeSession:async()=>isPos?JSON.stringify({state:{isAuthenticated:true,token:'synthetic-only',apiUrl:location.origin+'/api',user:{id:'owned',role:'admin',storeId:'owned',staff:{id:'owned',name:'Owned test cashier'}}},version:0}):null,getAppVersion:async()=> '2026.10.517',getUpdateState:async()=>({status:'idle',currentVersion:'2026.10.517'}),onUpdateStatus:()=>()=>{},onUpdateProgress:()=>()=>{},onUpdateError:()=>()=>{},onReceiptHandover:()=>()=>{},listPrinters:async()=>({printers:[]}),minimizeWindow:()=>{},maximizeWindow:async()=>false,isMaximized:async()=>false,closeWindow:()=>{}};`;
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await s.transformIndexHtml('/fixture','<html><div id="root"></div><script>'+bootstrap+'</script><script type="module" src="/src/main.tsx"></script></html>'));return
  }
  if(u.pathname==='/health'){send({status:'ok'});return}
  if(!u.pathname.startsWith('/api/'))return next();state.apiCalls++;let data={};
  if(u.pathname==='/api/health'){send({status:'ok'});return}
  if(u.pathname==='/api/products')data={list:[{id:'p',name:'Synthetic Tea',status:'active',category:{id:'tea',name:'Tea'},specs:[{id:'s',name:'Regular',price:10000}],addons:[]}]};
  if(u.pathname==='/api/config'){state.reads++;data={toolbarSettings:{showShift:true,showAttendance:true,showSuspend:true,showHistory:true,showScan:false,showCash:false,showExpense:true,showTasks:state.tasks,showLogout:true},paymentMethods:{cash:true,defaultMethod:'cash'},taxSettings:{enabled:false},displaySettings:{fontSize:'large'}}}
  if(u.pathname==='/api/channels'||u.pathname.includes('discount-rules')||u.pathname==='/api/marketing/activities')data=[];
  if(u.pathname==='/api/shifts')data=[{key:'day',name:'Day'}];
  if(u.pathname==='/api/pos-cash/shifts/current')data={hasOpenShift:false};
  if(u.pathname==='/api/marketing/activities/quote')data={items:[],subtotal:0,discount:0,finalAmount:0,tax:0,grandTotal:0,applied:null,pointsRedeemed:0,pendingSelections:[],entitlements:[],signature:'synthetic-only'};
  if(u.pathname==='/api/marketing/activities/offline-snapshot')data={token:'synthetic-only',expiresAt:new Date(Date.now()+86400000).toISOString(),activities:[],products:[],channels:[],addons:[],taxRate:0};
  send({code:200,data});
 })}}]});await server.listen();return {server,origin,state,close:async()=>{for(const r of waiting)r.end('{"ready":false}');await server.close()}};
};
