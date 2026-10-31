import {defaultStaffPermissions} from './StaffPermissionCatalog'
import {employeeAppAccess} from './EmployeeAppAccess'

export function hermesPermissionAllows(actor:any,permission:string):boolean {
 if(actor.role==='admin'&&!actor.employeeApp)return true
 const access=actor.employeeApp?employeeAppAccess(actor.role):actor.accessRole
 if(permission==='store.revenue')return hermesPermissionAllows(actor,'finance.read')||hermesPermissionAllows(actor,'dashboard.read')
 if(access?.version===2||actor.employeeApp)return access?.modes?.[permission]==='allow'
 const permissions=access?.permissions||defaultStaffPermissions(actor.role)
 return permissions.includes(permission)||(['profit.read','cost.read'].includes(permission)&&permissions.includes('finance.read'))
}
/** Same classification for visible UI and bounded model history. */
export function hermesReplyRequiredPermissions(message:any):string[]{
 const permissions:string[]=Array.isArray(message.agent?.dataPermissions)?[...message.agent.dataPermissions]:[]
 // Legacy replies predate typed receipts. Protect the known financial disclosure
 // in both message history and channel previews; a denial without data stays visible.
 if(/(?:Rp\s*[\d,.]+|\d[\d,.]*\s*(?:元|印尼盾))/i.test(message.text||'')){
  if(/营收|营业额|销售额|pendapatan|omzet|revenue|cashSales/i.test(message.text))permissions.push('store.revenue')
  if(/毛利|利润|profit|margin/i.test(message.text))permissions.push('profit.read')
 }
 return [...new Set(permissions)]
}
/** Projection only: immutable source text and administrator audit stay intact. */
export function visibleHermesReply(actor:any,message:any):any {
 if(!message||!(message.agent||message.ai||String(message.authorId).startsWith('agent:'))||actor.role==='admin'&&!actor.employeeApp)return message
 const permissions=hermesReplyRequiredPermissions(message)
 if(permissions.some(permission=>!hermesPermissionAllows(actor,permission)))return {...message,text:'此回复包含当前账号无权查看的数据，已隐藏。原始记录保留供有权管理员审计。 / Data dalam jawaban ini tidak dapat dilihat oleh akun Anda. Catatan asli tetap tersimpan untuk audit admin.',files:[],accessWithheld:true}
 return message
}
