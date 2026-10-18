import { createContext, useContext } from 'react'
import { useAuthStore } from '../stores/auth'
export interface EmployeeAccess {ready:boolean;role:{name:string;permissions:string[];version?:number;modes?:Record<string,string>}|null}
export const EmployeeAccessContext=createContext<EmployeeAccess>({ready:true,role:null})
export function useEmployeePermission(permission:string,request=false) {
  const {user}=useAuthStore()
  const access=useContext(EmployeeAccessContext)
  if(user?.role==='admin')return true
  if(!access.ready)return false
  if(permission==='team.access')return !!access.role&&(access.role.permissions.includes('team.manage')||access.role.permissions.includes('team.audit'))
  if(!access.role)return true
  return access.role.permissions.includes(permission)||(request&&access.role.version===2&&access.role.modes?.[permission]==='approval')
}

export function useEmployeeNavigation(){const {user}=useAuthStore();const access=useContext(EmployeeAccessContext);return(permission:string|null)=>user?.role==='admin'||access.ready&&(permission==='team.access' ? !!access.role&&(access.role.permissions.includes('team.manage')||access.role.permissions.includes('team.audit')) : !access.role||!!permission&&access.role.permissions.includes(permission))}
