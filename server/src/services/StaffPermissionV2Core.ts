import { z } from 'zod'
import { STAFF_BASIC_PERMISSIONS, STAFF_PERMISSION_CATALOG } from './StaffPermissionCatalog'
export type AccessMode = 'allow' | 'deny' | 'approval'
export const modeSchema=z.enum(['allow','deny','approval'])
const extra=[['orders.refund.request','pos'],['orders.refund.approve','pos'],['production.read','pos'],['production.write','pos'],['members.balance','members'],['orders.discount','pos'],['approvals.approve','other'],['salary.pay','staff'],['staff.bank.read','staff'],['staff.private.read','staff'],['cost.read','inventory'],['profit.read','finance'],['data.export','other']] as const
export const permissionCatalog=[...STAFF_PERMISSION_CATALOG.map(p=>({key:p.key,group:p.group})),...extra.map(([key,group])=>({key,group}))].map(p=>({...p,ownerOnly:['salary.pay','products.manage'].includes(p.key),sensitive:['orders.refund','members.balance','orders.discount'].includes(p.key),scope:p.key.startsWith('personal.')?'self':'store',dependencies:p.key==='prices.write'?['products.read']:['inventory.count','inventory.stockIn','inventory.stockOut'].includes(p.key)?['inventory.read','products.read']:p.key.endsWith('.write')?[p.key.replace(/\.write$/,'.read')]:p.key==='orders.refund'?['orders.read']:p.key==='orders.refund.approve'?['orders.read','approvals.approve']:p.key==='members.balance'?['members.read']:p.key==='orders.discount'?['orders.create']:p.key==='salary.pay'?['salary.read']:[]}))
const keys=new Set<string>(permissionCatalog.map(p=>p.key))
export interface AccessRoleV2 {id:string;name:string;description:string;permissions:Record<string,AccessMode>}
export interface AccessBindingV2 {staffId:string;roleId:string|null;overrides:Record<string,AccessMode>}
export interface PolicyV2 {version:2;revision:number;active:boolean;roles:AccessRoleV2[];assignments:AccessBindingV2[]}
const permissionsSchema=z.record(modeSchema).refine(p=>Object.keys(p).every(k=>keys.has(k)),'UNKNOWN_PERMISSION').refine(p=>['salary.pay','products.manage'].every(k=>p[k]===undefined||p[k]==='deny'),'OWNER_ONLY_PERMISSION').refine(p=>Object.entries(p).every(([k,v])=>v!=='approval'||permissionCatalog.find(x=>x.key===k)?.sensitive),'INVALID_APPROVAL_PERMISSION')
export const policyInputV2=z.object({version:z.literal(2),revision:z.number().int().nonnegative(),roles:z.array(z.object({id:z.string().min(1).max(80),name:z.string().trim().min(1).max(60),description:z.string().max(300).default(''),permissions:permissionsSchema}).strict()).max(100),assignments:z.array(z.object({staffId:z.string().min(1),roleId:z.string().nullable(),overrides:permissionsSchema.default({})}).strict()).max(2000)}).strict()
const personal=Object.fromEntries(permissionCatalog.filter(p=>p.key.startsWith('personal.')).map(p=>[p.key,'allow'])) as Record<string,AccessMode>
const grants=(list:string[],sensitive:string[]=[])=>({...personal,...Object.fromEntries(list.map(k=>[k,'allow'])),...Object.fromEntries(sensitive.map(k=>[k,'approval']))}) as Record<string,AccessMode>
export const defaultRolesV2:AccessRoleV2[]=[
 {id:'manager',name:'店长',description:'本店业务与审批；工资、成本、利润需单独授权',permissions:grants(['products.read','inventory.read','inventory.write','inventory.count','inventory.stockIn','inventory.stockOut','purchases.read','purchases.write','orders.read','orders.create','orders.cancel','orders.status','production.read','production.write','pos.shift','pos.cash','pos.expense','members.read','members.write','orders.refund','orders.refund.request','orders.refund.approve','members.balance','orders.discount','approvals.approve','staff.read','attendance.read','attendance.write','schedules.read','schedules.write','hygiene.read','hygiene.write','training.read','training.write','notifications.read'])},
 {id:'cashier',name:'收银员',description:'收银和本人班次；敏感操作需授权',permissions:grants(['products.read','orders.read','orders.create','orders.cancel','pos.shift','pos.cash','pos.expense','members.read','members.write','orders.refund.request'],['orders.refund','members.balance','orders.discount'])},
 {id:'production',name:'制作员',description:'制作订单、状态与本人任务',permissions:grants(['products.read','production.read','production.write'])},
 {id:'inventory',name:'库管员',description:'库存、盘点及出入库；不开放成本',permissions:grants(['products.read','inventory.read','inventory.count','inventory.stockIn','inventory.stockOut'])},
 {id:'finance',name:'财务员',description:'财务及工资草稿；发放由老板负责',permissions:grants(['finance.read','finance.write','salary.read','salary.write','deposits.read','staff.read','data.export','cost.read','profit.read'])},
 {id:'basic',name:'普通员工',description:'本人档案、考勤、排班、工资、申请与培训',permissions:{...personal}}
]
export function effectiveAccess(policy:PolicyV2,staffId:string){
 const binding=policy.assignments.find(a=>a.staffId===staffId),role=policy.roles.find(r=>r.id===binding?.roleId)
 const base=role?.permissions||defaultRolesV2.find(r=>r.id==='basic')!.permissions
 const modes:Record<string,AccessMode>={},sources:Record<string,string>={}
 for(const p of permissionCatalog){modes[p.key]=binding?.overrides[p.key]??base[p.key]??'deny';sources[p.key]=binding?.overrides[p.key]?'personal':role?'role':'basic'}
 // Self-service stays available even when old templates or overrides deny it.
 for(const key of STAFF_BASIC_PERMISSIONS){modes[key]='allow';sources[key]='basic'}
 return {version:2 as const,id:role?.id||'basic',name:role?.name||'普通员工',baseRole:'staff',permissions:Object.keys(modes).filter(k=>modes[k]==='allow'),modes,sources,scopes:Object.fromEntries(permissionCatalog.map(p=>[p.key,p.scope])),revision:policy.revision}
}
export function validatePolicyV2(input:ReturnType<typeof policyInputV2.parse>){
 if(new Set(input.roles.map(r=>r.id)).size!==input.roles.length||new Set(input.roles.map(r=>r.name.toLocaleLowerCase())).size!==input.roles.length)throw new Error('STAFF_ACCESS_DUPLICATE_ROLE')
 if(new Set(input.assignments.map(a=>a.staffId)).size!==input.assignments.length)throw new Error('STAFF_ACCESS_DUPLICATE_ASSIGNMENT')
 const policy={...input,active:false} as PolicyV2
 for(const a of input.assignments){if(a.roleId&&!input.roles.some(r=>r.id===a.roleId))throw new Error('STAFF_ACCESS_INVALID_ROLE');const access=effectiveAccess(policy,a.staffId);for(const p of permissionCatalog)if(access.modes[p.key]!=='deny')for(const dependency of p.dependencies)if(access.modes[dependency]!=='allow')throw new Error('STAFF_ACCESS_DEPENDENCY:'+p.key+':'+dependency)}
 for(const r of input.roles)for(const p of permissionCatalog)if(r.permissions[p.key]&&r.permissions[p.key]!=='deny')for(const dependency of p.dependencies)if(r.permissions[dependency]!=='allow')throw new Error('STAFF_ACCESS_DEPENDENCY:'+p.key+':'+dependency)
 return policy
}
export function redactAccessData(value:any,access:ReturnType<typeof effectiveAccess>,personal=false):any {
 if(Array.isArray(value))return value.map(v=>redactAccessData(v,access,personal)).filter(v=>v!==undefined)
 if(!value||typeof value!=='object'||value instanceof Date)return value
 if(!personal&&access.modes['salary.read']!=='allow'&&(value.type==='salary'||value.category==='salary'||/salary|payroll/i.test(value.entityType||'')))return undefined
 const result:any={}
 for(const [key,v]of Object.entries(value)){
  if(/^(bankName|bankAccount)$/.test(key)&&!personal&&access.modes['staff.bank.read']!=='allow')continue
  if(/^(address|emergencyContact|emergencyPhone)$/.test(key)&&!personal&&access.modes['staff.private.read']!=='allow')continue
  if(/salary|salaries|hourlyRate|probation|confirmationDate/i.test(key)&&!(personal?access.modes['personal.salary']==='allow':access.modes['salary.read']==='allow'))continue
  if(/cost|purchasePrice|supplierPrice/i.test(key)&&access.modes['cost.read']!=='allow')continue
  if(/profit|margin/i.test(key)&&access.modes['profit.read']!=='allow')continue
  if(['metadata','oldValue','newValue'].includes(key)&&typeof v==='string'&&/^[\[{]/.test(v)){try{result[key]=JSON.stringify(redactAccessData(JSON.parse(v),access,personal));continue}catch{}}
  result[key]=redactAccessData(v,access,personal)
 }
 return result
}
