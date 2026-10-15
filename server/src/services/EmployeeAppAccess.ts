import { permissionCatalog } from './StaffPermissionV2Core'

// Selecting the employee app only exposes its reviewed work endpoints. It never
// unlocks arbitrary management routes, even if a caller supplies this header.
export const EMPLOYEE_APP_WORK_ROUTES = new Set([
  'GET /api/auth/me', 'PUT /api/auth/password',
  'GET /api/shifts', 'GET /api/attendance-rules',
  'GET /api/products', 'GET /api/training/library/videos/:id',
  'GET /api/process-recipes', 'GET /api/process-recipes/:id', 'POST /api/process-recipes/:id/execute',
  'GET /api/inventory', 'GET /api/inventory/:id',
  'GET /api/inventory/logs/stock-in', 'GET /api/inventory/logs/stock-out',
  'GET /api/inventory/alerts/low-stock',
  'POST /api/inventory/stock-in', 'POST /api/inventory/stock-out',
  'GET /api/purchase-orders', 'GET /api/purchase-orders/pending', 'GET /api/purchase-orders/:id',
  'POST /api/purchase-orders', 'POST /api/purchase-orders/:id/receive', 'GET /api/suppliers',
  'POST /api/inventory-counts', 'POST /api/inventory-counts/:id/submit',
  'GET /api/inventory-counts', 'GET /api/inventory-counts/:id',
  'PUT /api/inventory-counts/:id/item/:itemId', 'PUT /api/inventory-counts/:id/items',
  'GET /api/announcement/active', 'POST /api/upload/attachment',
])
export function isEmployeeAppRoute(key: string, spec: {personal?: boolean; ownerOnly?: boolean}): boolean {
  return !spec.ownerOnly && (!!spec.personal || EMPLOYEE_APP_WORK_ROUTES.has(key))
}
export function employeeAppAccess(role: string) {
  const modes: Record<string, string> = Object.fromEntries(permissionCatalog.map(p => [p.key, p.scope === 'self' ? 'allow' : 'deny']))
  // Native sensitive-data rules remain independent of configurable role grants.
  if (['admin', 'manager'].includes(role)) modes['cost.read'] = 'allow'
  return {version: 2, id: 'employee-app', name: 'Employee app', baseRole: 'staff', permissions: Object.keys(modes).filter(k => modes[k] === 'allow'), modes}
}
