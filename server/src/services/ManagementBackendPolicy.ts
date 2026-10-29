import { isInternalConfig, isSecretConfig } from '../utils/configAccess'

// Policy describes native operations, not another implementation of them. These
// effects are included in the discovered contract and reviewed with route ACLs.
export type BackendEffect = 'business' | 'security' | 'payment' | 'attachment' | 'configuration'
const effectGroups: Array<[BackendEffect, string[]]> = [
  ['security', ['/api/auth','/api/ai','/api/staff-permissions','/api/sync','/api/team/ai','/api/team/admin','/api/staff-work/admin']],
  ['attachment', ['/api/upload','/api/import']],
  ['configuration', ['/api/config']],
]
const sensitiveOperations = new Map<string,BackendEffect>([
  ['POST /api/stores','security'], ['POST /api/staff','security'],
  ['PUT /api/staff/:id/role','security'], ['PUT /api/staff/:id/reset-password','security'],
  ['PUT /api/salaries/:id/mark-paid','payment'], ['PUT /api/reimbursement/mark-paid/:id','payment'],
  ['POST /api/purchase-orders/:id/confirm-payment','payment'], ['POST /api/purchase-orders/:id/refund','payment'],
  ['POST /api/expenses/:id/payment-source','payment'],
  ['POST /api/expenses/pos','payment'],
  ['POST /api/finance/accounts/transfer','payment'], ['POST /api/finance/accounts/transfers/:id/reverse','payment'],
  ['POST /api/deposit/refund','payment'], ['POST /api/deposit/deduct','payment'],
  ['POST /api/marketing/automation/run','payment'], ['POST /api/marketing/automation/run/:campaignId','payment'],
  ['POST /api/marketing/automation/birthday','payment'], ['POST /api/marketing/automation/reactivation','payment'],
  ['POST /api/marketing/automation/points-expiring','payment'], ['POST /api/marketing/automation/seasonal','payment'],
])
const paymentPermissions = new Set(['salary.pay','orders.refund','orders.refund.approve','members.balance'])
export function backendEffect(id:string, path:string, method:string, permission:string|null):BackendEffect {
  const exact=sensitiveOperations.get(id);if(exact)return exact
  if(!['GET','HEAD'].includes(method)&&(path==='/api/payments'||path.startsWith('/api/payments/')||paymentPermissions.has(permission||'')))return 'payment'
  for(const [effect,bases] of effectGroups)if(bases.some(base=>path===base||path.startsWith(base+'/')))return effect
  if(path.split('/').some(segment=>['workflow','delegations','access-policy'].includes(segment)))return 'security'
  if(path.split('/').includes('ai'))return 'security'
  return 'business'
}

const publicationRoutes = new Set([
  '/api/marketing/activities','/api/marketing/activities/:id',
  '/api/marketing/campaigns','/api/marketing/campaigns/:id',
  '/api/marketing/coupons','/api/marketing/coupons/:id',
  '/api/marketing/discount-rules','/api/marketing/discount-rules/:id',
  '/api/marketing/timed-specials','/api/marketing/timed-specials/:id',
  '/api/marketing/automation-rules','/api/marketing/automation-rules/:id','/api/marketing/automation-rules/:id/status',
])
// Existing marketing handlers have active-by-default creates. Omitted status is
// NOT permission to publish. Owner publication consent is deliberately absent
// from this bridge until an auditable approval is available.
export function backendInputBoundary(op:{id:string;path:string;method:string;effect:BackendEffect;permission:string|null}, input:any):string|null {
  const write=!['GET','HEAD'].includes(op.method),body=input.body||{}
  if(op.effect==='security')return 'ACCOUNT_OR_SYSTEM_CONFIGURATION'
  if(op.effect==='payment')return 'OWNER_APPROVAL_REQUIRED'
  if(op.effect==='attachment')return 'AUTHORIZED_ATTACHMENT_REQUIRED'
  if(op.effect==='configuration'){
    const keys=[input.pathParams?.key,body.key,...(Array.isArray(body.configs)?body.configs.map((c:any)=>c?.key):[])].filter(k=>k!==undefined)
    if(keys.some(key=>typeof key!=='string'||isSecretConfig(key)||isInternalConfig(key)))return 'ACCOUNT_OR_SYSTEM_CONFIGURATION'
    if(op.id==='GET /api/config')return null // response is filtered before release
    if(write&&['POST /api/config','POST /api/config/batch'].includes(op.id)&&!keys.length)return 'CONFIGURATION_KEY_REQUIRED'
  }
  if(!write)return null
  if(op.id==='POST /api/expenses'&&body.paymentSource&&body.paymentSource!=='unknown')return 'OWNER_APPROVAL_REQUIRED'
  if(op.permission==='staff.write'&&['role','password','userId','permissions','accessRole','accessRoleId'].some(k=>Object.hasOwn(body,k)))return 'ACCOUNT_OR_SYSTEM_CONFIGURATION'
  if(op.id==='POST /api/staff-points/adjust'&&Number(body.points)<0)return 'OWNER_APPROVAL_REQUIRED'
  if(op.id==='POST /api/salaries/adjustments'&&body.type==='penalty')return 'OWNER_APPROVAL_REQUIRED'
  if(op.permission==='salary.write'&&(Number(body.deduction)>0||Number(body.includedAttendanceDeduction)>0||Number(body.includedLeaveDeduction)>0))return 'OWNER_APPROVAL_REQUIRED'
  if(publicationRoutes.has(op.path)&&op.method!=='DELETE'){
    const allowed=op.path.startsWith('/api/marketing/activities')?['draft','paused','ended']
      :op.path.startsWith('/api/marketing/discount-rules')||op.path.startsWith('/api/marketing/timed-specials')||op.path.startsWith('/api/marketing/coupons')?['inactive']:['paused']
    const status=body.status??(op.path.startsWith('/api/marketing/activities')?'draft':undefined)
    if(!allowed.includes(status))return 'EXPLICIT_ACTIVITY_PUBLICATION_REQUIRED'
  }
  return null
}

/** Credentials must never enter a model receipt, including JSON encoded values.
 * Only configuration envelopes are decoded, not arbitrary employee prose. */
export function redactBackendSecrets(value:any):any {
  if(Array.isArray(value))return value.map(redactBackendSecrets)
  if(!value||typeof value!=='object')return value
  if(typeof value.key==='string'&&(isSecretConfig(value.key)||isInternalConfig(value.key)))return {key:value.key,protected:true}
  return Object.fromEntries(Object.entries(value).filter(([key])=>!isSecretConfig(key)&&!isInternalConfig(key)&&!/password|credential|token|secret|api.?key|authorization|private.?key/i.test(key)).map(([key,v])=>{
    if(key==='value'&&typeof v==='string')try{return [key,JSON.stringify(redactBackendSecrets(JSON.parse(v)))]}catch{/* non-JSON business value */}
    return [key,redactBackendSecrets(v)]
  }))
}
