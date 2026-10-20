import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { EventRepository, EventState } from './eventsContract'

// Subscription secrets need encryption, not hashing: signing requires the original key.
// Key is supplied by the isolated composition root. No credential provisioning or production mount.
export function postgresEventRepository(db: any, encryptionKey: Buffer): EventRepository {
  if (encryptionKey.length !== 32) throw Error('MCP_EVENT_KEY_REQUIRED')
  const key = 'externalAgent.events.v1'
  function seal(state: EventState, storeId: string) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey, iv)
    cipher.setAAD(Buffer.from(key + ':' + storeId))
    const data = Buffer.concat([cipher.update(JSON.stringify(state), 'utf8'), cipher.final()])
    return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') })
  }
  function open(value: string, storeId: string): EventState {
    const row = JSON.parse(value)
    if (row.v !== 1) throw Error('MCP_EVENT_STATE_INVALID')
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(row.iv, 'base64'))
    decipher.setAAD(Buffer.from(key + ':' + storeId)); decipher.setAuthTag(Buffer.from(row.tag, 'base64'))
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(row.data, 'base64')), decipher.final()]).toString('utf8'))
  }
  return { transaction: (storeId, work) => db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}), hashtext(${storeId}))`
    const where = { storeId_key: { storeId, key } }, row = await tx.config.findUnique({ where })
    const state = row ? open(row.value, storeId) : { subscriptions: [], deliveries: {} }
    const result = await work(state)
    const value = seal(state, storeId)
    await tx.config.upsert({ where, create: { storeId, key, value, category: 'externalAgent' }, update: { value } })
    return result
  }) }
}
