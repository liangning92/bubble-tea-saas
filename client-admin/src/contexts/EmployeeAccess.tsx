import { createContext, useContext } from 'react'
import { useAuthStore } from '../stores/auth'
export interface EmployeeAccess {ready:boolean;role:{name:string;permissions:string[]}|null}
export const EmployeeAccessContext=createContext<EmployeeAccess>({ready:true,role:null})
export function useEmployeePermission(permission:string) {
  const {user}=useAuthStore()
  const access=useContext(EmployeeAccessContext)
  return user?.role==='admin' || (access.ready && (!access.role || access.role.permissions.includes(permission)))
}
