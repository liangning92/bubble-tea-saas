const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true});
try{
const context=await browser.newContext();
await context.addInitScript(()=>{
 sessionStorage.setItem('auth-storage',JSON.stringify({state:{token:'synthetic',user:{id:'admin',phone:'0000000000',role:'admin',storeId:null,staff:null},isAuthenticated:true},version:0}));
 localStorage.setItem('bubble-tea-language','en');
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
assert.equal(await page.locator('#staff-position').inputValue(),'店员');
assert.equal(await page.locator('#staff-hireDate').inputValue(),'2026-10-02');
await page.locator('#staff-address').fill('Saved Address');
await page.getByRole('button',{name:'Save',exact:true}).click();
await page.getByText('Saved successfully',{exact:true}).waitFor();
assert.equal(puts.length,1);assert.equal(puts[0].address,'Saved Address');
for(const key of ['storeId','phone','role','password'])assert.ok(!(key in puts[0]),key);
assert.equal(puts[0].baseSalary,3000000);assert.equal(puts[0].hourlyRate,0);assert.equal(puts[0].weeklyHours,0);
await page.reload();await page.getByText('Saved Address',{exact:true}).waitFor();
await page.goto(origin+'/staff/employee/edit');await page.locator('#staff-name').waitFor();
failSave=true;await page.locator('#staff-name').fill('Unsaved Name');await page.getByRole('button',{name:'Save',exact:true}).click();
await page.getByRole('alert').filter({hasText:'Synthetic save failed'}).waitFor();assert.equal(await page.locator('#staff-name').inputValue(),'Unsaved Name');
failSave=false;await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForURL('**/staff/employee');await page.getByRole('heading',{name:'Unsaved Name'}).waitFor();
failGet=true;await page.reload();await page.getByRole('button',{name:'↻',exact:true}).waitFor({timeout:20000});assert.equal(await page.getByRole('button',{name:'Edit',exact:true}).count(),0);
assert.deepEqual(errors,[]);
console.log('PASS complete details, inline edit, custom legacy position, global admin without store, zero salary/hour fields, Jakarta hire date, save and reload, direct edit, failure retains input, load error prevents editing');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
