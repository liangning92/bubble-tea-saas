import { createHash } from 'crypto'
import prisma from '../config/database'

export const evidenceMetadata = {
  id: true, storeId: true, orderId: true, amount: true, uploadedBy: true,
  createdAt: true, confirmedBy: true, confirmedAt: true, verification: true,
  mimeType: true
} as const

export function paymentImageType(image: Buffer): string {
  if (!image || image.length < 12 || image.length > 5 * 1024 * 1024) throw new Error('INVALID_PAYMENT_IMAGE')
  if (image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png'
  if (image[0] === 255 && image[1] === 216 && image[2] === 255 && image[image.length-2] === 255 && image[image.length-1] === 217) return 'image/jpeg'
  if (image.toString('ascii',0,4) === 'RIFF' && image.toString('ascii',8,12) === 'WEBP') return 'image/webp'
  throw new Error('INVALID_PAYMENT_IMAGE')
}

export async function savePaymentEvidence(storeId: string, actorId: string, amount: number, image: Buffer) {
  if (!storeId || !actorId || !Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000000) throw new Error('INVALID_PAYMENT_EVIDENCE')
  const mimeType = paymentImageType(image)
  const sha256 = createHash('sha256').update(image).digest('hex')
  const record = await prisma.paymentEvidence.upsert({
    where: { storeId_sha256: { storeId, sha256 } }, update: {},
    create: { storeId, uploadedBy: actorId, amount, mimeType, sha256, image },
    select: evidenceMetadata
  })
  if (record.uploadedBy !== actorId || record.amount !== amount || record.orderId || record.confirmedAt) throw new Error('PAYMENT_EVIDENCE_ALREADY_USED')
  return record
}

export async function getPaymentEvidence(id: string, storeId: string) {
  // Deliberately no global-admin bypass for customer financial photographs.
  if (!storeId) return null
  return prisma.paymentEvidence.findFirst({ where: { id, storeId } })
}
