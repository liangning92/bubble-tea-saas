// Shared discount breakdown. Amounts are integer IDR; every surface prints the same buckets.
export type DiscountSource = 'activity' | 'coupon' | 'points' | 'manual'

export interface DiscountLine {
  key: DiscountSource
  amount: number
  name?: string | null
  sourceId?: string | null
}

export interface DiscountBreakdown {
  lines: DiscountLine[]
  total: number
  activityName?: string | null
  activitySource?: string | null
}

export interface AppliedDiscount {
  id?: string | null
  name?: string | null
  kind?: string | null
  discount?: number | null
}

const amount = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0)

// The winning quote candidate is the only automatic discount; manual discounts are added on top.
export function buildDiscountBreakdown(input: { applied?: AppliedDiscount | null; pointsValue?: number | null; manualDiscountAmount?: number | null }): DiscountBreakdown {
  const applied = input.applied || null
  const lines: DiscountLine[] = []
  const kind = applied?.kind || ''
  const appliedAmount = amount(applied?.discount)
  if (appliedAmount > 0 && (kind === 'activity' || kind === 'coupon')) {
    lines.push({ key: kind, amount: appliedAmount, name: applied?.name || null, sourceId: applied?.id || null })
  }
  const pointsValue = amount(input.pointsValue)
  if (kind === 'points') {
    const points = pointsValue > 0 ? pointsValue : appliedAmount
    if (points > 0) lines.push({ key: 'points', amount: points, name: applied?.name || null, sourceId: applied?.id || null })
  } else if (pointsValue > 0) {
    lines.push({ key: 'points', amount: pointsValue, name: applied?.name || null, sourceId: applied?.id || null })
  }
  const manual = amount(input.manualDiscountAmount)
  if (manual > 0) lines.push({ key: 'manual', amount: manual, name: null, sourceId: null })
  return { lines, total: lines.reduce((sum, line) => sum + line.amount, 0), activityName: applied?.name || null, activitySource: kind || null }
}

// The authoritative order total: the stored discount plus the points value that is never stored in discountAmount.
export function orderDiscountTotal(order: { discountAmount?: number | null; pointsDiscountAmount?: number | null }): number {
  return amount(order?.discountAmount) + amount(order?.pointsDiscountAmount)
}

export function orderDiscountActivityName(order: { activityName?: string | null; activitySource?: string | null }): string | null {
  if (!order?.activityName) return null
  if (order.activitySource === 'points') return null
  return order.activityName
}
