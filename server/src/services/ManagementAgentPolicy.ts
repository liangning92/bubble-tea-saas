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
