"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStoreId = getStoreId;
/**
 * Get storeId safely with RBAC check.
 * Non-admin roles (cashier, staff, manager) are strictly scoped to their assigned req.user.storeId.
 * Admin and super_admin roles can optionally pass ?storeId=xxx in req.query.
 */
function getStoreId(req) {
    const userRole = req.user?.role || '';
    if (['admin', 'super_admin'].includes(userRole)) {
        return req.query.storeId || req.user?.storeId || '';
    }
    return req.user?.storeId || '';
}
//# sourceMappingURL=storeHelper.js.map