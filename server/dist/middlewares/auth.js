"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERMISSIONS = void 0;
exports.hasPermission = hasPermission;
exports.canAccessStore = canAccessStore;
exports.canViewField = canViewField;
exports.authenticate = authenticate;
exports.authorize = authorize;
exports.requirePermission = requirePermission;
exports.requireStoreAccess = requireStoreAccess;
exports.filterSensitiveFields = filterSensitiveFields;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
// Permission definitions
exports.PERMISSIONS = {
    // Dashboard & Reports
    'dashboard:view': ['admin', 'manager'],
    'reports:view': ['admin', 'manager'],
    'reports:export': ['admin'],
    // Products
    'products:create': ['admin', 'manager'],
    'products:update': ['admin', 'manager'],
    'products:delete': ['admin'],
    'products:view': ['admin', 'manager', 'cashier'],
    // Orders
    'orders:create': ['admin', 'manager', 'cashier'],
    'orders:view:all': ['admin', 'manager'],
    'orders:view:own': ['admin', 'manager', 'cashier'],
    'orders:refund': ['admin', 'manager'],
    'orders:cancel': ['admin', 'manager', 'cashier'],
    // Inventory
    'inventory:create': ['admin', 'manager'],
    'inventory:update': ['admin', 'manager'],
    'inventory:stock-in': ['admin', 'manager'],
    'inventory:stock-out': ['admin', 'manager', 'staff'],
    'inventory:view': ['admin', 'manager', 'staff'],
    // Staff Management
    'staff:create': ['admin'],
    'staff:update': ['admin', 'manager'],
    'staff:delete': ['admin'],
    'staff:view:all': ['admin', 'manager'],
    'staff:view:own': ['admin', 'manager', 'cashier', 'staff'],
    'staff:salary:view': ['admin', 'manager'],
    // Attendance
    'attendance:check-in': ['admin', 'manager', 'cashier', 'staff'],
    'attendance:view:all': ['admin', 'manager'],
    'attendance:view:own': ['admin', 'manager', 'cashier', 'staff'],
    // Schedule
    'schedule:create': ['admin', 'manager'],
    'schedule:view:all': ['admin', 'manager'],
    'schedule:view:own': ['admin', 'manager', 'cashier', 'staff'],
    // Members
    'members:create': ['admin', 'manager'],
    'members:update': ['admin', 'manager'],
    'members:delete': ['admin'],
    'members:view': ['admin', 'manager', 'cashier'],
    // KDS
    'kds:view': ['admin', 'manager', 'cashier'],
    'kds:update-status': ['admin', 'manager', 'cashier'],
    // Delivery
    'delivery:view': ['admin', 'manager'],
    'delivery:update-status': ['admin', 'manager'],
    // Queue
    'queue:manage': ['admin', 'manager'],
    'queue:view': ['admin', 'manager', 'cashier'],
    // Settings
    'settings:view': ['admin'],
    'settings:update': ['admin'],
    // Costs (sensitive - hide from cashier)
    'costs:view': ['admin', 'manager'],
};
// Check if user has permission
function hasPermission(role, permission) {
    const allowedRoles = [...exports.PERMISSIONS[permission]];
    return allowedRoles.includes(role);
}
// Check if user can access data for a specific store
function canAccessStore(user, targetStoreId) {
    // Admin can access all stores
    if (user.role === 'admin')
        return true;
    // Other roles can only access their assigned store
    return user.storeId === targetStoreId;
}
// Check if user can view sensitive field
function canViewField(user, field) {
    if (user.role === 'admin' || user.role === 'manager')
        return true;
    // Cashier and Staff cannot view sensitive cost data
    if (field === 'bomCost' && (user.role === 'cashier' || user.role === 'staff'))
        return false;
    return false;
}
// Authentication middleware
function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                code: 401,
                message: 'No token provided'
            });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jsonwebtoken_1.default.verify(token, env_1.config.jwt.secret);
        // Validate role
        if (!['admin', 'manager', 'cashier', 'staff'].includes(decoded.role)) {
            return res.status(401).json({
                code: 401,
                message: 'Invalid role'
            });
        }
        req.user = decoded;
        next();
    }
    catch (error) {
        return res.status(401).json({
            code: 401,
            message: 'Invalid or expired token'
        });
    }
}
// Role-based authorization
function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                code: 401,
                message: 'Not authenticated'
            });
        }
        if (roles.length > 0 && !roles.includes(req.user.role)) {
            return res.status(403).json({
                code: 403,
                message: 'Insufficient permissions'
            });
        }
        next();
    };
}
// Permission-based authorization
function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                code: 401,
                message: 'Not authenticated'
            });
        }
        if (!hasPermission(req.user.role, permission)) {
            return res.status(403).json({
                code: 403,
                message: `Permission denied: ${permission}`
            });
        }
        next();
    };
}
// Store access middleware - ensures user can only access their store's data
function requireStoreAccess(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            code: 401,
            message: 'Not authenticated'
        });
    }
    // Admin can access all stores
    if (req.user.role === 'admin') {
        return next();
    }
    // Get storeId from request params, query, or body
    const targetStoreId = req.params.storeId || req.query.storeId || req.body?.storeId;
    if (targetStoreId && targetStoreId !== req.user.storeId) {
        return res.status(403).json({
            code: 403,
            message: 'Access denied: Store mismatch'
        });
    }
    // For cashier/staff, always use their assigned store
    if (req.user.role === 'cashier' || req.user.role === 'staff') {
        if (!req.query.storeId && !req.body?.storeId) {
            // Automatically use their store if not specified
            req.query.storeId = req.user.storeId;
        }
    }
    next();
}
// Field-level filtering middleware
function filterSensitiveFields(data, userRole) {
    // If admin or manager, return full data
    if (userRole === 'admin' || userRole === 'manager') {
        return data;
    }
    // Filter out sensitive fields for cashier/staff
    const filtered = { ...data };
    // Remove BOM cost from orders (sensitive pricing info)
    if ('items' in filtered && Array.isArray(filtered.items)) {
        filtered.items = filtered.items.map((item) => {
            const { bomCost, ...rest } = item;
            return rest;
        });
    }
    return filtered;
}
//# sourceMappingURL=auth.js.map