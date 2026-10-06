import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import prisma from '../config/database'
import { validateMp4Avc } from './TrainingVideoValidation'

export const VIDEO_LIMIT = 20 * 1024 * 1024
// Private inside the existing uploads volume; index.ts explicitly blocks this directory on the static route.
export const videoRoot = () => path.resolve(process.env.UPLOADS_PATH || path.join(__dirname, '../../uploads'), '.training-private')
const prefix = 'training.library.video:'
const videoKey = (id: string) => prefix + id
const idSchema = z.string().uuid()
type Actor = { storeId: string; role: string }
export type VideoMetadata = { id: string; name: string; size: number; createdAt: string }

export function validateVideo(data: Buffer, mime: string, name: string) {
  if (!data.length || data.length > VIDEO_LIMIT) throw Error('TRAINING_VIDEO_SIZE')
  if (mime !== 'video/mp4' || path.extname(name).toLowerCase() !== '.mp4') throw Error('TRAINING_VIDEO_FORMAT')
  validateMp4Avc(data)
}
export async function saveVideo(actor: Actor, data: Buffer, name: string, mime: string) {
  validateVideo(data, mime, name)
  const root = videoRoot(); await fs.mkdir(root, { recursive: true, mode: 0o700 })
  const id = randomUUID(), filename = path.join(root, id + '.mp4')
  const metadata: VideoMetadata = { id, name: path.basename(name).slice(0, 255), size: data.length, createdAt: new Date().toISOString() }
  await fs.writeFile(filename, data, { flag: 'wx', mode: 0o600 })
  try { await prisma.config.create({ data: { storeId: actor.storeId, key: videoKey(id), category: 'training', value: JSON.stringify(metadata) } }) }
  catch (error) { await fs.unlink(filename); throw error }
  return metadata
}
export async function ownedVideo(actor: Actor, id: string) {
  if (!actor.storeId || !idSchema.safeParse(id).success) return null
  const row = await prisma.config.findUnique({ where: { storeId_key: { storeId: actor.storeId, key: videoKey(id) } } })
  return row ? JSON.parse(row.value) as VideoMetadata : null
}
export function referencedVideos(catalogue: { modules?: { sections?: { videoId?: string }[] }[] }): string[] {
  return [...new Set((catalogue.modules || []).flatMap(m => (m.sections || []).map(s => s.videoId).filter((id): id is string => !!id)))]
}
export async function validateVideoReferences(actor: Actor, catalogue: Parameters<typeof referencedVideos>[0]) {
  for (const id of referencedVideos(catalogue)) {
    if (!await ownedVideo(actor, id)) throw Error('TRAINING_VIDEO_NOT_FOUND')
    await fs.access(path.join(videoRoot(), id + '.mp4'))
  }
}
