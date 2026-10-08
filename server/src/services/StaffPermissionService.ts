import { z } from 'zod'
import prisma from '../config/database'
import { STAFF_PERMISSION_CATALOG, defaultStaffPermissions, StaffBaseRole } from './StaffPermissionCatalog'

export const STAFF_ACCESS_KEY = 'staff.access.policy'
const baseRole = z.enum(['manager','cashier','staff'])
const roleSchema = z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(60),description:z.string().trim().max(300).default(''),baseRole,permissions:z.array(z.string()).max(100)}).strict()
export const staffAccessInput = z.object({revision:z.number().int().nonnegative(),roles:z.array(roleSchema).max(100),assignments:z.array(z.object({staffId:z.string().min(1),roleId:z.string().uuid()}).strict()).max(2000)}).strict()
export interface StaffAccessRole {id:string;name:string;description:string;baseRole:StaffBaseRole;permissions:string[]}
interface Binding {staffId:string;roleId:string;originalRole:StaffBaseRole}
interface StaffAccessPolicy {revision:number;roles:StaffAccessRole[];assignments:Binding[]}
export class StaffAccessError extends Error {constructor(message:string,public status=400){super(message)}}
function parsePolicy(value?:string|null): StaffAccessPolicy {
  if (!value) return {revision:0,roles:[],assignments:[]}
  try {
    const data=JSON.parse(value)
    const core=staffAccessInput.parse({revision:data.revision,roles:data.roles,assignments:data.assignments.map((a:any)=>({staffId:a.staffId,roleId:a.roleId}))})
    return {...core,assignments:data.assignments.map((a:any)=>({...a,originalRole:baseRole.parse(a.originalRole)}))} as StaffAccessPolicy
  } catch {throw new StaffAccessError('STAFF_ACCESS_CONFIGURATION_INVALID',503)}
}
export async function readStaffAccess(storeId:string,db:any=prisma) {
  const row=await db.config.findUnique({where:{storeId_key:{storeId,key:STAFF_ACCESS_KEY}}})
  return parsePolicy(row?.value)
}
export async function assignedStaffAccess(user:{role:string;staffId?:string;storeId:string}) {
  if (user.role==='admin' || !user.staffId || !user.storeId) return null
  const policy=await readStaffAccess(user.storeId)
  const binding=policy.assignments.find(b=>b.staffId===user.staffId)
  if (!binding) return null
  const role=policy.roles.find(r=>r.id===binding.roleId)
  if (!role || role.baseRole!==user.role) throw new StaffAccessError('STAFF_ACCESS_CONFIGURATION_INVALID',503)
  return {id:role.id,name:role.name,baseRole:role.baseRole,permissions:role.permissions}
}
export async function getStaffAccessSettings(actor:{id:string;role:string;storeId:string}) {
  if (actor.role!=='admin'||!actor.storeId) throw new StaffAccessError('STAFF_ACCESS_ADMIN_REQUIRED',403)
  const policy=await readStaffAccess(actor.storeId)
  const staff=await prisma.staff.findMany({where:{storeId:actor.storeId},select:{id:true,name:true,employeeNumber:true,status:true,user:{select:{role:true}}},orderBy:{name:'asc'}})
  const audit=await prisma.financeAuditLog.findMany({where:{storeId:actor.storeId,entityType:'staff_permissions'},orderBy:{createdAt:'desc'},take:30,select:{id:true,createdAt:true,newValue:true,userId:true}})
  const actors=await prisma.staff.findMany({where:{storeId:actor.storeId,userId:{in:[...new Set(audit.map(a=>a.userId))]}},select:{userId:true,name:true}})
  const history=audit.map(a=>{const value=JSON.parse(a.newValue||'{}');return {id:a.id,createdAt:a.createdAt,actorName:actors.find(s=>s.userId===a.userId)?.name||'',revision:value.revision,roleCount:value.roles?.length||0,assignmentCount:value.assignments?.length||0}})
  return {...policy,history,staff:staff.map(s=>({...s,systemRole:s.user.role,user:undefined})),catalog:STAFF_PERMISSION_CATALOG,templates:(['manager','cashier','staff'] as const).map(role=>({baseRole:role,permissions:defaultStaffPermissions(role)}))}
}
export async function saveStaffAccessSettings(actor:{id:string;role:string;storeId:string},body:unknown) {
  if(actor.role!=='admin'||!actor.storeId)throw new StaffAccessError('STAFF_ACCESS_ADMIN_REQUIRED',403)
  const input=staffAccessInput.parse(body)
  if(new Set(input.roles.map(r=>r.id)).size!==input.roles.length || new Set(input.roles.map(r=>r.name.toLocaleLowerCase())).size!==input.roles.length)throw new StaffAccessError('STAFF_ACCESS_DUPLICATE_ROLE')
  if(new Set(input.assignments.map(a=>a.staffId)).size!==input.assignments.length)throw new StaffAccessError('STAFF_ACCESS_DUPLICATE_ASSIGNMENT')
  for(const role of input.roles){
    const ceiling=new Set(defaultStaffPermissions(role.baseRole))
    if(new Set(role.permissions).size!==role.permissions.length || role.permissions.some(p=>!ceiling.has(p)))throw new StaffAccessError('STAFF_ACCESS_INVALID_PERMISSION')
  }
  return prisma.$transaction(async tx=>{
    await tx.store.update({where:{id:actor.storeId},data:{updatedAt:new Date()}})
    const previous=await readStaffAccess(actor.storeId,tx)
    if(previous.revision!==input.revision)throw new StaffAccessError('STAFF_ACCESS_REVISION_CONFLICT',409)
    const ids=[...new Set([...previous.assignments,...input.assignments].map(a=>a.staffId))]
    const staff=await tx.staff.findMany({where:{id:{in:ids},storeId:actor.storeId},include:{user:{select:{id:true,role:true}}}})
    const bindings: Binding[]=[]
    for(const binding of input.assignments){
      const employee=staff.find(s=>s.id===binding.staffId),role=input.roles.find(r=>r.id===binding.roleId)
      if(!employee || (employee.status!=='active' && !previous.assignments.some(a=>a.staffId===binding.staffId && a.roleId===binding.roleId)) || employee.user.role==='admin' || !role)throw new StaffAccessError('STAFF_ACCESS_INVALID_EMPLOYEE')
      const old=previous.assignments.find(a=>a.staffId===binding.staffId)
      bindings.push({staffId:binding.staffId!,roleId:binding.roleId!,originalRole:old?.originalRole||baseRole.parse(employee.user.role)})
      if(employee.user.role!==role.baseRole)await tx.user.update({where:{id:employee.user.id},data:{role:role.baseRole}})
    }
    for(const binding of previous.assignments.filter(a=>!input.assignments.some(b=>b.staffId===a.staffId))){
      const employee=staff.find(s=>s.id===binding.staffId)
      if(employee && employee.user.role!=='admin' && employee.user.role!==binding.originalRole)await tx.user.update({where:{id:employee.user.id},data:{role:binding.originalRole}})
    }
    const policy:StaffAccessPolicy={revision:previous.revision+1,roles:input.roles as StaffAccessRole[],assignments:bindings}
    const record=await tx.config.upsert({where:{storeId_key:{storeId:actor.storeId,key:STAFF_ACCESS_KEY}},create:{storeId:actor.storeId,key:STAFF_ACCESS_KEY,category:'staff',value:JSON.stringify(policy)},update:{value:JSON.stringify(policy)}})
    await tx.financeAuditLog.create({data:{storeId:actor.storeId,userId:actor.id,action:'update',entityType:'staff_permissions',entityId:record.id,description:'Update custom employee roles and assignments',oldValue:JSON.stringify(previous),newValue:record.value}})
    return {revision:policy.revision,roles:policy.roles,assignments:policy.assignments.map(({originalRole,...a})=>a)}
  })
}

// The existing employee-detail system-role editor remains usable. An explicit
// administrator change removes a custom binding in the same transaction.
export async function updateStaffSystemRole(actor:{id:string;role:string;storeId:string},staffId:string,role:string) {
  if(actor.role!=='admin')throw new StaffAccessError('STAFF_ACCESS_ADMIN_REQUIRED',403)
  return prisma.$transaction(async tx=>{
    const employee=await tx.staff.findUniqueOrThrow({where:{id:staffId},select:{storeId:true,userId:true}})
    await tx.store.update({where:{id:employee.storeId},data:{updatedAt:new Date()}})
    const policy=await readStaffAccess(employee.storeId,tx)
    if(policy.assignments.some(a=>a.staffId===staffId)){
      const updated={...policy,revision:policy.revision+1,assignments:policy.assignments.filter(a=>a.staffId!==staffId)}
      const record=await tx.config.update({where:{storeId_key:{storeId:employee.storeId,key:STAFF_ACCESS_KEY}},data:{value:JSON.stringify(updated)}})
      await tx.financeAuditLog.create({data:{storeId:employee.storeId,userId:actor.id,action:'update',entityType:'staff_permissions',entityId:record.id,description:'Replace custom role with explicit system role',oldValue:JSON.stringify(policy),newValue:record.value}})
    }
    return tx.user.update({where:{id:employee.userId},data:{role}})
  })
}
