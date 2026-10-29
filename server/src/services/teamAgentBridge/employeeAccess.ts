import { TeamError, readTeam } from '../TeamCommunicationService'
import { userAccessV2 } from '../StaffPermissionV2Service'
import { defaultStaffPermissions } from '../StaffPermissionCatalog'
import type { BridgeGrant, CommunicationScope } from './contract'

/** Resolve the current recipient's policy, never borrow the sponsoring user's role. */
export async function audienceAllows(db:any, g:Pick<BridgeGrant,'storeId'>, scope:CommunicationScope, permission:string):Promise<boolean> {
  const people=await db.staff.findMany({where:{storeId:g.storeId,id:{in:scope.audienceStaffIds},status:'active'},select:{id:true,user:{select:{id:true,role:true,storeId:true}}}})
  if(!people.length||people.length!==scope.audienceStaffIds.length)return false
  const legacy=await db.config.findUnique({where:{storeId_key:{storeId:g.storeId,key:'staff.access.policy'}}})
  let prior:any
  try {prior=legacy?JSON.parse(legacy.value):null}catch{return false}
  for(const p of people){
    if(!p.user||p.user.storeId!==g.storeId)return false
    if(p.user.role==='admin')continue
    const access=await userAccessV2({staffId:p.id,storeId:g.storeId,role:p.user.role},db)
    if(access){if(access.modes[permission]!=='allow')return false;continue}
    const binding=prior?.assignments?.find((a:any)=>a.staffId===p.id)
    const role=binding&&prior.roles?.find((r:any)=>r.id===binding.roleId)
    const permissions=role?.permissions||defaultStaffPermissions(p.user.role)
    const sensitive:Record<string,string>={'cost.read':'finance.read','profit.read':'finance.read','staff.private.read':'staff.read','staff.bank.read':'staff.read'}
    if(!permissions.includes(permission)&&!permissions.includes(sensitive[permission]))return false
  }
  return true
}

/** These checks concern data returned by business tools, not the vocabulary of a question. */
export async function visibleBusinessData(db:any,g:Pick<BridgeGrant,'storeId'>,scope:CommunicationScope,data:any) {
  const cost=await audienceAllows(db,g,scope,'cost.read'),profit=await audienceAllows(db,g,scope,'profit.read')
  const bank=await audienceAllows(db,g,scope,'staff.bank.read')
  const salary=await audienceAllows(db,g,scope,'salary.read'),privateStaff=await audienceAllows(db,g,scope,'staff.private.read')
  const walk=(v:any):any=>{
    if(v===null||v===undefined||typeof v!=='object')return v
    if(v instanceof Date)return v.toISOString()
    if(Array.isArray(v))return v.filter(x=>salary||!x||typeof x!=='object'||!(/salary|payroll|工资|薪资/i.test(String(x.type||x.category||'')))).map(walk)
    return Object.fromEntries(Object.entries(v).filter(([k])=>
      !/password|credential|token|secret/i.test(k)&&
      (bank||!/bankAccount|bankCard/i.test(k))&&
      (cost||!/cost|purchasePrice|buyPrice|totalExpenses/i.test(k))&&
      (profit||!/profit|margin|netIncome/i.test(k))&&
      (salary||!/salary|wage|payroll/i.test(k))&&
      (privateStaff||!/idCard|identityNumber|phone|address|birthday|medical|health|leaveReason|issueDescription/i.test(k))
    ).map(([k,x])=>[k,walk(x)]))
  }
  return walk(data)
}

/** A saved configuration is the live switch. Missing settings preserve an existing installation. */
export async function assertEmployeeSettings(db:any,storeId:string) {
  const settings=await readTeam<any>(db,storeId,'ai.agent.settings')
  if(settings&&!settings.enabled)throw new TeamError(403,'EMPLOYEE_RUNTIME_DISABLED_BY_SETTINGS')
  return settings
}

export async function visibleScheduleStaff(db:any,g:Pick<BridgeGrant,'storeId'>,scope:CommunicationScope):Promise<string[]|undefined>{
  if(await audienceAllows(db,g,scope,'schedules.read'))return undefined
  if(!scope.requesterStaffId)return []
  // Self-service data may be shown to the requester and authorized supervisors,
  // never to another employee merely sharing the conversation.
  for(const staffId of scope.audienceStaffIds){
    const one={...scope,audienceStaffIds:[staffId],requesterStaffId:staffId}
    if(staffId===scope.requesterStaffId){if(!await audienceAllows(db,g,one,'personal.schedule'))return []}
    else if(!await audienceAllows(db,g,one,'schedules.read'))return []
  }
  return [scope.requesterStaffId]
}

/** Personal training is not permission to query the store's assessments/HR notes. */
export async function visibleTrainingStaff(db:any,g:Pick<BridgeGrant,'storeId'>,scope:CommunicationScope):Promise<string[]|undefined>{
  if(await audienceAllows(db,g,scope,'training.read'))return undefined
  if(!scope.requesterStaffId)return []
  for(const staffId of scope.audienceStaffIds){
    const one={...scope,audienceStaffIds:[staffId],requesterStaffId:staffId}
    if(staffId===scope.requesterStaffId){if(!await audienceAllows(db,g,one,'personal.training'))return []}
    else if(!await audienceAllows(db,g,one,'training.read'))return []
  }
  return [scope.requesterStaffId]
}
