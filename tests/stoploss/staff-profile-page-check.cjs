const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true});
try{
const context=await browser.newContext();
await context.addInitScript(()=>{
 sessionStorage.setItem('auth-storage',JSON.stringify({state:{token:'synthetic',user:{id:'admin',phone:'0000000000',role:'admin',storeId:null,staff:null},isAuthenticated:true},version:0}));
 if(!localStorage.getItem('bubble-tea-language'))localStorage.setItem('bubble-tea-language','en');
});
let employee={id:'employee',storeId:'store',name:'Profile Regression',employeeNumber:'1007',position:'店员',phone:'081234567890',role:'cashier',status:'active',employmentType:'part_time',baseSalary:3000000,hourlyRate:0,weeklyHours:0,email:'profile@example.test',address:'Profile Address',emergencyContact:'Contact Person',emergencyPhone:'08999999999',bankName:'Profile Bank',bankAccount:'1234567890',hireDate:'2026-10-01T17:00:00Z',terminationDate:null,probation:{enabled:true,status:'probation',confirmationDate:'2026-11-02',overrideConfirmationDate:null},attendances:[],salaries:[]};
let failSave=false,failGet=false,puts=[];
await context.route('**/api/**',async route=>{
 const req=route.request(),url=new URL(req.url());let data={};
 if(url.pathname==='/api/staff/employee'){
  if(req.method()==='PUT'){
   const body=req.postDataJSON();puts.push(body);
   if(failSave)return route.fulfill({status:400,json:{code:400,message:'Synthetic save failed'}});
   employee={...employee,...body};data=employee;
  }else{if(failGet)return route.fulfill({status:503,json:{code:503,message:'Synthetic load failed'}});data=employee;}
 }else if(url.pathname.includes('probation-rule'))data={enabled:true};
 else if(url.pathname==='/api/auth/me')data={id:'admin',role:'admin',storeId:null};
 else if(url.pathname==='/api/staff')data={list:[employee]};
 return route.fulfill({json:{code:200,data}});
});
const page=await context.newPage();let errors=[];page.on('pageerror',e=>errors.push(e.message));
const origin=process.env.PROFILE_ORIGIN||'http://127.0.0.1:5191';
await page.goto(origin+'/staff/employee');
await page.getByRole('heading',{name:'Profile Regression'}).waitFor();
for(const text of ['1007','profile@example.test','Profile Address','Contact Person','Profile Bank','1234567890','3.000.000','2026-11-02'])assert.ok((await page.locator('body').innerText()).includes(text),text);
await page.getByRole('button',{name:'Edit',exact:true}).first().click();
assert.equal(await page.locator('#staff-access-role').inputValue(),'__account__');
assert.ok(await page.locator('#staff-access-role').isDisabled());
assert.equal(await page.locator('#staff-access-role option:checked').innerText(),'Cashier');
assert.equal(await page.locator('#staff-hireDate').inputValue(),'02/10/2026');
await page.locator('#staff-address').fill('Saved Address');
await page.getByRole('button',{name:'Save',exact:true}).click();
await page.getByText('Saved successfully',{exact:true}).waitFor();
assert.equal(puts.length,1);assert.equal(puts[0].address,'Saved Address');
for(const key of ['storeId','phone','role','password','position','accessRole','accessRoles'])assert.ok(!(key in puts[0]),key);
assert.equal(puts[0].baseSalary,3000000);assert.equal(puts[0].hourlyRate,0);assert.equal(puts[0].weeklyHours,0);
await page.reload();await page.getByText('Saved Address',{exact:true}).waitFor();
await page.goto(origin+'/staff/employee/edit');await page.locator('#staff-name').waitFor();
failSave=true;await page.locator('#staff-name').fill('Unsaved Name');await page.getByRole('button',{name:'Save',exact:true}).click();
await page.getByRole('alert').filter({hasText:'Synthetic save failed'}).waitFor();assert.equal(await page.locator('#staff-name').inputValue(),'Unsaved Name');
failSave=false;await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForURL('**/staff/employee');await page.getByRole('heading',{name:'Unsaved Name'}).waitFor();
failGet=true;await page.reload();await page.getByRole('button',{name:'↻',exact:true}).waitFor({timeout:20000});assert.equal(await page.getByRole('button',{name:'Edit',exact:true}).count(),0);
failGet=false;
const roles=[['manager','店长','Manajer toko'],['cashier','收银员','Kasir'],['production','制作员','Produksi'],['inventory','库管员','Petugas stok'],['finance','财务员','Akuntan'],['basic','普通员工','Karyawan']];
for(const language of ['zh','id']) {
 await page.evaluate(language=>localStorage.setItem('bubble-tea-language',language),language);
 for(const [roleId,zh,idLabel] of roles) {
  const label=language==='zh'?zh:idLabel;
  employee={...employee,role:'cashier',accessRole:{id:roleId,name:zh},accessRoleSelection:roleId,accessRoles:[{id:'',name:'普通员工'},...roles.map(([id,name])=>({id,name}))]};
  await page.goto(origin+'/staff/employee/edit');
  await page.locator('#staff-access-role').waitFor();
  assert.ok(await page.locator('#staff-access-role').isDisabled());
  assert.equal(await page.locator('#staff-access-role option:checked').innerText(),label);
  assert.equal(await page.locator('#staff-access-role option').count(),7);
  const prior={role:employee.role,accessRole:employee.accessRole,baseSalary:employee.baseSalary,hourlyRate:employee.hourlyRate,weeklyHours:employee.weeklyHours,position:employee.position};
  await page.locator('button[type=submit]').click();await page.waitForURL('**/staff/employee');
  assert.ok((await page.locator('body').innerText()).includes(label));
  for(const [key,value] of Object.entries(prior))assert.deepEqual(employee[key],value,key);
  await page.goto(origin+'/staff');
  await page.getByText(employee.name,{exact:true}).waitFor();
  assert.equal(await page.locator('tbody tr').first().locator('td').nth(3).innerText(),label);
 }
}
for(const [width,height] of [[1440,1000],[768,1024],[390,844]]){
 await page.setViewportSize({width,height});await page.goto(origin+'/staff/employee/edit');await page.locator('#staff-access-role').waitFor();
 await page.screenshot({path:require('node:path').resolve('output/staff-profile-role-'+width+'.png'),fullPage:true});
 assert.ok(await page.locator('#staff-access-role').isVisible());
}
assert.deepEqual(errors,[]);
console.log('PASS complete details, inline edit, custom legacy position, global admin without store, zero salary/hour fields, Jakarta hire date, save and reload, direct edit, failure retains input, load error prevents editing');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
