/** Reviewed business interfaces. Unknown interfaces are closed until their data,
 * side effects and audience contract have been reviewed; HTTP ACLs still apply. */
export const agentOperations = new Map([
  ['GET /api/inventory/logs/today-stock-out', 'inventory.read'],
  ['GET /api/revenue/query', 'dashboard.read'],
])
export const agentOperationPermission = (id:string) => agentOperations.get(id)
export function agentOperationAccess(id:string) {
 return agentOperations.has(id) ? null : 'AGENT_OPERATION_NOT_REVIEWED'
}

/** Reviewing an endpoint does not review every report it can calculate. */
function reportInput(id:string,input:any):string|null {
 const query=input.query||{}
 if(Object.keys(input.body||{}).length||Object.keys(input.pathParams||{}).length||input.files?.length)return 'AGENT_OPERATION_SCOPE_NOT_REVIEWED'
 if(id==='GET /api/revenue/query'){
  if(Object.keys(query).some(key=>!['period','dataset'].includes(key))||(query.period??'today')!=='today'||(query.dataset??'net')!=='net')return 'AGENT_OPERATION_SCOPE_NOT_REVIEWED'
 }else if(Object.keys(query).length)return 'AGENT_OPERATION_SCOPE_NOT_REVIEWED'
 return null
}

export const agentInputContracts=new Map<string,(input:any)=>string|null>([
 ['GET /api/inventory/logs/today-stock-out',input=>reportInput('GET /api/inventory/logs/today-stock-out',input)],
 ['GET /api/revenue/query',input=>reportInput('GET /api/revenue/query',input)],
])
export function agentOperationInput(id:string,input:any):string|null {
 if(!agentOperations.has(id))return 'AGENT_OPERATION_NOT_REVIEWED'
 const validate=agentInputContracts.get(id)
 return validate?validate(input):'AGENT_INPUT_CONTRACT_NOT_REVIEWED'
}
