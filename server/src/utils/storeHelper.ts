import { AuthRequest } from '../middlewares/auth'

/**
 * Get storeId safely with RBAC check.
 * Non-admin roles (cashier, staff, manager) are strictly scoped to their assigned req.user.storeId.
 * Admin and super_admin roles can optionally pass ?storeId=xxx in req.query.
 */
export function getStoreId(req: AuthRequest): string {
  const userRole = req.user?.role || ''
  if (['admin', 'super_admin'].includes(userRole)) {
    return (req.query.storeId as string) || req.user?.storeId || ''
  }
  return req.user?.storeId || ''
}
