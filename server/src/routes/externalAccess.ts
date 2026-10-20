import { Router, RequestHandler } from 'express'
import { z } from 'zod'
import { AccessError } from '../services/externalAccess/contract'
import { externalAccess } from '../services/externalAccess/service'

// Unmounted API contract. Production registration additionally needs access-manifest declaration
// and UI review. authenticate must be the normal management session middleware, never MCP tokens.
export function externalAccessRouter(service: ReturnType<typeof externalAccess>, authenticate: RequestHandler) {
  const router = Router()
  router.use(authenticate)
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next() })
  const route = (fn: (req: any) => Promise<unknown>): RequestHandler => async (req: any, res) => {
    try {
      if (!req.user?.id || !req.user?.storeId) throw new AccessError(401, 'EXTERNAL_UNAUTHENTICATED')
      res.json({ code: 200, data: await fn(req) })
    } catch (e) {
      const status = e instanceof AccessError ? e.status : e instanceof z.ZodError ? 400 : 500
      res.status(status).json({ code: status, message: e instanceof AccessError ? e.message : status === 400 ? 'EXTERNAL_INVALID_INPUT' : 'EXTERNAL_OPERATION_FAILED' })
    }
  }
  const registrationId = (req: any) => z.string().uuid().parse(req.params.id)
  const version = (req: any) => z.object({ expectedVersion: z.number().int().positive() }).strict().parse(req.body).expectedVersion
  router.get('/', route(req => service.list(req.user)))
  router.get('/audits', route(req => service.audits(req.user)))
  router.post('/', route(req => service.save(req.user, req.body)))
  router.put('/:id', route(req => service.save(req.user, req.body, registrationId(req))))
  router.post('/:id/revoke', route(req => service.revoke(req.user, registrationId(req), version(req))))
  router.post('/:id/validate', route(req => service.validate(req.user, registrationId(req), version(req))))
  return router
}
