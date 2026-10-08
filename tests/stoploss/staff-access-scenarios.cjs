const assert=require('node:assert/strict'),crypto=require('node:crypto');
module.exports=async({prisma,check,call})=>{
 const jwt=require('jsonwebtoken');
 const employee=await check('POST','/api/staff',{storeId:'store',name:'Access Fixture Manager',phone:'081277701111',password:'SyntheticOnly2026',role:'manager'},201);
 const employeeUserId=(await prisma.staff.findUnique({where:{id:employee.id}})).userId;
 async function token(){const s=await prisma.staff.findUnique({where:{id:employee.id},include:{user:true}});return jwt.sign({id:s.userId,role:s.user.role,storeId:s.storeId,staffId:s.id,issuedAtMs:Date.now()+100},process.env.JWT_SECRET,{expiresIn:'15m'})}
 let managerToken=await token();let settings=await check('GET','/api/staff-permissions');assert.equal(settings.roles.length,0);
 assert.equal((await check('GET','/api/staff-permissions/me',undefined,200,managerToken)).role,null);
 const id=crypto.randomUUID(),role={id,name:'Finance reader fixture',description:'Synthetic',baseRole:'manager',permissions:['finance.read','personal.salary','personal.profile']};
 let state=await check('PUT','/api/staff-permissions',{revision:settings.revision,roles:[role],assignments:[{staffId:employee.id,roleId:id}]});
 assert.equal((await check('GET','/api/staff-permissions/me',undefined,200,managerToken)).role.name,role.name);
 await check('GET','/api/expenses',undefined,200,managerToken);
 const count=await prisma.expense.count();await check('POST','/api/expenses',{type:'operational',category:'other',amount:5300000,date:'2026-10-08'},403,managerToken);assert.equal(await prisma.expense.count(),count);
 await check('GET','/api/salaries',undefined,403,managerToken);await check('GET','/api/staff',undefined,403,managerToken);
 await check('POST','/api/staff',{storeId:'store',name:'Denied account',phone:'081277709999',password:'SyntheticOnly2026',role:'manager'},403,managerToken);
 await check('PUT','/api/staff-permissions',{revision:state.revision,roles:[],assignments:[]},403,managerToken);
 await check('POST','/api/config',{storeId:'store',key:'staff.access.policy',value:{},category:'staff'},403,managerToken);
 await check('GET','/api/config/store/staff.access.policy',undefined,403);
 const configs=await check('GET','/api/config',undefined,200,managerToken);assert.ok(!Object.hasOwn(configs,'staff.access.policy'));
 await check('GET','/api/staff/salary/my?staffId=foreign-employee-staff&month=10&year=2026',undefined,403,managerToken);
 // No full role/assignment policy is exposed to an employee.
 const me=await check('GET','/api/staff-permissions/me',undefined,200,managerToken);assert.ok(!me.assignments&&!me.staff);
 await check('PUT','/api/staff-permissions',{revision:state.revision,roles:[role],assignments:[{staffId:'foreign-employee-staff',roleId:id}]},400);
 assert.equal((await check('GET','/api/staff-permissions')).revision,state.revision);
 await check('PUT','/api/staff-permissions',{revision:state.revision,roles:[],assignments:[{staffId:employee.id,roleId:id}]},400);
 await check('PUT','/api/staff-permissions',{revision:state.revision,roles:[role,{...role,id:crypto.randomUUID(),name:role.name.toUpperCase()}],assignments:state.assignments},400);
 await check('PUT','/api/staff-permissions',{revision:state.revision,roles:[{...role,permissions:['fake.grant']}],assignments:state.assignments},400);
 await check('PUT','/api/staff-permissions',{revision:state.revision,roles:[{...role,baseRole:'cashier',permissions:['finance.write']}],assignments:state.assignments},400);
 // Permission-only updates retain the login, but apply immediately on the next request.
 state=await check('PUT','/api/staff-permissions',{revision:state.revision,roles:[{...role,permissions:['personal.salary']}],assignments:state.assignments});
 await check('GET','/api/expenses',undefined,403,managerToken);
 await check('PUT','/api/staff-permissions',{revision:state.revision-1,roles:[role],assignments:state.assignments},409);
 // A base-role change invalidates the existing JWT instead of retaining its old powers.
 state=await check('PUT','/api/staff-permissions',{revision:state.revision,roles:[{...role,baseRole:'cashier',permissions:['pos.expense','personal.salary']}],assignments:state.assignments});
 await check('GET','/api/staff-permissions/me',undefined,401,managerToken);const cashierToken=await token();
 await check('PUT','/api/expenses/categories',{categories:[{key:'access-fixture-supplies',label:'Access fixture supplies'}]});
 const categories=(await check('GET','/api/expenses/categories',undefined,200,cashierToken)).list;
 const expense=await check('POST','/api/expenses',{type:'operational',category:categories[0].key,amount:53000,description:'Access fixture legacy POS expense'},201,cashierToken);
 assert.equal((await prisma.expense.findUnique({where:{id:expense.id}})).amount,5300000);
 await prisma.expense.update({where:{id:expense.id},data:{createdAt:new Date(Date.now()-3600000)}});
 await check('GET','/api/expenses/pos',undefined,200,cashierToken);await check('POST','/api/orders',{storeId:'store'},403,cashierToken);
 // Removing the custom assignment restores exactly the original system role.
 state=await check('PUT','/api/staff-permissions',{revision:state.revision,roles:state.roles,assignments:[]});
 assert.equal((await prisma.user.findUnique({where:{id:employeeUserId}})).role,'manager');
 const baselineToken=await token();assert.equal((await check('GET','/api/staff-permissions/me',undefined,200,baselineToken)).role,null);
 // The old employee-detail role editor must not leave a stale custom binding.
 state=await check('PUT','/api/staff-permissions',{revision:state.revision,roles:[role],assignments:[{staffId:employee.id,roleId:id}]});
 await check('PUT','/api/staff/'+employee.id+'/role',{role:'staff'});
 state=await check('GET','/api/staff-permissions');assert.ok(!state.assignments.some(a=>a.staffId===employee.id));
 assert.equal((await check('GET','/api/staff-permissions/me',undefined,200,await token())).role,null);
 assert.ok(state.history.length>=5);
 const personalRole={id:crypto.randomUUID(),name:'Personal employee fixture',description:'',baseRole:'staff',permissions:state.templates.find(p=>p.baseRole==='staff').permissions};
 state=await check('PUT','/api/staff-permissions',{revision:state.revision,roles:[personalRole],assignments:[{staffId:'worker-staff',roleId:personalRole.id}]});
 const workerToken=jwt.sign({id:'worker-user',role:'staff',storeId:'store',staffId:'worker-staff',issuedAtMs:Date.now()+100},process.env.JWT_SECRET,{expiresIn:'10m'});
 for(const path of ['/staff/salary/my?month=10&year=2026','/staff/attendance/today?staffId=worker-staff','/staff/attendance/history?staffId=worker-staff&month=10&year=2026','/staff/schedule/my?weekStart=2026-10-05','/leave/my','/leave/balance','/training/my','/training/categories','/staff-points/my','/staff-points/logs/my','/staff-points/rewards/available','/deposit/staff/my','/deposit/rules','/notifications','/reimbursement/my','/hygiene/tasks/my','/overtime/my','/shift-swap/my','/staff-correction/my','/inventory','/inventory-counts','/products','/attendance-rules'])await check('GET','/api'+path,undefined,200,workerToken);
 const ownTask=await prisma.hygieneTask.create({data:{storeId:'store',staffId:'worker-staff',areaCode:'bar',name:'Own access task',date:'2026-10-08',time:'08:00'}});
 const otherTask=await prisma.hygieneTask.create({data:{storeId:'store',staffId:'staff',areaCode:'bar',name:'Other access task',date:'2026-10-08',time:'08:00'}});
 await check('GET','/api/hygiene/tasks/'+ownTask.id,undefined,200,workerToken);
 await check('GET','/api/hygiene/tasks/'+otherTask.id,undefined,403,workerToken);await check('PUT','/api/hygiene/tasks/'+otherTask.id+'/start',{},403,workerToken);
 assert.equal((await prisma.hygieneTask.findUnique({where:{id:otherTask.id}})).status,'pending');
 const foreignMessage=await prisma.notification.create({data:{storeId:'foreign',type:'system',title:'Foreign access message',message:'Synthetic only'}});
 await check('PUT','/api/notifications/'+foreignMessage.id+'/read',{},404,workerToken);assert.equal((await prisma.notification.findUnique({where:{id:foreignMessage.id}})).status,foreignMessage.status);
 const record=await prisma.config.findUnique({where:{storeId_key:{storeId:'store',key:'staff.access.policy'}}});
 await prisma.config.update({where:{id:record.id},data:{value:'malformed'}});await check('GET','/api/staff-permissions/me',undefined,503,workerToken);await check('GET','/api/products',undefined,503,workerToken);await check('GET','/api/expenses');
 await prisma.config.update({where:{id:record.id},data:{value:record.value}});
 console.log('PASS custom employee App template: 23 personal/POS data reads, own-task access, other-task denial, cross-store message denial and corrupted-policy fail-closed');
 state=await check('PUT','/api/staff-permissions',{revision:state.revision,roles:[],assignments:[]});
 console.log('PASS custom staff roles: persistence, read-only denial, denied account creation, same-session revocation, stale revision, cross-store/personal scope, template ceiling, protected config, JWT invalidation, original-role restore and legacy editor coherence');
};
