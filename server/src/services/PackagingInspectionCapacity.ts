import { TeamActor, TeamError, readTeam, writeTeam } from './TeamCommunicationService'

const slotKey = (channelId: string, jobId: string) => `inspection.planSlot.${channelId}.${jobId}`
const taskSlotKey = (channelId: string, jobId: string) => `inspection.taskSlot.${channelId}.${jobId}`
/** Every task creation path shares the channel lock and counts outstanding inspection reservations. */
export async function operationTaskCapacity(db: any, a: TeamActor, channelId: string, requested: number, reservationId?: string) {
  const [tasks, slots] = await Promise.all([
    db.config.count({ where: { storeId: a.storeId, key: { startsWith: `team.communication.task.${channelId}.` } } }),
    db.config.count({ where: { storeId: a.storeId, key: { startsWith: `team.communication.inspection.taskSlot.${channelId}.` } } })
  ])
  const own = reservationId && await readTeam(db, a.storeId, taskSlotKey(channelId, reservationId))
  if (reservationId && (!own || own.actorId !== a.id || own.staffId !== a.staffId || requested !== 1)) throw new TeamError(409, 'INSPECTION_TASK_SLOT_LOST')
  if (tasks + slots + requested - (own ? 1 : 0) > 200) throw new TeamError(409, 'TEAM_TASK_LIMIT')
}
/** Caller holds the channel lock. Manual imports must count these durable reservations too. */
export async function operationPlanCapacity(db: any, a: TeamActor, channelId: string, reservationId?: string) {
  const [plans, slots] = await Promise.all([
    db.config.count({ where: { storeId: a.storeId, key: { startsWith: `team.communication.operationPlan.${channelId}.` } } }),
    db.config.count({ where: { storeId: a.storeId, key: { startsWith: `team.communication.inspection.planSlot.${channelId}.` } } })
  ])
  const own = reservationId && await readTeam(db, a.storeId, slotKey(channelId, reservationId))
  if (reservationId && (!own || own.actorId !== a.id || own.staffId !== a.staffId)) throw new TeamError(409, 'INSPECTION_PLAN_SLOT_LOST')
  if (plans + slots >= 50 + (own ? 1 : 0)) throw new TeamError(409, 'TEAM_PLAN_LIMIT')
}
export async function reserveInspectionPlan(db: any, a: TeamActor, channelId: string, jobId: string) {
  await operationPlanCapacity(db, a, channelId)
  await operationTaskCapacity(db, a, channelId, 1)
  await writeTeam(db, a.storeId, slotKey(channelId, jobId), { actorId: a.id, staffId: a.staffId, jobId })
  await writeTeam(db, a.storeId, taskSlotKey(channelId, jobId), { actorId: a.id, staffId: a.staffId, jobId })
}
export async function releaseInspectionTask(db: any, storeId: string, channelId: string, jobId: string) {
  await db.config.deleteMany({ where: { storeId, key: 'team.communication.' + taskSlotKey(channelId, jobId) } })
}
export async function releaseInspectionPlan(db: any, storeId: string, channelId: string, jobId: string) {
  await db.config.deleteMany({ where: { storeId, key: 'team.communication.' + slotKey(channelId, jobId) } })
}
