const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({page,browser,prisma,check,base,output,assertEventually})=>{
 const origin='http://127.0.0.1:6311';
 await page.goto(origin+'/settings');
 await page.getByRole('button',{name:'Employee Permissions',exact:true}).click();await page.waitForURL('**/settings/permissions');
 await page.getByRole('button',{name:'Role templates',exact:true}).click();await page.getByRole('combobox',{name:'Role templates',exact:true}).selectOption('finance');
 await page.getByRole('button',{name:'Duplicate role',exact:true}).click();await page.getByRole('textbox',{name:'Role name',exact:true}).fill('UI Finance Draft');
 await page.getByRole('combobox',{name:'Create and edit finance records',exact:true}).selectOption('deny');await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('status').filter({hasText:'Draft saved; not active'}).waitFor();
 assert.equal(await page.getByRole('combobox',{name:'Pay salaries',exact:true}).isDisabled(),true);
 const draft=await check('GET','/api/staff-permissions?version=2&storeId=store');const role=draft.roles.find(r=>r.name==='UI Finance Draft');assert.ok(role);assert.equal(role.permissions['finance.write'],'deny');assert.equal(draft.active,false);
 await page.reload();await page.getByRole('button',{name:'Role templates',exact:true}).click();await page.getByRole('combobox',{name:'Role templates',exact:true}).selectOption(role.id);assert.equal(await page.getByRole('textbox',{name:'Role name',exact:true}).inputValue(),'UI Finance Draft');assert.equal(await page.getByRole('combobox',{name:'Create and edit finance records',exact:true}).inputValue(),'deny');
 const employee=await check('POST','/api/staff',{storeId:'store',name:'UI Access Employee',phone:'081277702222',password:'SyntheticOnly2026',role:'manager'},201);
 await page.reload();await page.getByRole('combobox',{name:'Role UI Access Employee',exact:true}).selectOption(role.id);await page.getByRole('dialog').getByRole('button',{name:'Confirm activation',exact:true}).click();
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('status').filter({hasText:'Draft saved; not active'}).waitFor();await page.reload();assert.equal(await page.getByRole('combobox',{name:'Role UI Access Employee',exact:true}).inputValue(),role.id);
 const savedDraft=await check('GET','/api/staff-permissions?version=2&storeId=store');assert.equal(savedDraft.active,false);assert.equal(savedDraft.assignments.find(a=>a.staffId===employee.id).roleId,role.id);
 const checkpoint=await prisma.config.findUnique({where:{storeId_key:{storeId:'store',key:'staff.access.policy.v2'}}});
 await page.getByRole('button',{name:'Preview and activate',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirm activation',exact:true}).click();await page.getByRole('status').filter({hasText:'Permissions activated'}).waitFor();assert.equal((await check('GET','/api/staff-permissions?version=2&storeId=store')).active,true);
 await page.getByRole('button',{name:'Change history',exact:true}).click();await page.locator('main details').first().waitFor();
 // Restore the owned fixture's inactive checkpoint before exercising legacy compatibility.
 await prisma.config.update({where:{id:checkpoint.id},data:{value:checkpoint.value}});
 fs.mkdirSync(output,{recursive:true});await page.locator('main').screenshot({path:output+'/employee-permissions.png'});
 // Until V2 activation, preserve and verify the existing read-only V1 assignment.
 const legacy=await check('GET','/api/staff-permissions'),legacyRoleId=require('node:crypto').randomUUID();await check('PUT','/api/staff-permissions',{revision:legacy.revision,roles:[{id:legacyRoleId,name:'UI Finance Reader',description:'Synthetic legacy read-only compatibility',baseRole:'manager',permissions:['finance.read']}],assignments:[{staffId:employee.id,roleId:legacyRoleId}]});
 console.log('PASS V2 draft role, denied finance mutation and owner-only salary payment control and employee assignment persist across reload without activation; explicit activation records history; inactive fixture checkpoint restored for legacy compatibility');
 // AI is part of the same settings shell, including deep-link refresh and save.
 await page.getByRole('button',{name:'AI permissions',exact:true}).click();await page.waitForURL('**/settings/ai');
 await page.getByRole('button',{name:'Employee Permissions',exact:true}).waitFor();
 const aiBefore=await check('GET','/api/ai/permissions/store');assert.equal(aiBefore.executionEnabled,false);
 await page.getByLabel('Sales summaries',{exact:true}).check();await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByRole('status').filter({hasText:/draft|saved/i}).waitFor();
 await page.reload();assert.equal(await page.getByLabel('Sales summaries',{exact:true}).isChecked(),true);
 assert.equal((await check('GET','/api/ai/permissions/store')).executionEnabled,false);
 await page.locator('main').screenshot({path:output+'/ai-in-settings.png'});
 await page.getByRole('button',{name:'POS',exact:true}).click();await page.waitForURL('**/settings/pos');
 await page.getByRole('button',{name:'Employee Permissions',exact:true}).waitFor();await page.reload();
 await page.getByRole('button',{name:'Employee Permissions',exact:true}).waitFor();
 console.log('PASS real settings UI: common navigation, AI draft remains disabled, POS and AI deep links retain shell; custom role and employee assignment survive reload, history visible');
 const jwt=require('jsonwebtoken'),staff=await prisma.staff.findUnique({where:{id:employee.id},include:{user:true}}),token=jwt.sign({id:staff.userId,role:staff.user.role,storeId:'store',staffId:staff.id,issuedAtMs:Date.now()+100},process.env.JWT_SECRET,{expiresIn:'10m'});
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 await context.addInitScript(({token,staff})=>{sessionStorage.setItem('auth-storage',JSON.stringify({state:{token,user:{id:staff.userId,role:'manager',storeId:'store',staff:{id:staff.id,name:staff.name,position:'manager'}},isAuthenticated:true},version:0}));localStorage.setItem('bubble-tea-language','en')},{token,staff});
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();const response=await route.fetch({url:base+u.pathname+u.search});await route.fulfill({response})});
 try {
  const reader=await context.newPage();const errors=[];reader.on('pageerror',e=>errors.push(e.message));await reader.goto(origin+'/finance/expenses');
  await reader.getByText('Your role can view this page; adding, editing and deleting are disabled.',{exact:true}).waitFor();
  assert.equal(await reader.getByRole('button',{name:'Add Expense',exact:true}).isDisabled(),true);
  const nav=reader.locator('aside nav');assert.equal(await nav.getByRole('link',{name:'Finance',exact:true}).count(),1);assert.equal(await nav.getByRole('link',{name:'Settings',exact:true}).count(),0);assert.equal(await nav.getByRole('link',{name:'Inventory',exact:true}).count(),0);
  const forbidden=await reader.evaluate(async()=>{const token=JSON.parse(sessionStorage.getItem('auth-storage')).state.token;return (await fetch('/api/expenses',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({type:'operational',category:'other',amount:5300000,date:'2026-10-08'})})).status});assert.equal(forbidden,403);
  await reader.locator('main').screenshot({path:output+'/read-only-finance.png'});assert.deepEqual(errors,[]);
 }finally{await context.close()}
 const current=await check('GET','/api/staff-permissions');await check('PUT','/api/staff-permissions',{revision:current.revision,roles:[],assignments:[]});
 console.log('PASS real read-only employee UI: restricted navigation, disabled expense mutation controls and direct API 403');
};
