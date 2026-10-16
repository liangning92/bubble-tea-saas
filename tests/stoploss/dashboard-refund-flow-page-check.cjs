// Production React bundle with owned HTTP fixtures; never sends store mutations.
const {chromium,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve('client-admin/dist'),out=path.resolve(process.env.REFUND_FLOW_EVIDENCE||'output/refund-flow-ui');
const stamp='2026-10-16T10:00:00.000Z',item={id:'item',productName:'Synthetic Mango Tea',quantity:2,unitPrice:22000,bomCost:0};
const order={id:'synthetic-order',storeId:'owned',orderNumber:'SYNTHETIC-REFUND',items:[item],finalAmount:44000,subtotal:44000,discountAmount:0,tax:0,status:'completed',paymentMethod:'cash',createdAt:stamp};
const request={id:'synthetic-request',orderId:order.id,orderNumber:order.orderNumber,reason:'Synthetic only',reasonCode:'paid_unprepared',selectedItemIds:'["item"]',amount:44000,status:'pending',createdAt:stamp,order};
const dashboard={timestamp:stamp,today:{orders:1,revenue:44000,averageOrder:44000,cost:0,profit:44000},thisMonth:{orders:1,revenue:44000,cost:0,profit:44000},member:{newMembers:0,ratio:0},staff:{checkedIn:0,total:0,pendingLeave:0},inventory:{lowStockItems:[]},topProducts:[],recentOrders:[]};
(async()=>{let browser;const server=http.createServer((req,res)=>{let file=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(fs.readFileSync(file));});
try{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true});fs.mkdirSync(out,{recursive:true});
for(const [width,height,lang] of [[1440,1000,'zh'],[820,1180,'en'],[390,844,'id']]){
 let approved=false,mutations=0,pendingError=false;const errors=[];
 const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
 await context.addInitScript(lang=>{localStorage.setItem('bubble-tea-language',lang);sessionStorage.setItem('auth-storage',JSON.stringify({state:{isAuthenticated:true,token:'synthetic-only',user:{id:'owner',role:'admin',storeId:'owned',staff:null}},version:0}));},lang);
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());assert.equal(url.origin,origin,'No external requests');if(!url.pathname.startsWith('/api/'))return route.continue();let data={},status=200;
 if(req.method()!=='GET'){assert.equal(url.pathname,'/api/orders/refund-requests/synthetic-request/approve');assert.equal(req.postDataJSON().verifiedUnprepared,true);mutations++;approved=true;data={};}
 else if(url.pathname==='/api/reports/pending-actions'){status=pendingError?503:200;data={actions:[{key:'refunds',count:approved?0:1,to:'/finance/orders?tab=refunds'}],total:approved?0:1};}
 else if(url.pathname==='/api/reports/dashboard')data={...dashboard,today:{...dashboard.today,orders:approved?0:1,revenue:approved?0:44000}};
 else if(url.pathname==='/api/orders/refund-requests')data={list:approved?[]:[request]};
 else if(url.pathname==='/api/orders')data={list:approved?[]:[order],total:approved?0:1};
 else if(url.pathname==='/api/channels')data={list:[]};
 else if(url.pathname==='/api/finance/shift-sessions')data={sessions:[]};
 else if(url.pathname==='/api/pos-action-logs/stats')data={warningCount:0,criticalCount:0,todayTotal:0};
 else if(url.pathname==='/api/pos-action-logs/sessions')data=[];
 else if(url.pathname.includes('alerts')||url.pathname==='/api/orders/received-receipts')data=[];
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify({code:status,data})});});
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/dashboard');
 const panel=page.locator('section').filter({has:page.locator('a[href="/finance/orders?tab=refunds"]')});await expect(panel).toBeVisible();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'responsive dashboard must fit viewport');await page.screenshot({path:path.join(out,`${lang}-${width}-pending.png`),fullPage:false});
 await panel.locator('a[href="/finance/orders?tab=refunds"]').click();await expect(page.getByText('Synthetic only',{exact:true})).toBeVisible();
 // The red count belongs to the refund tab; deep linking survives reload.
 await page.reload();await expect(page.getByText('Synthetic only',{exact:true})).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'refund table must scroll within its own panel');assert.ok(await page.locator('table').first().evaluate(el=>el.getBoundingClientRect().width)>=960,'refund columns must keep readable width');
 const approve=page.locator('button').filter({has:page.locator('svg.lucide-check-circle')}).first();await approve.click();
 const approval=page.getByRole('dialog');await expect(approval).toHaveCount(1);await approval.locator('.admin-dialog-footer button').last().click();
 await expect(page.getByRole('dialog')).toHaveCount(2);
 const confirmation=page.locator('.admin-dialog-overlay').filter({has:page.locator('.admin-dialog-body > p')});await expect(confirmation).toBeVisible();
 const layers=await page.locator('.admin-dialog-overlay').evaluateAll(nodes=>nodes.map(n=>({z:Number(getComputedStyle(n).zIndex),confirmation:!!n.querySelector('.admin-dialog-body > p')})));
 assert.ok(layers.find(x=>x.confirmation).z>layers.find(x=>!x.confirmation).z,'confirmation must be above busy refund dialog');
 await page.screenshot({path:path.join(out,`${lang}-${width}-confirmation.png`),fullPage:false});
 await confirmation.locator('.admin-dialog-footer button').last().click();await expect(page.getByRole('dialog')).toHaveCount(0);assert.equal(mutations,1,'exactly one approval');await expect(page.getByText('Synthetic only',{exact:true})).toHaveCount(0);
 await page.goto(origin+'/dashboard');await expect(page.getByText(lang==='zh'?'暂无待处理申请或审批':lang==='id'?'Tidak ada pengajuan atau persetujuan tertunda':'No pending requests or approvals',{exact:true})).toBeVisible();await expect(page.locator('a[href="/finance/orders?tab=refunds"]')).toHaveCount(0);await page.screenshot({path:path.join(out,`${lang}-${width}-approved.png`),fullPage:false});
 pendingError=true;await page.reload();await expect(page.getByTestId('dashboard-read-failure')).toBeVisible();await expect(page.locator('a[href="/finance/orders?tab=refunds"]')).toHaveCount(0);assert.equal(mutations,1);assert.deepEqual(errors,[]);console.log(`PASS ${lang} ${width}px: top notification, deep link/reload, confirmation stacking, one approval, dialog close, pending count refresh, responsive width`);await context.close();
}
for(const role of ['admin','manager']){
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.addInitScript(role=>{localStorage.setItem('bubble-tea-language','en');sessionStorage.setItem('auth-storage',JSON.stringify({state:{isAuthenticated:true,token:'synthetic-only',user:{id:'owner',role,storeId:'owned',staff:null}},version:0}));},role);
 const rows=['orders.refund','members.balance','orders.discount'].map((action,i)=>({id:'self-'+i,action,applicantId:'owner',targetId:'SELF-'+i,payload:JSON.stringify({amount:100,note:'Owned fixture'}),status:'pending',createdAt:stamp}));
 rows.push({...rows[0],id:'other',applicantId:'other',targetId:'OTHER'});
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());assert.equal(url.origin,origin);if(!url.pathname.startsWith('/api/'))return route.continue();assert.equal(req.method(),'GET','Permission visibility test must remain read only');let data={};if(url.pathname==='/api/staff-permissions/approvals')data=rows;else if(url.pathname==='/api/staff-permissions/stores')data=[{id:'owned',name:'Synthetic Store'}];else if(url.pathname==='/api/staff-permissions/me')data={role:null};else if(url.pathname.includes('alerts'))data=[];await route.fulfill({contentType:'application/json',body:JSON.stringify({code:200,data})});});
 const page=await context.newPage();await page.goto(origin+'/approvals');
 for(const [target,count] of [['SELF-0',role==='admin'?2:0],['SELF-1',0],['SELF-2',0],['OTHER',2]]){const row=page.locator('article').filter({hasText:target});await expect(row).toBeVisible();await expect(row.getByRole('button')).toHaveCount(count);}
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,`${role}-self-approval-390.png`)});console.log(`PASS ${role}: self-refund controls match native role; balance/discount self-approval remains hidden`);await context.close();
}
for(const [width,height] of [[1440,1000],[820,1180],[390,844]])for(const kind of ['orders','expenses','warnings']){
 const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
 await context.addInitScript(()=>{localStorage.setItem('bubble-tea-language','en');sessionStorage.setItem('auth-storage',JSON.stringify({state:{isAuthenticated:true,token:'synthetic-only',user:{id:'owner',role:'admin',storeId:'owned',staff:null}},version:0}));});
 const summary={revenue:100,orders:0,completedOrders:0,refundedOrders:0,refundedAmount:0,expenses:0,expenseAmount:0,warnings:0,employees:1};
 const empty={windowStart:stamp,windowEnd:stamp,overlapping:false,summary,orders:[],expenses:[],warnings:[],employees:[],cashWarning:null,cashReconciliation:null,manualReceipts:null};
 const shift={...empty,id:'evening',session:{shift:'evening',status:'closed',updatedAt:stamp,openedAt:stamp,closedAt:stamp,openFloat:0,actualCash:100,expectedCash:100,cashDifference:0,opener:{name:'Synthetic owner'},definition:{name:'Synthetic Evening'}}};
 const unassigned={...empty,id:'unassigned',session:null,summary:{...summary,orders:kind==='orders'?1:0,completedOrders:kind==='orders'?1:0,expenses:kind==='expenses'?1:0,warnings:kind==='warnings'?1:0},[kind]:kind==='orders'?[{id:'orphan',items:[{productName:'Unassigned Tea',quantity:1}],orderNumber:'ORPHAN',staffName:'Synthetic',status:'completed',amount:100,paymentMethod:'cash',createdAt:stamp}]:kind==='expenses'?[{id:'expense',category:'other',description:'Unassigned expense',amount:100,quantity:1,staffName:'Synthetic',createdAt:stamp}]:[{id:'warning',description:'Unassigned warning',severity:'warning',staffName:'Synthetic',createdAt:stamp}]};
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());assert.equal(url.origin,origin);if(!url.pathname.startsWith('/api/'))return route.continue();assert.equal(req.method(),'GET');let data={};if(url.pathname==='/api/finance/shift-sessions')data={asOf:stamp,categories:[],sessions:[shift],unassigned};else if(url.pathname.includes('alerts'))data=[];await route.fulfill({contentType:'application/json',body:JSON.stringify({code:200,data})});});
 const page=await context.newPage();await page.goto(origin+'/finance/revenue/shifts/evening?startDate=2026-10-16&endDate=2026-10-16');const detail=page.getByTestId('shift-review-detail');await expect(detail.getByRole('heading',{level:2})).toContainText('Synthetic Evening');await page.getByRole('button',{name:'View unassigned records',exact:true}).click();await expect(detail.getByRole('heading',{level:2})).not.toContainText('Synthetic Evening');await expect(detail).toContainText(kind==='orders'?'Unassigned Tea':kind==='expenses'?'Unassigned expense':'Unassigned warning');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,`unassigned-${kind}-${width}.png`)});await page.getByRole('button',{name:'Back to original shift',exact:true}).click();await expect(detail.getByRole('heading',{level:2})).toContainText('Synthetic Evening');await expect(page.getByRole('button',{name:'Back to original shift',exact:true})).toHaveCount(0);console.log(`PASS ${width}px ${kind}: detail route opens actual unassigned records and returns to original shift`);await context.close();
}
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
