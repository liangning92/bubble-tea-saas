import {canUseManagementRoute} from '../services/ManagementRouteAccess'
import {isEmployeeAppRoute} from '../services/EmployeeAppAccess'
import {ACCESS_ROUTE_MANIFEST} from '../services/StaffPermissionRouteManifest'
import {redactAccessData} from '../services/StaffPermissionV2Core'
import prisma from '../config/database'
// Declarations attach to the concrete Express route, not the requested URL.
export function declareAccessRoutes(base:string,router:any){
 for(const layer of router.stack||[]){const route=layer.route;if(!route)continue;const path=base+(route.path==='/'?'':route.path);const specs=Object.fromEntries(Object.keys(route.methods).map(method=>[method,{...(ACCESS_ROUTE_MANIFEST[method.toUpperCase()+' '+path]||{permission:'__unclassified__',ownerOnly:false,export:false,personal:false}),routeKey:method.toUpperCase()+' '+path}]));route.accessSpecs=specs;const methods={...route.methods};route.all(async(req:any,res:any,next:any)=>{
  req.accessDeclaration=specs[req.method.toLowerCase()]||specs.get
  try {
   if(req.user && !canUseManagementRoute(req.user,req.accessDeclaration))return res.status(403).json({code:403,message:'MANAGEMENT_ACCESS_REQUIRED'})
   if(req.user?.accessRole?.version===2){const denied=await enforceAccessV2(req,res,req.user);if(denied)return denied}
   next()
  } catch(error){next(error)}
 });const guard=route.stack.pop();route.methods=methods;route.stack.unshift(guard)}
 router.use((req:any,_res:any,next:any)=>{const find=(stack:any[],path:string):any=>{for(const layer of stack){if(!layer.match(path))continue;if(layer.route&&(layer.route.methods[req.method.toLowerCase()]||req.method==='HEAD'&&layer.route.methods.get))return layer.route.accessSpecs?.[req.method==='HEAD'?'get':req.method.toLowerCase()];if(layer.handle?.stack){const found=find(layer.handle.stack,path.slice(layer.path.length)||'/');if(found)return found}}};req.accessDeclaration=find(router.stack.filter((x:any)=>x!==router.stack[0]),req.path);next()});const entry=router.stack.pop();router.stack.unshift(entry);return router
}
export async function enforceAccessV2(req:any,res:any,user:any){
 const access=user.accessRole,spec=req.accessDeclaration
 if(!spec)return res.status(403).json({code:403,message:'STAFF_ACCESS_UNDECLARED_ROUTE'})
 if(user.employeeApp){
  if(!isEmployeeAppRoute(spec.routeKey,spec))return res.status(403).json({code:403,message:'EMPLOYEE_APP_MANAGEMENT_ROUTE_DENIED'})
  if(spec.permission)access.modes[spec.permission]='allow'
  if(spec.export)access.modes['data.export']='allow'
 }
 const hygieneManager=!user.employeeApp&&spec.permission==='personal.tasks'&&access.id==='manager'
 const posLegacyExpense=!user.employeeApp&&user.role==='cashier'&&(spec.routeKey==='GET /api/expenses'||spec.routeKey==='POST /api/expenses')
 const permission=posLegacyExpense?'pos.expense':hygieneManager?(['GET','HEAD'].includes(req.method)?'hygiene.read':'hygiene.write'):spec.permission
 const scopeSelf=(spec.personal||user.employeeApp&&spec.routeKey==='GET /api/auth/me')&&!hygieneManager
 if(spec.ownerOnly)return res.status(403).json({code:403,message:'STAFF_ACCESS_OWNER_REQUIRED'})
 if(permission&&access.modes[permission]!=='allow')return res.status(403).json({code:403,message:access.modes[permission]==='approval'?'STAFF_ACCESS_APPROVAL_REQUIRED':'STAFF_ACCESS_PERMISSION_DENIED',permission})
 if(spec.export&&access.modes['data.export']!=='allow')return res.status(403).json({code:403,message:'STAFF_ACCESS_PERMISSION_DENIED',permission:'data.export'})
 if(spec.resource&&req.params[spec.resource.param]){const row=await (prisma as any)[spec.resource.model].findUnique({where:{id:req.params[spec.resource.param]},select:spec.resource.model==='salary'?{staff:{select:{storeId:true}}}:spec.resource.model==='hygieneTask'?{storeId:true,staffId:true}:{storeId:true}});const storeId=row?.storeId||row?.staff?.storeId;if(scopeSelf&&row?.staffId&&row.staffId!==user.staffId)return res.status(403).json({code:403,message:'STAFF_ACCESS_PERSONAL_SCOPE_DENIED'});if(!row||storeId!==user.storeId)return res.status(404).json({code:404,message:'STAFF_ACCESS_TARGET_NOT_FOUND'})}
 if(spec.export&&req.baseUrl.startsWith('/api/finance/reports')&&['cost.read','profit.read','salary.read'].some(key=>access.modes[key]!=='allow'))return res.status(403).json({code:403,message:'STAFF_ACCESS_SENSITIVE_EXPORT_DENIED'})

 if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!req.baseUrl.startsWith('/api/staff-permissions')){
  const bodies=Array.isArray(req.body)?req.body:[req.body];
  for(const body of bodies){if(!body||typeof body!=='object')continue;if(permission==='orders.create'&&body.staffId&&body.staffId!==user.staffId)return res.status(403).json({code:403,message:'STAFF_ACCESS_ACTOR_MISMATCH'});for(const [field,model]of [['memberId','member'],['staffId','staff'],['orderId','order'],['inventoryId','inventory'],['productId','product']]){if(typeof body[field]!=='string'||!body[field])continue;const target=await (prisma as any)[model].findUnique({where:{id:body[field]},select:{storeId:true}});if(!target||target.storeId!==user.storeId)return res.status(404).json({code:404,message:'STAFF_ACCESS_TARGET_NOT_FOUND'})}}
 }
 if(scopeSelf||user.employeeApp){const ids=[req.query.staffId,req.body?.staffId,req.params.staffId].filter(Boolean);if(ids.some(id=>id!==user.staffId))return res.status(403).json({code:403,message:'STAFF_ACCESS_PERSONAL_SCOPE_DENIED'})}
 // All identity updates and payroll writes have independent field grants.
 if(spec.permission==='staff.write'){
  const fields=Object.keys(req.body||{}),denied=(fields.some(k=>/salary|hourlyRate|probation|confirmationDate/i.test(k))&&access.modes['salary.write']!=='allow')||(fields.some(k=>/^bank/.test(k))&&access.modes['staff.bank.read']!=='allow')||(fields.some(k=>['address','emergencyContact','emergencyPhone'].includes(k))&&access.modes['staff.private.read']!=='allow')
  if(denied)return res.status(403).json({code:403,message:'STAFF_ACCESS_SENSITIVE_FIELD_DENIED'})
  if(req.body?.role==='admin')return res.status(403).json({code:403,message:'STAFF_ACCESS_OWNER_REQUIRED'})
 }
 if(spec.permission==='orders.cancel'&&req.params.id){const order=await prisma.order.findUnique({where:{id:req.params.id},select:{storeId:true,status:true}});if(!order||order.storeId!==user.storeId)return res.status(404).json({code:404,message:'Order not found'});if(order.status!=='suspended')return res.status(409).json({code:409,message:'PAID_ORDER_REQUIRES_REFUND'})}
 if(req.baseUrl.startsWith('/api/staff-permissions'))return null
 const original=res.json.bind(res);res.json=(data:any)=>original(redactAccessData(data,access,!!scopeSelf))
 return null
}
