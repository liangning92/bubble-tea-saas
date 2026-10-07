import { NextFunction, Response } from 'express'
import { AuthRequest, canAccessStore } from './auth'

// Store selectors in a request do not establish ownership of an object id.
export function requireResourceStore(load: (req: AuthRequest) => Promise<{ storeId: string } | null>) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ code: 401, message: 'Not authenticated' })
    try {
      const resource = await load(req)
      if (!resource) return res.status(404).json({ code: 404, message: 'Resource not found' })
      if (!canAccessStore(req.user, resource.storeId)) {
        return res.status(403).json({ code: 403, message: 'Access denied: Store mismatch' })
      }
      return next()
    } catch (error) {
      return next(error)
    }
  }
}
