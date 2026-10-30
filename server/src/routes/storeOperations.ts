import { Router } from 'express'
import { z } from 'zod'
import {
  readOperationsState,
  submitOperationsTask,
  operationsTaskStatus,
} from '../services/StoreOperationsDelegationService'

/** This router has its own opaque, revocable capability authentication, not administrator JWTs. */
export const storeOperationsRouter = Router()
storeOperationsRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'private, no-store')
  next()
})
// Retired deterministic business proxies cannot bypass the actual Hermes worker.
storeOperationsRouter.all(['/daily-member-specials','/daily-member-specials/apply','/daily-member-specials/quote'],(_req,res)=>res.status(410).json({code:410,message:'OPERATIONS_LEGACY_BUSINESS_ENDPOINT_RETIRED',replacement:'/api/store-operations/tasks'}))
storeOperationsRouter.get('/connection',async(req,res)=>{try{const header=req.get('Authorization')||'';if(!header.startsWith('Bearer '))return res.status(401).json({code:401,message:'OPERATIONS_CREDENTIAL_REQUIRED'});res.json({code:200,data:await readOperationsState(header.slice(7))})}catch{res.status(403).json({code:403,message:'OPERATIONS_CONNECTION_UNAVAILABLE'})}})

const taskCall = (submit: boolean) => async (req: any, res: any) => {
  try {
    const header = req.get('Authorization') || ''
    if (!header.startsWith('Bearer '))
      return res.status(401).json({ code: 401, message: 'OPERATIONS_CREDENTIAL_REQUIRED' })
    const data = submit
      ? await submitOperationsTask(header.slice(7), req.body)
      : await operationsTaskStatus(header.slice(7), req.params.requestId)
    res.json({ code: 200, data })
  } catch (error: any) {
    const status =
      error instanceof z.ZodError
        ? 400
        : /CREDENTIAL/.test(error.message)
          ? 401
          : /OWNER|ROLE|AUTHORIZATION|NOT_GRANTED/.test(error.message)
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
storeOperationsRouter.post('/tasks', taskCall(true))
storeOperationsRouter.get('/tasks/:requestId', taskCall(false))
