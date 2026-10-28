import { Router } from 'express'
import { z } from 'zod'
import {
  applyOperationsPolicy,
  readOperationsState,
  quoteOperationsSpecials,
} from '../services/StoreOperationsDelegationService'

/** This router has its own opaque, revocable capability authentication, not administrator JWTs. */
export const storeOperationsRouter = Router()
storeOperationsRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'private, no-store')
  next()
})
const run = (apply: boolean) => async (req: any, res: any) => {
  try {
    const header = req.get('Authorization') || ''
    if (!header.startsWith('Bearer '))
      return res.status(401).json({ code: 401, message: 'OPERATIONS_CREDENTIAL_REQUIRED' })
    const data = apply
      ? await applyOperationsPolicy(header.slice(7), req.body)
      : await readOperationsState(header.slice(7))
    res.json({ code: 200, data })
  } catch (error: any) {
    const status =
      error instanceof z.ZodError
        ? 400
        : /CREDENTIAL/.test(error.message)
          ? 401
          : /OWNER|AUTHORIZATION|NOT_GRANTED/.test(error.message)
            ? 403
            : 409
    res
      .status(status)
      .json({
        code: status,
        message:
          error instanceof z.ZodError
            ? 'OPERATIONS_INPUT_INVALID'
            : String(error.message).startsWith('OPERATIONS_')
              ? error.message
              : 'OPERATIONS_UNAVAILABLE',
      })
  }
}
storeOperationsRouter.get('/daily-member-specials', run(false))
storeOperationsRouter.post('/daily-member-specials/apply', run(true))
storeOperationsRouter.post('/daily-member-specials/quote', async (req, res) => {
  try {
    const header = req.get('Authorization') || ''
    if (!header.startsWith('Bearer '))
      return res.status(401).json({ code: 401, message: 'OPERATIONS_CREDENTIAL_REQUIRED' })
    res.json({ code: 200, data: await quoteOperationsSpecials(header.slice(7), req.body) })
  } catch (error: any) {
    const status =
      error instanceof z.ZodError
        ? 400
        : /CREDENTIAL/.test(error.message)
          ? 401
          : /OWNER|AUTHORIZATION|NOT_GRANTED/.test(error.message)
            ? 403
            : 409
    res
      .status(status)
      .json({
        code: status,
        message:
          error instanceof z.ZodError
            ? 'OPERATIONS_INPUT_INVALID'
            : /^(OPERATIONS_|ACTIVITY_|MEMBERSHIP_)/.test(error.message)
              ? error.message
              : 'OPERATIONS_UNAVAILABLE',
      })
  }
})
