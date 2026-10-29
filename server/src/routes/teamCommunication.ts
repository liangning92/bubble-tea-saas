import { operationsOwnerState, createOperationsDelegation, revokeOperationsDelegation } from '../services/StoreOperationsDelegationService'
import { agentMemoryService } from '../services/AgentMemoryService'
import { Router } from 'express'
import path from 'path'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../middlewares/auth'
import { canTeam, teamCommunication, TeamActor, TeamError } from '../services/TeamCommunicationService'
import { teamAi } from '../services/TeamAiService'
import { teamOperations } from '../services/TeamOperationsService'
import { listActions, advanceAction } from '../services/TeamManagementActions'
import { readTeam } from '../services/TeamCommunicationService'
import { teamManagementDefaults } from '../services/TeamManagementDefaults'
import prisma from '../config/database'
import { teamWorkflow } from '../services/TeamWorkflowService'
import { wakeEmployeeDelivery } from '../services/EmployeeReminderService'
import { agentSettingsService } from '../services/AgentSettingsService'
import { describeNativeBody } from '../utils/validation'
import { createChannelSchema, messageSchema, minutesSchema } from '../services/TeamCommunicationService'

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
// Called only after the awaited service's outer HTTP transaction has committed.
// A dropped response still leaves the durable reminder for the normal sweep.
const messageCommitted = (req: AuthRequest, res: any, data: unknown) => {
  const storeId = actor(req).storeId
  res.once('finish', () => wakeEmployeeDelivery(storeId))
  return ok(res, data)
}
const ai = teamAi()
const operations = teamOperations()
const workflow = teamWorkflow()
const managementDefaults = teamManagementDefaults(prisma)
const agentSettings = agentSettingsService(prisma)
const agentMemory = agentMemoryService(prisma)
router.get('/workflow/defaults',run(async(req,res)=>ok(res,await managementDefaults.read(actor(req),req.query.requestId===undefined?undefined:z.string().uuid().parse(req.query.requestId)))))
router.put('/workflow/defaults',run(async(req,res)=>ok(res,await managementDefaults.save(actor(req),req.body))))
const workflowAfter = (req: AuthRequest) => z.coerce.number().int().nonnegative().max(999999999999).parse(req.query.after ?? 0)
router.get('/channels/:id/management/actions',run(async(req,res)=>{
  const a=actor(req),actions=await listActions(prisma,a,req.params.id)
  const rid=req.query.requestId===undefined?undefined:z.string().uuid().parse(req.query.requestId)
  const receipt=rid?await readTeam(prisma,a.storeId,`management.action.request.${a.staffId}.${rid}`):null
  return ok(res,{actions,...(receipt&&actions.some(x=>x.id===receipt.actionId)?{requestReceipt:{requestId:rid,actionId:receipt.actionId}}:{})})
}))
router.post('/channels/:id/management/actions/:actionId/actions',run(async(req,res)=>{
  const {expectedVersion,...input}=z.object({expectedVersion:z.number().int().positive()}).passthrough().parse(req.body)
  return ok(res,await prisma.$transaction((tx:any)=>advanceAction(tx,actor(req),req.params.id,req.params.actionId,expectedVersion,input)))
}))
router.get('/channels/:id/workflow/policy', run(async (req, res) => ok(res, await workflow.policy(actor(req), req.params.id))))
router.put('/channels/:id/workflow/policy', run(async (req, res) => ok(res, await workflow.savePolicy(actor(req), req.params.id, req.body))))
router.get('/channels/:id/workflow/jobs', run(async (req, res) => ok(res, await workflow.jobs(actor(req), req.params.id, workflowAfter(req), req.query.requestId === undefined ? undefined : z.string().uuid().parse(req.query.requestId)))))
router.get('/channels/:id/workflow/events', run(async (req, res) => ok(res, await workflow.events(actor(req), req.params.id, workflowAfter(req)))))
router.post('/channels/:id/workflow/jobs/:seq/actions', run(async (req, res) => {
  const result = await workflow.action(actor(req), req.params.id,
    z.coerce.number().int().positive().max(999999999999).parse(req.params.seq), req.body)
  return req.body.action === 'approve_reply' ? messageCommitted(req, res, result) : ok(res, result)
}))
router.get('/channels/:id/workflow/export', run(async (req, res) => ok(res, await workflow.export(actor(req), req.params.id, workflowAfter(req)))))
router.get('/channels/:id/operations', run(async (req, res) => ok(res, await operations.list(actor(req), req.params.id))))
router.post('/channels/:id/operations/import', run(async (req, res) => ok(res, await operations.import(actor(req), req.params.id, req.body))))
router.post('/channels/:id/operations/:planId/actions', run(async (req, res) => ok(res, await operations.action(actor(req), req.params.id, req.params.planId, req.body))))
router.post('/channels/:id/operations/:planId/scan', run(async (req, res) => ok(res, await operations.scan(actor(req), req.params.id, req.params.planId, req.body))))
router.get('/channels/:id/operations/:planId/export', run(async (req, res) => ok(res, await operations.export(actor(req), req.params.id, req.params.planId))))
router.get('/ai/settings', run(async (req, res) => ok(res, await ai.settings(actor(req)))))
router.put('/ai/settings', run(async (req, res) => ok(res, await ai.saveSettings(actor(req), req.body))))
router.post('/ai/connection-check', run(async (req, res) => ok(res, await ai.checkConnection(actor(req), req.body))))
router.get('/ai/agent-memory', run(async (req,res)=>ok(res,await agentMemory.list(actor(req),req.query.query||''))))
router.get('/ai/agent-memory/:id/history', run(async (req,res)=>ok(res,await agentMemory.history(actor(req),req.params.id))))
router.put('/ai/agent-memory/:id', run(async (req,res)=>ok(res,await agentMemory.update(actor(req),req.params.id,req.body))))
router.get('/ai/agent-settings', run(async (req, res) => ok(res, await agentSettings.getSettings(actor(req)))))
router.put('/ai/agent-settings', run(async (req, res) => ok(res, await agentSettings.saveSettings(actor(req), req.body))))
router.post('/ai/agent-check', run(async (req, res) => ok(res, await agentSettings.checkConnection(actor(req), req.body))))
router.post('/channels/:id/ai/drafts', run(async (req, res) => ok(res, await ai.generate(actor(req), req.params.id, req.body))))
router.get('/channels/:id/ai/drafts/:draftId', run(async (req, res) => ok(res, await ai.draft(actor(req), req.params.id, req.params.draftId))))
router.post('/channels/:id/ai/drafts/:draftId/publish', run(async (req, res) => {
  const { text } = z.object({ text: z.string().trim().min(1).max(3800) }).strict().parse(req.body)
  return messageCommitted(req, res, await service.send(actor(req), req.params.id, { requestId: z.string().uuid().parse(req.params.draftId), text, files: [] }, req.params.draftId))
}))
router.get('/directory', run(async (req, res) => ok(res, await service.directory(actor(req)))))
router.get('/capabilities', run(async (req, res) => { await service.directory(actor(req)); return ok(res, { manage: canTeam(actor(req), 'team.manage'), audit: canTeam(actor(req), 'team.audit') }) }))
router.get('/channels', run(async (req, res) => ok(res, await service.channels(actor(req)))))
router.get('/admin/audits', run(async (req, res) => ok(res, await service.audits(actor(req)))))
router.get('/admin/channels', run(async (req, res) => ok(res, await service.channels(actor(req), true))))
router.post('/channels', describeNativeBody(createChannelSchema), run(async (req, res) => ok(res, await service.create(actor(req), req.body))))
router.put('/channels/:id/members', run(async (req, res) => ok(res, await service.updateMembers(actor(req), req.params.id, req.body))))
router.get('/channels/:id/messages', run(async (req, res) => {
  const after = z.coerce.number().int().min(0).max(999999999999).parse(req.query.after ?? 0)
  return ok(res, await service.messages(actor(req), req.params.id, after, reason(req)))
}))
router.post('/channels/:id/messages', describeNativeBody(messageSchema), run(async (req, res) => messageCommitted(req, res, await service.send(actor(req), req.params.id, req.body))))
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
router.put('/channels/:id/minutes/:roundId', describeNativeBody(minutesSchema), run(async (req, res) => ok(res, await service.saveMinutes(actor(req), req.params.id, req.params.roundId, req.body, reason(req)))))
router.get('/channels/:id/minutes/:roundId/versions', run(async (req, res) => ok(res, await service.minuteVersions(actor(req), req.params.id, req.params.roundId, reason(req)))))
router.get('/channels/:id/files/:fileId', run(async (req, res) => {
  const file = await service.attachment(actor(req), req.params.id, req.params.fileId, reason(req))
  res.set({ 'Cache-Control': 'private, no-store', 'Content-Type': file.type, 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'attachment; filename="team-attachment"' })
  return res.sendFile(path.join(path.resolve(process.env.UPLOADS_PATH || path.resolve(__dirname, '../../uploads'), '.employee-private'), req.params.fileId))
}))

const operationsOwner=(req:AuthRequest)=>{if(req.user?.role!=='admin'||req.user.employeeApp)throw new TeamError(403,'OPERATIONS_OWNER_REQUIRED');return req.user}
router.get('/ai/operations-delegations',run(async(req,res)=>{const a=operationsOwner(req);ok(res,await operationsOwnerState(a.storeId,a.id))}))
router.post('/ai/operations-delegations',run(async(req,res)=>{const a=operationsOwner(req);ok(res,await createOperationsDelegation(a.storeId,a.id,req.body))}))
router.post('/ai/operations-delegations/:id/revoke',run(async(req,res)=>{const a=operationsOwner(req);ok(res,await revokeOperationsDelegation(a.storeId,a.id,z.string().uuid().parse(req.params.id)))}))
