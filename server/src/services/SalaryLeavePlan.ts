import { businessDate, dayNumber, monthlyRateCents, WorkingDays, ProbationInputError } from './ProbationService'

// Paid rest/leave is already included in a monthly salary. Deduct only verified
// unpaid dates; multiple overlapping records cannot charge more than one day.
export function unpaidLeavePlan(staff: any, enrollment: any, basis: any, leaves: any[], unpaidCodes: Set<string>, override?: WorkingDays) {
  const dates = new Map<string, number>()
  for (const leave of leaves) {
    if (!unpaidCodes.has(leave.leaveType)) continue
    const first = dayNumber(businessDate(leave.startDate)), last = dayNumber(businessDate(leave.endDate))
    for (let day = first; day <= last; day++) {
      const date = new Date(day * 86400000).toISOString().slice(0, 10)
      if (!basis.segments.some((s: any) => date >= s.startDate && date <= s.endDate)) continue
      dates.set(date, Math.max(dates.get(date) || 0, leave.halfDay ? 0.5 : 1))
    }
  }
  const days: WorkingDays = { probation: 0, regular: 0 }
  let numerator = 0
  if (override) {
    for (const type of ['probation', 'regular'] as const) {
      const segment = basis.segments.find((s: any) => s.type === type)
      if (override[type] > (segment?.eligibleDays ?? segment?.days ?? 0)) throw new ProbationInputError('UNPAID_DAYS_EXCEED_EMPLOYMENT_DAYS')
      days[type] = override[type]
      numerator += override[type] * (segment?.monthlyRate || 0) * 100
    }
  } else {
    for (const [date, count] of dates) {
      const segment = basis.segments.find((s: any) => date >= s.startDate && date <= s.endDate)
      days[segment.type as 'probation' | 'regular'] += count
      numerator += monthlyRateCents(staff, enrollment, date) * count
    }
  }
  // Round net base pay once; disclosure and payment reconcile to the rupiah.
  const deduction = basis.amount - Math.round((basis.amount * 100 * basis.daysInMonth - numerator) / (100 * basis.daysInMonth))
  return { days, deduction: Math.max(0, deduction), source: override ? 'manual' : 'approved_leave' }
}
