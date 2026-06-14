import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config/env'

export type Role = 'admin' | 'manager' | 'cashier' | 'staff'

export interface AuthUser {
  id: string
  phone: string
  role: Role
  storeId: string
  staffId: string
}

export interface AuthRequest extends Request {
  user?: AuthUser
  file?: any
  files?: any
}

// Permission definitions
export const PERMISSIONS = {
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
} as const

export type Permission = keyof typeof PERMISSIONS

// Check if user has permission
export function hasPermission(role: Role, permission: Permission): boolean {
  const allowedRoles = [...PERMISSIONS[permission]]
  return allowedRoles.includes(role)
}

// Check if user can access data for a specific store
export function canAccessStore(user: AuthUser, targetStoreId: string): boolean {
  // Admin can access all stores
  if (user.role === 'admin') return true
  // Other roles can only access their assigned store
  return user.storeId === targetStoreId
}

// Check if user can view sensitive field
export function canViewField(user: AuthUser, field: 'salary' | 'bomCost' | 'address'): boolean {
  if (user.role === 'admin' || user.role === 'manager') return true
  // Cashier and Staff cannot view sensitive cost data
  if (field === 'bomCost' && (user.role === 'cashier' || user.role === 'staff')) return false
  return false
}

// Authentication middleware
export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        code: 401,
        message: 'No token provided'
      })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, config.jwt.secret) as AuthUser

    // Validate role
    if (!['admin', 'manager', 'cashier', 'staff'].includes(decoded.role)) {
      return res.status(401).json({
        code: 401,
        message: 'Invalid role'
      })
    }

    req.user = decoded
    next()
  } catch (error) {
    return res.status(401).json({
      code: 401,
      message: 'Invalid or expired token'
    })
  }
}

// Role-based authorization
export function authorize(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        code: 401,
        message: 'Not authenticated'
      })
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return res.status(403).json({
        code: 403,
        message: 'Insufficient permissions'
      })
    }

    next()
  }
}

// Permission-based authorization
export function requirePermission(permission: Permission) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        code: 401,
        message: 'Not authenticated'
      })
    }

    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({
        code: 403,
        message: `Permission denied: ${permission}`
      })
    }

    next()
  }
}

// Store access middleware - ensures user can only access their store's data
export function requireStoreAccess(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      code: 401,
      message: 'Not authenticated'
    })
  }

  // Admin can access all stores
  if (req.user.role === 'admin') {
    return next()
  }

  // Get storeId from request params, query, or body
  const targetStoreId = req.params.storeId || req.query.storeId || req.body?.storeId

  if (targetStoreId && targetStoreId !== req.user.storeId) {
    return res.status(403).json({
      code: 403,
      message: 'Access denied: Store mismatch'
    })
  }

  // For cashier/staff, always use their assigned store
  if (req.user.role === 'cashier' || req.user.role === 'staff') {
    if (!req.query.storeId && !req.body?.storeId) {
      // Automatically use their store if not specified
      req.query.storeId = req.user.storeId
    }
  }

  next()
}

// Field-level filtering middleware
export function filterSensitiveFields<T extends Record<string, any>>(
  data: T,
  userRole: Role
): Partial<T> {
  // If admin or manager, return full data
  if (userRole === 'admin' || userRole === 'manager') {
    return data
  }

  // Filter out sensitive fields for cashier/staff
  const filtered = { ...data } as any

  // Remove BOM cost from orders (sensitive pricing info)
  if ('items' in filtered && Array.isArray(filtered.items)) {
    filtered.items = filtered.items.map((item: any) => {
      const { bomCost, ...rest } = item
      return rest
    })
  }

  return filtered as Partial<T>
}