import { Router } from 'express'
import path from 'path'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../middlewares/auth'
import { canTeam, teamCommunication, TeamActor, TeamError } from '../services/TeamCommunicationService'
import { teamAi } from '../services/TeamAiService'
import { teamOperations } from '../services/TeamOperationsService'

export const teamCommunicationRouter = Router()
const router = teamCommunicationRouter, service = teamCommunication()
router.use(authenticate)
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next() })
const actor = (req: AuthRequest) => req.user! as TeamActor
const reason = (req: AuthRequest) => req.query.auditReason === undefined ? undefined : z.string().min(5).max(500).parse(req.query.auditReason)
const run = (fn: (req: AuthRequest, res: any) => Promise<unknown>) => async (req: AuthRequest, res: any) => {
  try { await fn(req, res) } catch (error) {
    const status = error instanceof TeamError ? error.status : error instanceof z.ZodError ? 400 : 500
    res.status(status).json({ code: status, message: error instanceof TeamError ? error.message : status === 400 ? 'TEAM_INVALID_INPUT' : 'TEAM_OPERATION_FAILED' })
  }
}
const ok = (res: any, data: unknown) => res.json({ code: 200, data })
const ai = teamAi()
const operations = teamOperations()
router.get('/channels/:id/operations', run(async (req, res) => ok(res, await operations.list(actor(req), req.params.id))))
router.post('/channels/:id/operations/import', run(async (req, res) => ok(res, await operations.import(actor(req), req.params.id, req.body))))
router.post('/channels/:id/operations/:planId/actions', run(async (req, res) => ok(res, await operations.action(actor(req), req.params.id, req.params.planId, req.body))))
router.post('/channels/:id/operations/:planId/scan', run(async (req, res) => ok(res, await operations.scan(actor(req), req.params.id, req.params.planId, req.body))))
router.get('/channels/:id/operations/:planId/export', run(async (req, res) => ok(res, await operations.export(actor(req), req.params.id, req.params.planId))))
router.get('/ai/settings', run(async (req, res) => ok(res, await ai.settings(actor(req)))))
router.put('/ai/settings', run(async (req, res) => ok(res, await ai.saveSettings(actor(req), req.body))))
router.post('/channels/:id/ai/drafts', run(async (req, res) => ok(res, await ai.generate(actor(req), req.params.id, req.body))))
router.get('/channels/:id/ai/drafts/:draftId', run(async (req, res) => ok(res, await ai.draft(actor(req), req.params.id, req.params.draftId))))
router.post('/channels/:id/ai/drafts/:draftId/publish', run(async (req, res) => {
  const { text } = z.object({ text: z.string().trim().min(1).max(3800) }).strict().parse(req.body)
  return ok(res, await service.send(actor(req), req.params.id, { requestId: z.string().uuid().parse(req.params.draftId), text, files: [] }, req.params.draftId))
}))
router.get('/directory', run(async (req, res) => ok(res, await service.directory(actor(req)))))
router.get('/capabilities', run(async (req, res) => { await service.directory(actor(req)); return ok(res, { manage: canTeam(actor(req), 'team.manage'), audit: canTeam(actor(req), 'team.audit') }) }))
router.get('/channels', run(async (req, res) => ok(res, await service.channels(actor(req)))))
router.get('/admin/audits', run(async (req, res) => ok(res, await service.audits(actor(req)))))
router.get('/admin/channels', run(async (req, res) => ok(res, await service.channels(actor(req), true))))
router.post('/channels', run(async (req, res) => ok(res, await service.create(actor(req), req.body))))
router.put('/channels/:id/members', run(async (req, res) => ok(res, await service.updateMembers(actor(req), req.params.id, req.body))))
router.get('/channels/:id/messages', run(async (req, res) => {
  const after = z.coerce.number().int().min(0).max(999999999999).parse(req.query.after ?? 0)
  return ok(res, await service.messages(actor(req), req.params.id, after, reason(req)))
}))
router.post('/channels/:id/messages', run(async (req, res) => ok(res, await service.send(actor(req), req.params.id, req.body))))
router.put('/channels/:id/read', run(async (req, res) => {
  const { seq } = z.object({ seq: z.number().int().nonnegative() }).strict().parse(req.body)
  return ok(res, await service.markRead(actor(req), req.params.id, seq))
}))
router.get('/channels/:id/receipts', run(async (req, res) => ok(res, await service.receipts(actor(req), req.params.id))))
router.post('/channels/:id/rounds/:action', run(async (req, res) => {
  const action = z.enum(['start', 'close']).parse(req.params.action)
  const { expectedVersion } = z.object({ expectedVersion: z.number().int().positive() }).strict().parse(req.body)
  return ok(res, await service.round(actor(req), req.params.id, action, expectedVersion))
}))
router.get('/channels/:id/minutes', run(async (req, res) => ok(res, await service.minutes(actor(req), req.params.id, reason(req)))))
router.get('/channels/:id/tasks', run(async (req, res) => ok(res, await service.tasks(actor(req), req.params.id, reason(req)))))
router.post('/channels/:id/tasks', run(async (req, res) => ok(res, await service.createTask(actor(req), req.params.id, req.body))))
router.post('/channels/:id/tasks/:taskId/actions', run(async (req, res) => ok(res, await service.taskAction(actor(req), req.params.id, req.params.taskId, req.body))))
router.put('/channels/:id/minutes/:roundId', run(async (req, res) => ok(res, await service.saveMinutes(actor(req), req.params.id, req.params.roundId, req.body, reason(req)))))
router.get('/channels/:id/minutes/:roundId/versions', run(async (req, res) => ok(res, await service.minuteVersions(actor(req), req.params.id, req.params.roundId, reason(req)))))
router.get('/channels/:id/files/:fileId', run(async (req, res) => {
  const file = await service.attachment(actor(req), req.params.id, req.params.fileId, reason(req))
  res.set({ 'Cache-Control': 'private, no-store', 'Content-Type': file.type, 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'attachment; filename="team-attachment"' })
  return res.sendFile(path.join(path.resolve(process.env.UPLOADS_PATH || path.resolve(__dirname, '../../uploads'), '.employee-private'), req.params.fileId))
}))
