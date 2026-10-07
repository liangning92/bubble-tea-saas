import { db } from '../db/offline'

// Exercise the business database without touching orders, products or the sync queue.
export async function probeLocalStorage(): Promise<boolean> {
  const key = `diagnostics.probe.${crypto.randomUUID()}`
  const value = crypto.randomUUID()
  try {
    await db.config.put({ key, value, updatedAt: new Date() })
    const saved = await db.config.get(key)
    if (saved?.value !== value) return false
    await db.config.delete(key)
    return (await db.config.get(key)) === undefined
  } catch {
    return false
  } finally {
    await db.config.delete(key).catch(() => {})
  }
}
