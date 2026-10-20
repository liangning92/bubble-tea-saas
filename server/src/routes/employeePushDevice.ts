import { Router } from 'express'
import { z } from 'zod'
import { AuthRequest } from '../middlewares/auth'
import { TeamError } from '../services/TeamCommunicationService'
import { employeePushDevice } from '../services/EmployeePushDeviceService'
import { wakeEmployeeDelivery } from '../services/EmployeeReminderService'

const router = Router(), hash = z.string().regex(/^[a-f0-9]{64}$/)
const handle = (fn: (req: AuthRequest, res: any) => Promise<void>) => async (req: AuthRequest, res: any) => {
  try { await fn(req, res) } catch (e: any) {
    const status = e instanceof z.ZodError ? 400 : e instanceof TeamError ? e.status : 503
    res.status(status).json({ code: status, message: e instanceof z.ZodError ? 'INVALID_INPUT' : e instanceof TeamError ? e.message : 'PUSH_DEVICE_UNAVAILABLE' })
  }
}
router.get('/my/push-device/config', handle(async (req, res) => {
  res.json({ code: 200, data: await employeePushDevice().config(req.user!) })
}))
router.post('/my/push-device/check', handle(async (req, res) => {
  const input = z.object({ subscriptionId: hash.optional(), testId: hash.optional() }).strict().parse(req.body)
  res.json({ code: 200, data: await employeePushDevice().check(req.user!, input) })
}))
router.post('/my/push-device/test', handle(async (req, res) => {
  const input = z.object({ subscriptionId: hash, requestId: z.string().uuid() }).strict().parse(req.body)
  const data = await employeePushDevice().createTest(req.user!, { subscriptionId: input.subscriptionId!, requestId: input.requestId! })
  // The transaction has committed before the existing API delivery worker is woken.
  res.once('finish', () => wakeEmployeeDelivery(req.user!.storeId))
  res.json({ code: 200, data })
}))
router.post('/my/push-device/tests/:id/receipt', handle(async (req, res) => {
  const id = hash.parse(req.params.id), input = z.object({ subscriptionId: hash, phase: z.enum(['displayed', 'opened']) }).strict().parse(req.body)
  res.json({ code: 200, data: await employeePushDevice().receipt(req.user!, id, { subscriptionId: input.subscriptionId!, phase: input.phase! }) })
}))
export default router
