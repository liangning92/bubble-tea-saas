import { adjustmentPlan } from './SalaryAdjustmentService'
import { salaryDepositPlan } from './SalaryDepositPlan'
import { getStaffConfig } from './StaffConfigService'
import { formatDate, startOfDay } from '../utils/dateUtils'
import { containsText } from '../utils/textSearch'
import prisma from '../config/database'
import bcrypt from 'bcryptjs'

export interface StaffFilter {
  storeId?: string
  position?: string
  status?: string
  search?: string
}

// Get staff list
export async function getStaff(filter: StaffFilter) {
  const where: any = {}

  if (filter.storeId) where.storeId = filter.storeId
  if (filter.position) where.position = filter.position
  if (filter.status) where.status = filter.status
  if (filter.search) {
    where.OR = [
      { name: containsText(filter.search) },
      { user: { phone: containsText(filter.search) } }
    ]
  }

  return prisma.staff.findMany({
    where,
    include: {
      store: { select: { id: true, name: true } },
      user: { select: { id: true, phone: true, role: true } }
    },
    orderBy: { name: 'asc' }
  })
}

// Get staff by ID
export async function getStaffById(staffId: string) {
  return prisma.staff.findUnique({
    where: { id: staffId },
    include: {
      store: true,
      user: true,
      attendances: {
        orderBy: { checkInTime: 'desc' },
        take: 30
      },
      schedules: {
        orderBy: { date: 'desc' },
        take: 4
      }
    }
  })
}

// Create staff (creates User first, then Staff linked to it)
export async function createStaff(data: {
  storeId: string
  name: string
  phone: string
  position: string
  email?: string
  address?: string
  password: string
  employmentType?: string
  hourlyRate?: number
  weeklyHours?: number
  hireDate?: Date
  emergencyContact?: string
  emergencyPhone?: string
  bankAccount?: string
  bankName?: string
}) {
  if (Buffer.byteLength(data.password, 'utf8') < 6 || Buffer.byteLength(data.password, 'utf8') > 72) {
    throw new Error('Staff password must be 6–72 bytes')
  }

  // First create the User
  const user = await prisma.user.create({
    data: {
      phone: data.phone,
      password: await bcrypt.hash(data.password, 12),
      role: 'staff',
      storeId: data.storeId
    }
  })

  // Generate employee number
  const employeeNumber = 'EMP' + Date.now().toString().slice(-6)

  // Then create the Staff linked to the User
  return prisma.staff.create({
    data: {
      userId: user.id,
      storeId: data.storeId,
      name: data.name,
      employeeNumber,
      position: data.position,
      email: data.email,
      address: data.address,
      employmentType: data.employmentType || 'full_time',
      hourlyRate: data.hourlyRate,
      weeklyHours: data.weeklyHours,
      hireDate: data.hireDate || new Date(),
      emergencyContact: data.emergencyContact,
      emergencyPhone: data.emergencyPhone,
      bankAccount: data.bankAccount,
      bankName: data.bankName,
      status: 'active'
    }
  })
}

// Update staff
export async function updateStaff(staffId: string, data: Partial<{
  name: string
  phone: string
  position: string
  email: string
  address: string
  baseSalary: number
  status: string
  employmentType: string
  hourlyRate: number
  weeklyHours: number
  hireDate: Date
  terminationDate: Date
  emergencyContact: string
  emergencyPhone: string
  bankAccount: string
  bankName: string
}>) {
  return prisma.staff.update({
    where: { id: staffId },
    data
  })
}

// Attendance operations
export async function checkIn(staffId: string, data: {
  checkInTime: Date
  location?: string
}) {
  return prisma.attendance.create({
    data: {
      staffId,
      checkInTime: data.checkInTime,
      gpsLocation: data.location,
      status: 'normal'
    }
  })
}

export async function checkOut(attendanceId: string, data: {
  checkOutTime: Date
  location?: string
}) {
  const attendance = await prisma.attendance.update({
    where: { id: attendanceId },
    data: {
      checkOutTime: data.checkOutTime,
      gpsLocation: data.location
    }
  })

  // Calculate work duration
  const duration = Math.abs(
    new Date(data.checkOutTime).getTime() - attendance.checkInTime.getTime()
  )
  const hours = Math.round(duration / (1000 * 60 * 60) * 100) / 100

  return { ...attendance, workHours: hours }
}

// Get attendance records
export async function getAttendance(filter: {
  storeId?: string
  staffId?: string
  startDate?: Date
  endDate?: Date
}) {
  const where: any = {}

  if (filter.storeId) where.storeId = filter.storeId
  if (filter.staffId) where.staffId = filter.staffId
  if (filter.startDate || filter.endDate) {
    where.checkInTime = {}
    if (filter.startDate) where.checkInTime.gte = filter.startDate
    if (filter.endDate) where.checkInTime.lte = filter.endDate
  }

  return prisma.attendance.findMany({
    where,
    include: {
      staff: { select: { id: true, name: true } }
    },
    orderBy: { checkInTime: 'desc' }
  })
}

// Schedule operations
export async function createSchedule(data: {
  staffId: string
  date: Date
  shift: 'morning' | 'afternoon' | 'evening' | 'off'
}) {
  return prisma.schedule.create({
    data: {
      staffId: data.staffId,
      date: data.date,
      shift: data.shift,
      status: 'scheduled'
    }
  })
}

// Get schedule for a staff member
export async function getSchedule(staffId: string, date: Date) {
  return prisma.schedule.findFirst({
    where: {
      staffId,
      date
    }
  })
}

// Salary operations
export async function calculateSalary(staffId: string, month: number, year: number) {
  if(!Number.isInteger(month)||month<1||month>12||!Number.isInteger(year)||year<2000||year>2100)throw new Error('INVALID_SALARY_PERIOD')
  const startDate = new Date(Date.UTC(year, month-1,1)-7*3600000)
  const endDate = new Date(Date.UTC(year,month,1)-7*3600000-1)

  const [staff, attendances, attendanceRule] = await Promise.all([
    prisma.staff.findUnique({ where: { id: staffId } }),
    prisma.attendance.findMany({
      where: {
        staffId,
        checkInTime: { gte: startDate, lte: endDate }
      }
    }),
    // Get the store's default attendance rule
    prisma.attendanceRule.findFirst({
      where: { storeId: (await prisma.staff.findUnique({ where: { id: staffId } }))?.storeId || '', isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
    }),

  ])

  if (!staff) throw new Error('Staff not found')

  // Use attendance rule or defaults
  const rule = attendanceRule
  const gracePeriod = rule?.gracePeriod ?? 15
  const overtimeRate = rule?.overtimeRate ?? 1.5
  const overtimeMinHours = rule?.overtimeMinHours ?? 1

  // Calculate work days
  const workDays = new Set(attendances.map(a => formatDate(a.checkInTime))).size

  // Calculate late days based on workStartTime + gracePeriod
  const lateDays = new Set(attendances.filter(a => {
    if (!a.checkInTime) return false
    const checkIn = new Date(a.checkInTime.getTime()+7*3600000)
    const [hour,minute]=(rule?.workStartTime || '09:00').split(':').map(Number)
    return checkIn.getUTCHours()*60+checkIn.getUTCMinutes()>hour*60+minute+gracePeriod
  }).map(a => formatDate(a.checkInTime))).size

  if(staff.baseSalary===null)throw new Error('STAFF_BASE_SALARY_REQUIRED')
  const baseSalary = staff.baseSalary
  let deductions = 0
  let bonuses = 0
  let depositDeductions: { staffDepositId: string; ruleName: string; amount: number; amountMinor: number }[] = []

  const [schedules, leaves] = await Promise.all([
    prisma.schedule.findMany({ where: { staffId, date: { gte: startDate, lte: endDate }, shift: { not: 'off' } } }),
    prisma.leave.findMany({ where: { staffId, status: 'approved', startDate: { lte: endDate }, endDate: { gte: startDate } } })
  ])
  const attendanceDays = new Map<string, { checkIn: Date; checkOut: Date | null }>()
  for (const attendance of attendances) {
    const key = formatDate(attendance.checkInTime)
    const previous = attendanceDays.get(key)
    attendanceDays.set(key, { checkIn: previous && previous.checkIn < attendance.checkInTime ? previous.checkIn : attendance.checkInTime,
      checkOut: previous?.checkOut && (!attendance.checkOutTime || previous.checkOut > attendance.checkOutTime) ? previous.checkOut : attendance.checkOutTime })
  }
  const onLeave = (key: string) => leaves.some(leave => key >= formatDate(leave.startDate) && key <= formatDate(leave.endDate))
  const dailySalary = baseSalary / 26
  const penalty = (type: string | undefined, count: number, fixed: number | null | undefined, ratio: number | null | undefined) => type === 'fixed' ? Math.round(count * (fixed || 0) / 100) : type === 'daily_rate' ? Math.round(count * dailySalary * (ratio ?? 1)) : 0
  const latePenalty = penalty(rule?.lateDeductionType, [...attendanceDays].filter(([key, day]) => !onLeave(key) && day.checkIn.getTime() > new Date(`${key}T${rule?.workStartTime || '09:00'}:00+07:00`).getTime() + gracePeriod * 60000).length, rule?.lateDeductionFixed, rule?.lateDeductionDailyRate)
  const earlyLeaveDays = [...attendanceDays].filter(([key, day]) => {
    if (!day.checkOut || onLeave(key)) return false
    let end = new Date(`${key}T${rule?.workEndTime || '18:00'}:00+07:00`)
    const start = new Date(`${key}T${rule?.workStartTime || '09:00'}:00+07:00`)
    if (end <= start) end = new Date(end.getTime() + 86400000)
    return day.checkOut < end
  }).length
  const absentDays = [...new Set(schedules.map(schedule => formatDate(schedule.date)))].filter(key => {
    const scheduledEnd = new Date(`${key}T${rule?.workEndTime || '18:00'}:00+07:00`)
    return key >= formatDate(staff.hireDate) && scheduledEnd < new Date() && !attendanceDays.has(key) && !onLeave(key)
  }).length
  let sickDays = 0
  let unpaidDays = 0
  for (const leave of leaves) {
    const begin = Math.max(startOfDay(leave.startDate).getTime(), startDate.getTime())
    const end = Math.min(startOfDay(leave.endDate).getTime(), startOfDay(endDate).getTime())
    const days = Math.max(0, (end - begin) / 86400000 + 1) * (leave.halfDay ? 0.5 : 1)
    if (leave.leaveType === 'sick') sickDays += days
    else {
      const type = await prisma.leaveType.findUnique({ where: { storeId_code: { storeId: staff.storeId, code: leave.leaveType } } })
      if (leave.leaveType === 'unpaid' || type?.paidLeave === false) unpaidDays += days
    }
  }
  deductions += latePenalty + penalty(rule?.earlyLeaveDeductionType, earlyLeaveDays, rule?.earlyLeaveDeductionFixed, rule?.earlyLeaveDeductionDailyRate)
    + penalty(rule?.absenceDeductionType, absentDays, rule?.absenceDeductionFixed, rule?.absenceDeductionDailyRate)
    + penalty(rule?.sickLeaveDeductionType, sickDays, rule?.sickLeaveDeductionFixed, rule?.sickLeaveDeductionDailyRate) + Math.round(unpaidDays * dailySalary)

  depositDeductions = await salaryDepositPlan(staffId, `${year}-${String(month).padStart(2, '0')}`)
  deductions += depositDeductions.reduce((sum, item) => sum + item.amount, 0)

  const featureConfig = await getStaffConfig(staff.storeId)
  if (featureConfig.attendanceBonus && lateDays === 0 && workDays >= 24) bonuses = 200000

  const compensation = await adjustmentPlan(staff.storeId!,staffId,`${year}-${String(month).padStart(2,'0')}`)
  bonuses += compensation.rewards
  deductions += compensation.penalties

  const approvedOvertime = await prisma.overtimeRequest.findMany({ where: { staffId, status: 'approved', date: { gte: startDate, lte: endDate } } })
  const overtimeHours = approvedOvertime.reduce((sum, request) => sum + request.hours, 0)
  const hourlyRate = baseSalary / 176
  const overtimePay = overtimeHours >= overtimeMinHours
    ? Math.floor(overtimeHours * hourlyRate * overtimeRate)
    : 0

  return {
    staffId,
    staffName: staff.name,
    month,
    year,
    baseSalary,
    workDays,
    lateDays,
    overtimeHours,
    overtimePay,
    deductions,
    depositDeductions,
    compensation,
    compensationAdjustmentIds:compensation.items.map(item=>item.id),
    latePenalty, earlyLeaveDays, absentDays, sickDays, unpaidDays,
    calculationBasis: { workDaysPerMonth: 26, hoursPerMonth: 176 },
    bonuses,
    totalSalary: baseSalary + overtimePay + bonuses - deductions
  }
}
