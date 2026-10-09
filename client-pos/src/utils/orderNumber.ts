/** Ten base32 characters retain the server allocator's 50 random bits. */
export function posOrderNumber(localId: string, date: Date): string {
  const uuid = localId.slice(6)
  if (!/^LOCAL-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(localId) || !Number.isFinite(date.getTime())) throw new Error('CHECKOUT_RECOVERY_INVALID')
  const random = BigInt('0x' + uuid.replace(/-/g, '').slice(-13)) & ((1n << 50n) - 1n)
  return random.toString(32).toUpperCase().padStart(10, '0')
}

export const syncOrderNumberPattern = /^(?:[0-9A-V]{10}|ORD\d{8}-[0-9A-V]{10}|OFFLINE-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i

/** Keep pending pre-upgrade requests byte-for-byte unchanged. */
export function matchesCheckoutNumber(number: string, localId: string, date: Date): boolean {
  if (number === `OFFLINE-${localId.slice(6)}`) return true
  const compact = posOrderNumber(localId, date)
  const day = new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10).replace(/-/g, '')
  return number === compact || number === `ORD${day}-${compact}`
}
