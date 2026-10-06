import { validateVideoReferences } from './TrainingVideoStore'
import { createHash } from 'crypto'
import { z } from 'zod'
import prisma from '../config/database'
import seed from '../data/training-library.json'
import { trainingCatalogueSchema, getTrainingLibrary } from './TrainingLibraryService'

export const TRAINING_LIBRARY_PREFIX = 'training.library.'
export const LIBRARY_LIMITS = { bytes: 2 * 1024 * 1024, textCharacters: 20000, modules: 100, sections: 100, questions: 200, listItems: 200, historyPage: 20, historyMaxPage: 50 }
export const isTrainingLibraryKey = (key: unknown): boolean => typeof key === 'string' && key.startsWith(TRAINING_LIBRARY_PREFIX)
export const ordinaryConfigWhere = { NOT: { key: { startsWith: TRAINING_LIBRARY_PREFIX } } }
// Preserve only the reserved content namespace; normal full-sync config clearing remains intact.
export const clearOrdinarySyncedConfigs = (tx: any) => tx.config.deleteMany({ where: ordinaryConfigWhere })
const headKey = TRAINING_LIBRARY_PREFIX + 'head'
const revisionKey = (id: string) => TRAINING_LIBRARY_PREFIX + 'revision:' + id
const historyKey = (id: string) => TRAINING_LIBRARY_PREFIX + 'history:' + id
export class TrainingLibraryError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
const fail = (status: number, message: string): never => { throw new TrainingLibraryError(status, message) }
const uuid = z.string().uuid()
export const libraryWriteSchema = z.object({ requestId: uuid, expectedGeneration: uuid.nullable(), note: z.string().max(1000).default(''), catalogue: z.unknown().optional() }).strict()
type Actor = { id: string; storeId: string; role: string; phone?: string }
type Head = { generation: string; draft: string; published: string | null }
function scope(actor: Actor, write = false) {
  if (!actor.storeId) fail(403, 'TRAINING_STORE_REQUIRED')
  if (write && actor.role !== 'admin') fail(403, 'TRAINING_EDIT_FORBIDDEN')
}
export function validateLibrary(value: unknown) {
  if (Buffer.byteLength(JSON.stringify(value) || '', 'utf8') > LIBRARY_LIMITS.bytes) fail(413, 'TRAINING_CONTENT_TOO_LARGE')
  const parsed = trainingCatalogueSchema.safeParse(value)
  if (!parsed.success) fail(400, 'TRAINING_CONTENT_INVALID')
  return parsed.data
}
function snapshotContent(content: any, published: boolean) {
  const copy = JSON.parse(JSON.stringify(content))
  copy.modules.forEach((module: any) => { module.reviewed = published })
  if (copy.assessment) copy.assessment.reviewed = published
  return copy
}
async function head(db: any, storeId: string) {
  const row = await db.config.findUnique({ where: { storeId_key: { storeId, key: headKey } } })
  return { row, value: row ? JSON.parse(row.value) as Head : null }
}
async function revision(db: any, storeId: string, id: string) {
  if (!uuid.safeParse(id).success) fail(400, 'TRAINING_REVISION_INVALID')
  const row = await db.config.findUnique({ where: { storeId_key: { storeId, key: revisionKey(id) } } })
  if (!row) fail(404, 'TRAINING_REVISION_NOT_FOUND')
  if (Buffer.byteLength(row.value, 'utf8') > LIBRARY_LIMITS.bytes + 8192) fail(500, 'TRAINING_STORED_CONTENT_INVALID')
  return JSON.parse(row.value)
}
export async function readTrainingLibrary(actor: Actor) {
  scope(actor)
  const current = await head(prisma, actor.storeId)
  if (!current.value) return getTrainingLibrary()
  // Keep reviewed defaults readable while the store's first draft is being edited.
  // A persisted publication, including an intentionally empty one, always wins.
  if (!current.value.published) return getTrainingLibrary()
  const saved = await revision(prisma, actor.storeId, current.value.published)
  return { ...validateLibrary(saved.catalogue), revision: saved.id, preview: false }
}
export async function editTrainingLibrary(actor: Actor) {
  scope(actor, true)
  const current = await head(prisma, actor.storeId)
  const saved = current.value ? await revision(prisma, actor.storeId, current.value.draft) : null
  return { generation: current.value?.generation || null, publishedRevision: current.value?.published || null, draftRevision: current.value?.draft || null, catalogue: validateLibrary(saved?.catalogue || seed), limits: LIBRARY_LIMITS }
}
export async function getTrainingRevision(actor: Actor, id: string) {
  scope(actor, true)
  const saved = await revision(prisma, actor.storeId, id)
  return { ...saved, fingerprint: undefined }
}
export async function trainingHistory(actor: Actor, limit: number = 20, cursor?: string) {
  scope(actor, true)
  if (!Number.isInteger(limit) || limit < 1 || limit > LIBRARY_LIMITS.historyMaxPage) fail(400, 'TRAINING_HISTORY_LIMIT_INVALID')
  const where = { storeId: actor.storeId, key: { startsWith: TRAINING_LIBRARY_PREFIX + 'history:' } }
  if (cursor && !(await prisma.config.findFirst({ where: { ...where, id: cursor }, select: { id: true } }))) fail(404, 'TRAINING_HISTORY_CURSOR_NOT_FOUND')
  const rows = await prisma.config.findMany({ where, take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, value: true } })
  return { list: rows.slice(0, limit).map(row => JSON.parse(row.value)), nextCursor: rows.length > limit ? rows[limit - 1].id : null }
}
export async function writeTrainingLibrary(actor: Actor, kind: 'save' | 'restore' | 'publish', input: unknown, restoreId?: string) {
  scope(actor, true)
  const parsed = libraryWriteSchema.safeParse(input)
  if (!parsed.success) fail(400, 'TRAINING_WRITE_INVALID')
  const data = parsed.data
  if (kind === 'save' && data.catalogue === undefined) fail(400, 'TRAINING_CONTENT_REQUIRED')
  if (kind !== 'save' && data.catalogue !== undefined) fail(400, 'TRAINING_CONTENT_NOT_EXPECTED')
  if (kind === 'restore' && !uuid.safeParse(restoreId).success) fail(400, 'TRAINING_REVISION_INVALID')
  const content = kind === 'save' ? validateLibrary(data.catalogue) : null
  const fingerprint = createHash('sha256').update(JSON.stringify({ actorId: actor.id, kind, expectedGeneration: data.expectedGeneration, note: data.note, content, restoreId })).digest('hex')
  const replay = async (db: any) => {
    const row = await db.config.findUnique({ where: { storeId_key: { storeId: actor.storeId, key: revisionKey(data.requestId) } } })
    if (!row) return null
    const saved = JSON.parse(row.value)
    if (saved.fingerprint !== fingerprint) fail(409, 'TRAINING_REQUEST_CONFLICT')
    return { revision: saved.id, generation: saved.id, replayed: true }
  }
  const prior = await replay(prisma)
  if (prior) return prior
  try {
    return await prisma.$transaction(async tx => {
      const prior = await replay(tx)
      if (prior) return prior
      const current = await head(tx, actor.storeId)
      if ((current.value?.generation || null) !== data.expectedGeneration) fail(409, 'TRAINING_VERSION_CONFLICT')
      let value: any = content
      if (kind === 'restore') value = (await revision(tx, actor.storeId, restoreId!)).catalogue
      if (kind === 'publish') {
        if (!current.value) fail(409, 'TRAINING_SAVE_BEFORE_PUBLISH')
        value = (await revision(tx, actor.storeId, current.value.draft)).catalogue
      }
      value = snapshotContent(validateLibrary(value), kind === 'publish')
      try { await validateVideoReferences(actor, value) } catch { fail(400, 'TRAINING_VIDEO_REFERENCE_INVALID') }
      const next: Head = { generation: data.requestId, draft: data.requestId, published: kind === 'publish' ? data.requestId : current.value?.published || null }
      if (current.row) {
        const changed = await tx.config.updateMany({ where: { id: current.row.id, storeId: actor.storeId, value: current.row.value }, data: { value: JSON.stringify(next) } })
        if (changed.count !== 1) fail(409, 'TRAINING_VERSION_CONFLICT')
      } else {
        await tx.config.create({ data: { storeId: actor.storeId, key: headKey, value: JSON.stringify(next), category: 'training' } })
      }
      const metadata = { id: data.requestId, authorId: actor.id, author: actor.phone || actor.id, createdAt: new Date().toISOString(), kind, note: data.note, parent: current.value?.draft || null, restoredFrom: restoreId || null }
      await tx.config.create({ data: { storeId: actor.storeId, key: revisionKey(data.requestId), category: 'training', value: JSON.stringify({ ...metadata, fingerprint, catalogue: value }) } })
      await tx.config.create({ data: { storeId: actor.storeId, key: historyKey(data.requestId), category: 'training', value: JSON.stringify(metadata) } })
      return { revision: data.requestId, generation: data.requestId, replayed: false }
    })
  } catch (error: any) {
    // Competing first saves / SQLite busy / serialization failure: never overwrite.
    if (['P2002','P2034','P2028','P1008'].includes(error?.code) || /SQLITE_BUSY|database is locked/.test(error?.message || '')) {
      const saved = await replay(prisma)
      if (saved) return saved
      fail(409, 'TRAINING_VERSION_CONFLICT')
    }
    throw error
  }
}
