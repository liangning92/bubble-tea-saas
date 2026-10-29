import { createHash } from 'crypto'
import { z } from 'zod'
import { TeamError, readTeam, writeTeam } from '../TeamCommunicationService'
import { readTrainingLibrary, trainingContentFingerprint } from '../TrainingLibraryStore'
import type { BridgeGrant } from './contract'

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v)
const hygiene = z
  .object({
    action: z.literal('assign_standard'),
    staffId: z.string().min(1).max(128),
    date: day,
    areaCode: z.string().min(1).max(128),
  })
  .strict()
const training = z
  .object({
    action: z.literal('assign_published_course'),
    staffId: z.string().min(1).max(128),
    date: day,
    courseKey: z.string().min(1).max(128),
  })
  .strict()
export function isStandardRoutine(name: string, args: any) {
  return (
    (name === 'employee_manage_hygiene' && hygiene.safeParse(args).success) ||
    (name === 'employee_manage_training' && training.safeParse(args).success)
  )
}
/** Deterministic declassification: only real IDs, date and already-public material
 * cross from the internal planning context. No model-authored text/notes/grades.
 * It reuses native tasks/training records in the caller's existing transaction.
 */
export async function executeStandardRoutine(
  db: any,
  grant: BridgeGrant,
  name: string,
  raw: unknown,
  operationId: string,
) {
  const args = name === 'employee_manage_hygiene' ? hygiene.parse(raw) : training.parse(raw)
  const needed = name === 'employee_manage_hygiene' ? 'hygiene.write' : 'training.write'
  if (!(grant.actions as string[]).includes(needed))
    throw new TeamError(403, 'EMPLOYEE_BUSINESS_ACTION_NOT_GRANTED')
  const staff = await db.staff.findFirst({
    where: { id: args.staffId, storeId: grant.storeId, status: 'active' },
    select: { id: true },
  })
  if (!staff) throw new TeamError(403, 'EMPLOYEE_BUSINESS_STAFF_NOT_FOUND')
  const key = 'standardRoutine.receipt.' + createHash('sha256').update(operationId).digest('hex')
  const inputHash = createHash('sha256')
    .update(JSON.stringify([name, args]))
    .digest('hex')
  const old = await readTeam<any>(db, grant.storeId, key)
  if (old) {
    if (old.inputHash !== inputHash) throw new TeamError(409, 'EMPLOYEE_STANDARD_ROUTINE_CONFLICT')
    return { ...old, alreadyRecorded: true }
  }
  let receipt: any
  if (args.action === 'assign_standard') {
    const area = await db.hygieneArea.findFirst({
      where: { storeId: grant.storeId, code: args.areaCode, isActive: true },
      select: { code: true, name: true },
    })
    if (!area) throw new TeamError(403, 'EMPLOYEE_HYGIENE_AREA_NOT_FOUND')
    const task = await db.hygieneTask.create({
      data: {
        storeId: grant.storeId,
        staffId: staff.id,
        name: 'Pembersihan rutin: ' + area.name,
        areaCode: area.code,
        date: args.date,
        time: '00:00',
        priority: 2,
        status: 'pending',
        isTemporary: true,
        note: 'Bersihkan area sesuai SOP toko. Kirim bukti setelah selesai. Tugas ini belum dinyatakan selesai.',
      },
    })
    await db.hygieneTaskLog.create({
      data: {
        taskId: task.id,
        action: 'created',
        performedBy: 'agent:' + grant.agentId,
        note: 'Standard operational template v1; no private planning text copied.',
      },
    })
    receipt = {
      ok: true,
      operationRecorded: true,
      taskId: task.id,
      staffId: staff.id,
      date: args.date,
      source: { kind: 'fixed_operational_template', version: 1, areaCode: area.code },
      physicalCompletion: false,
    }
  } else {
    const library = await readTrainingLibrary(
      { id: 'agent:' + grant.agentId, storeId: grant.storeId, role: 'staff' },
      db,
    )
    const course = library.modules.find((m: any) => m.key === args.courseKey && m.reviewed === true)
    if (!course) throw new TeamError(403, 'EMPLOYEE_PUBLISHED_COURSE_NOT_FOUND')
    const title = course.title.id || course.title.en || course.title.zh
    const duration = Math.max(1, Math.ceil((course.minutes || 30) / 60))
    const start = new Date(args.date + 'T02:00:00.000Z')
    const record = await db.training.create({
      data: {
        storeId: grant.storeId,
        staffId: staff.id,
        trainingType: 'product',
        title,
        startDate: start,
        endDate: new Date(start.getTime() + duration * 3600000),
        duration,
        status: 'scheduled',
        notes:
          'Materi yang sudah diterbitkan: ' +
          course.key +
          '. Pelajari SOP dan lakukan latihan saat jam kerja. Hasil latihan belum dinilai.',
      },
    })
    receipt = {
      ok: true,
      operationRecorded: true,
      trainingId: record.id,
      staffId: staff.id,
      status: 'scheduled',
      source: {
        kind: 'published_training_module',
        courseKey: course.key,
        revision: (library as any).revision || 'reviewed_seed',
        fingerprint: trainingContentFingerprint('module', course),
      },
      physicalCompletion: false,
    }
  }
  const result = { ...receipt, inputHash, operationId }
  await writeTeam(db, grant.storeId, key, result)
  await db.financeAuditLog.create({
    data: {
      storeId: grant.storeId,
      userId: 'agent:' + grant.agentId,
      action: 'create',
      entityType: 'hermes_standard_routine',
      entityId: operationId,
      description: 'Execute routine from fixed or already-published operational material',
      newValue: JSON.stringify(result),
    },
  })
  return result
}
