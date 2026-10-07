import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import prisma from '../config/database'
import { videoRoot } from './TrainingVideoStore'
export const DOCUMENT_LIMIT = 20 * 1024 * 1024
const key = (id: string) => 'training.library.document:' + id
const uuid = z.string().uuid()
type Actor = { storeId: string; role: string }
export type DocumentMetadata = { id: string; name: string; size: number; createdAt: string }
export async function saveDocument(actor: Actor, data: Buffer, name: string, mime: string) {
  if (!actor.storeId || actor.role !== 'admin') throw Error('TRAINING_DOCUMENT_FORBIDDEN')
  if (!data.length || data.length > DOCUMENT_LIMIT) throw Error('TRAINING_DOCUMENT_SIZE')
  if (mime !== 'application/pdf' || path.extname(name).toLowerCase() !== '.pdf' || !data.subarray(0, 5).equals(Buffer.from('%PDF-')) || !data.subarray(-2048).includes(Buffer.from('%%EOF'))) throw Error('TRAINING_DOCUMENT_FORMAT')
  const root = videoRoot(); await fs.mkdir(root, { recursive: true, mode: 0o700 })
  const id = randomUUID(), file = path.join(root, id + '.pdf')
  const metadata: DocumentMetadata = { id, name: path.basename(name).slice(0, 255), size: data.length, createdAt: new Date().toISOString() }
  await fs.writeFile(file, data, { flag: 'wx', mode: 0o600 })
  try { await prisma.config.create({ data: { storeId: actor.storeId, key: key(id), category: 'training', value: JSON.stringify(metadata) } }) }
  catch (error) { await fs.unlink(file); throw error }
  return metadata
}
export async function ownedDocument(actor: Actor, id: string) {
  if (!actor.storeId || !uuid.safeParse(id).success) return null
  const row = await prisma.config.findUnique({ where: { storeId_key: { storeId: actor.storeId, key: key(id) } } })
  return row ? JSON.parse(row.value) as DocumentMetadata : null
}
export function referencedDocuments(catalogue: { modules?: { sections?: { documentId?: string }[] }[] }) {
  return [...new Set((catalogue.modules || []).flatMap(m => (m.sections || []).map(s => s.documentId).filter((id): id is string => !!id)))]
}
export async function validateDocumentReferences(actor: Actor, catalogue: Parameters<typeof referencedDocuments>[0]) {
  for (const id of referencedDocuments(catalogue)) {
    if (!await ownedDocument(actor, id)) throw Error('TRAINING_DOCUMENT_NOT_FOUND')
    await fs.access(path.join(videoRoot(), id + '.pdf'))
  }
}
