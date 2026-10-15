// Defaults preserve existing stores until an administrator saves their policy.
export const defaultStaffRules = {
  paidRestDays: 2,
  paidRestEligibility: 'full_month' as 'full_month' | 'prorated' | 'any_employment',
  blockedLeaveWeekdays: [0, 6] as number[],
  allowHalfDayLeave: true,
  annualLeaveDays: 12,
  sickLeaveDays: 14,
  tenureBonusEnabled: true,
  tenureBonusYears: 5,
  tenureAnnualLeaveDays: 15,
  dailyRateDivisor: 26,
  overtimeMonthlyHours: 176,
  attendanceBonusDays: 24,
  attendanceBonusAmount: 200000,
}
export type StaffRules = typeof defaultStaffRules
export function leaveRestrictionMessage(days: number[], language: string) {
  const zh = language.startsWith('zh'), id = language.startsWith('id')
  const names = zh ? ['周日','周一','周二','周三','周四','周五','周六'] : id ? ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'] : ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const selected = days.map(day => names[day]).join(zh ? '、' : ', ')
  return days.length ? (zh ? `门店禁止在${selected}休假。` : id ? `Cuti tidak diizinkan pada ${selected}.` : `Leave is not allowed on ${selected}.`) : (zh ? '门店未限制休假的星期。' : id ? 'Tidak ada pembatasan hari cuti.' : 'No weekday restrictions on leave.')
}
