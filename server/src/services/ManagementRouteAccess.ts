import { hasManagementAccess } from '../utils/managementAccess'
import { isEmployeeAppRoute } from './EmployeeAppAccess'

type Declaration = {routeKey: string; permission: string | null; personal?: boolean; ownerOnly?: boolean}

// Shared API work used by POS is deliberately separate from the admin site.
// These declarations still require their ordinary permission and store checks.
const posPermissions = new Set([
  'orders.read', 'orders.create', 'orders.cancel', 'orders.status',
  'orders.refund', 'orders.refund.request', 'production.read', 'production.write',
  'pos.shift', 'pos.cash', 'pos.expense', 'members.read', 'members.write',
  'members.balance', 'orders.discount',
])
const workRoutes = new Set([
  'GET /api/auth/me', 'PUT /api/auth/password', 'GET /api/staff-permissions/me',
  'GET /api/products', 'GET /api/products/:id', 'GET /api/categories', 'GET /api/addons',
  'GET /api/products/pos', 'GET /api/products/pos/version', 'GET /api/products/barcode/:barcode',
  'GET /api/addons/:id', 'GET /api/channels', 'GET /api/product-price/:productId/channels',
  'GET /api/marketing/activity-prices', 'GET /api/marketing/activities',
  'GET /api/marketing/activities/offline-snapshot', 'POST /api/marketing/activities/quote',
  'GET /api/marketing/discount-rules', 'GET /api/marketing/timed-specials',
  'POST /api/marketing/coupons/verify', 'POST /api/marketing/coupons/:memberCouponId/redeem',
  'POST /api/orders/received-receipts', 'GET /api/pos-cash/offline-work',
  'POST /api/pos-cash/shifts/offline-operations',
  'GET /api/staff-permissions/approvers', 'GET /api/staff-permissions/approvals',
  'GET /api/staff-permissions/approvals/:id', 'POST /api/staff-permissions/approvals',
  'POST /api/staff-permissions/approvals/:id/onsite',
])

export function canUseManagementRoute(user: any, spec: Declaration): boolean {
  if (user.role === 'admin' && !user.employeeApp) return true
  if (hasManagementAccess(user.role, user.accessRole) && !user.employeeApp) return !['products.manage','products.write','prices.write'].includes(spec.permission || '') && !spec.routeKey.includes('/api/product-analysis')
  if (spec.ownerOnly) return false
  if (user.employeeApp) return isEmployeeAppRoute(spec.routeKey, spec)
  if (spec.personal || workRoutes.has(spec.routeKey)) return true
  if (/\/(approve|reject|complete|cancel)$/.test(spec.routeKey) && !spec.routeKey.startsWith('POST /api/orders/')) return false
  if (/\/refund-requests\/[^/]+\/(approve|reject)$/.test(spec.routeKey)) return false
  if (spec.permission && posPermissions.has(spec.permission)) return true
  // POS configuration bootstrap. Native config/secret filtering is retained.
  return spec.routeKey.startsWith('GET /api/') && /^GET \/api\/(config|receipt-templates|hardware|shifts|marketing\/activities\/display)(\/|$)/.test(spec.routeKey)
}
