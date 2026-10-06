/** A live document holds this lock across HTTP. Closing it releases ownership. */
export async function withCheckoutSyncLock<T>(storeId: string, work: () => Promise<T>): Promise<T> {
  if (!navigator.locks) return work()
  return navigator.locks.request(`checkout.sync:${encodeURIComponent(storeId)}`, {mode:'exclusive',ifAvailable:true}, async lock => {
    if (!lock) throw new Error('CHECKOUT_SYNC_ACTIVE')
    return work()
  })
}

// In environments without Web Locks, expiry only permits unknown-record isolation.
// It never authorizes automatic retry or establishes whether the request committed.
export const checkoutSyncLeaseMs = 60_000
