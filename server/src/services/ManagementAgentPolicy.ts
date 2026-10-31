import {ACCESS_ROUTE_MANIFEST} from './StaffPermissionRouteManifest'

/** Hermes reads the existing management API under the real account. Device,
 * authentication bootstrap and checkout execution are not management queries. */
const deviceOrBootstrap=/^GET \/api\/(?:hardware(?:\/|$)|pos-cash(?:\/|$)|payments(?:\/|$)|queue(?:\/|$)|auth(?:\/|$)|tv\/(?:pair|device)(?:\/|$))/
const checkoutProjection=/\/(?:offline[^/]*|received-receipts|kds)(?:\/|$)|^GET \/api\/products\/pos(?:\/|$)/
export const agentOperations=new Map<string,string|null>(Object.entries(ACCESS_ROUTE_MANIFEST)
 .filter(([id])=>id.startsWith('GET ')&&!deviceOrBootstrap.test(id)&&!checkoutProjection.test(id)&&id!=='GET /api/staff-permissions/stores')
 .map(([id,spec])=>[id,spec.permission]))
for(const id of ['POST /api/marketing/activities','PUT /api/marketing/activities/:id','POST /api/marketing/activities/quote'])agentOperations.set(id,ACCESS_ROUTE_MANIFEST[id]?.permission||'marketing.write')
export const agentOperationPermission=(id:string)=>agentOperations.get(id)
export const agentOperationAccess=(id:string)=>agentOperations.has(id)?null:'AGENT_OPERATION_NOT_AVAILABLE'

/** Native account/resource validators remain authoritative for every date,
 * dataset and activity body. Identity and tenant selectors are never delegated. */
export const agentInputContracts=new Map<string,(input:any)=>string|null>([...agentOperations.keys()].map(id=>[id,input=>{
 if(id.startsWith('GET ')&&(Object.keys(input.body||{}).length||input.files?.length))return 'AGENT_READ_BODY_NOT_ALLOWED'
 return null
}]))
export function agentOperationInput(id:string,input:any):string|null {
 if(!agentOperations.has(id))return 'AGENT_OPERATION_NOT_AVAILABLE'
 const validate=agentInputContracts.get(id)
 return validate?validate(input):'AGENT_INPUT_CONTRACT_NOT_REVIEWED'
}

// Prevent another permitted module from serving as a back door to a denied
// whole-store financial report. Product prices and personal orders stay separate.
export function agentAdditionalPermissions(id:string,input?:any):string[]{
 if(id==='GET /api/revenue/query'&&input?.query?.dataset==='grossProfit'||/^GET \/api\/finance\/(?:profit|income-statement)$/.test(id))return ['profit.read']
 if(id==='GET /api/products/:id/cost')return ['cost.read']
 if(/^GET \/api\/marketing\/(?:activities\/performance|analytics\/|campaign-reports|coupon-reports|referral-funnel|campaigns\/[^/]+\/stats|referrals\/[^/]+\/stats|channels\/stats\/attribution)/.test(id)||id==='GET /api/channels/:id/orders'||/^GET \/api\/staff-management\/(?:performance|kpi|sales-stats)$/.test(id))return ['dashboard.read']
 if(id==='GET /api/staff-management/payroll'||id==='GET /api/salaries/adjustments')return ['salary.read']
 return []
}

/** Human source text is read by the server, never an allow flag in tool JSON. */
function unquotedActivityCommand(text:string){return text.replace(/“[^”]*”|「[^」]*」|‘[^’]*’|"[^"]*"/g,'')}
export function explicitlyPublishesActivity(text:string):boolean {
 const command=unquotedActivityCommand(text)
 if(/附件|文档|引用|示例|例如|截图|为什么|如何|怎么|不要发布|不发布|先不|(?:仅|只|保存|暂存).*草稿|do not publish|don.t publish|only.*draft|save.*draft|draft only|jangan.*(?:terbit|aktif)/i.test(command))return false
 const imperative=command.replace(/(?:尚未|未|已)发布|unpublished/gi,'')
 return /^(?:请)?(?:立即)?(?:发布|上线)|(?:立即|现在|确认|请|并|重新)\s*(?:发布|上线)|把.{0,80}(?:发布|上线)|(?:发布|上线)(?:这个|该|本次|这次|上述)?(?:活动|促销)|立即生效|\b(?:please|and|then|now)\s+publish\b|^publish\b|\bpublish (?:it|this|the|now|campaign|promotion)\b|\b(?:terbitkan|aktifkan)\b/i.test(imperative)
}
export function activityRequestIntent(text:string):boolean {
 text=unquotedActivityCommand(text)
 if(/截图|文件|附件|文档|引用|示例|例如|为什么|为何|如何|怎么|how to|why|example/i.test(text))return false
 return /(?:设置|创建|新建|安排|发布|修改|调整|更新|编辑).{0,30}(?:活动|促销)|(?:活动|促销).{0,30}(?:设置|创建|新建|发布|修改|调整|更新|编辑)|(?:create|publish|edit|update|buat|atur|terbitkan|ubah).{0,30}(?:campaign|promotion|promosi|kampanye)/i.test(text)
}
