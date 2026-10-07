import prisma from '../config/database'
import { replicaKey } from './ReceiptSyncService'

// Check only orders actually included in the report, using protected per-order
// markers. v1 proves the sale snapshot, not its cumulative refunds. Receipt and
// marker creation are atomic; a later unrelated receipt cannot widen this set.
export async function requireVerifiedReceiptIncome(orders: readonly { id: string; storeId: string }[]) {
  for (let offset = 0; offset < orders.length; offset += 200) {
    const replica = await prisma.config.findFirst({
      where: { OR: orders.slice(offset, offset + 200).map(order => ({
        storeId: order.storeId, key: replicaKey(order.id)
      })) },
      select: { id: true }
    })
    if (replica) throw new Error('RECEIPT_NET_INCOME_UNVERIFIED')
  }
}
