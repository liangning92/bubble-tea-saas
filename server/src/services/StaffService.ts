import { correctionPreview, PayrollCorrection } from './PayrollCorrectionService'
import { businessDate, WorkingDays, calculatePayrollBasis, getEnrollment, monthlyRateCents, getProbationRule, saveEnrollment } from './ProbationService'
import { allocateEmployeeNumber } from './EmployeeNumberService'
import { readWork, listWork } from './EmployeeWorkspaceStore'
import { adjustmentPlan } from './SalaryAdjustmentService'
import { unpaidLeavePlan } from './SalaryLeavePlan'
import { salaryDepositPlan, salaryRefundPlan, ensureOnboardingDeposit } from './SalaryDepositPlan'
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
  probationEnabled?: boolean
  confirmationDate?: string | null
  emergencyContact?: string
  emergencyPhone?: string
  bankAccount?: string
  bankName?: string
}) {
  if (Buffer.byteLength(data.password, 'utf8') < 6 || Buffer.byteLength(data.password, 'utf8') > 72) {
    throw new Error('Staff password must be 6–72 bytes')
  }

  const hashed = await bcrypt.hash(data.password, 12)
  return prisma.$transaction(async tx => {
  // First create the User
  const user = await tx.user.create({
    data: {
      phone: data.phone,
      password: hashed,
      role: 'staff',
      storeId: data.storeId
    }
  })

  // Generate employee number
  const employeeNumber = await allocateEmployeeNumber(tx)

  // Then create the Staff linked to the User
  const created = await tx.staff.create({
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
  const policy = await getProbationRule(tx,data.storeId)
  await saveEnrollment(tx,created,data.probationEnabled ?? policy.enabled,data.confirmationDate)
  await ensureOnboardingDeposit(tx,created)
  return created
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
export async function calculateSalary(staffId: string, month: number, year: number, manualDays?: WorkingDays, correction?: PayrollCorrection, daysSource: 'estimate'|'manual'|'attendance'=manualDays?'manual':'estimate') {
  if(!Number.isInteger(month)||month<1||month>12||!Number.isInteger(year)||year<2000||year>2100)throw new Error('INVALID_SALARY_PERIOD')
  let startDate = new Date(Date.UTC(year, month-1,1)-7*3600000)
  let endDate = new Date(Date.UTC(year,month,1)-7*3600000-1)

  const [staff, monthlyAttendances, attendanceRule] = await Promise.all([
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
  if(staff.hireDate)startDate=new Date(Math.max(startDate.getTime(),new Date(businessDate(staff.hireDate)+'T00:00:00+07:00').getTime()))
  if(staff.terminationDate)endDate=new Date(Math.min(endDate.getTime(),new Date(businessDate(staff.terminationDate)+'T23:59:59.999+07:00').getTime()))
  const attendances=monthlyAttendances.filter(a=>a.checkInTime>=startDate&&a.checkInTime<=endDate)

  // Use attendance rule or defaults
  const rule = attendanceRule
  const gracePeriod = rule?.gracePeriod ?? 15
  const overtimeRate = rule?.overtimeRate ?? 1.5
  const overtimeMinHours = rule?.overtimeMinHours ?? 1

  // Calculate work days
  const workDays = new Set(attendances.map(a => formatDate(a.checkInTime))).size


  if(staff.baseSalary===null)throw new Error('STAFF_BASE_SALARY_REQUIRED')
  const payrollBasis = await calculatePayrollBasis(prisma, staff, `${year}-${String(month).padStart(2,'0')}`, manualDays, daysSource)
  const enrollment = await getEnrollment(prisma,staff)
  const baseSalary = payrollBasis.amount
  // Attendance proration changes payable days, not the contractual daily penalty rate.
  const standardMonthlySalary = payrollBasis.eligibleDays ? payrollBasis.segments.reduce((sum,s)=>sum+s.monthlyRate*((s as {eligibleDays?:number}).eligibleDays??s.days),0)/payrollBasis.eligibleDays : staff.baseSalary
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
  const employeeRules = payrollBasis.payrollRules
  const dailySalary = standardMonthlySalary / employeeRules.dailyRateDivisor
  const penalty = (type: string | undefined, count: number, fixed: number | null | undefined, ratio: number | null | undefined) => type === 'fixed' ? Math.round(count * (fixed || 0) / 100) : type === 'daily_rate' ? Math.round(count * dailySalary * (ratio ?? 1)) : 0
  const monthlyLateRule = await readWork(staff.storeId, `rule.${String(year)}-${String(month).padStart(2, '0')}`)
  const snapshots = await listWork(staff.storeId!, `attendance.${staffId}.`)
  const lateDates = new Set(attendances.filter(a => {
    const snapshot = snapshots.find(s => s.attendanceId === a.id)
    return snapshot ? snapshot.minutes > 0 && !snapshot.exempt && !snapshot.needsReview : a.status === 'late' && schedules.some(s => formatDate(s.date) === formatDate(a.checkInTime))
  }).map(a => snapshots.find(s => s.attendanceId === a.id)?.businessDate || formatDate(a.checkInTime)).filter(key => !onLeave(key)))
  const lateDays = lateDates.size
  let latePenalty = daysSource==='estimate' || monthlyLateRule ? 0 : penalty(rule?.lateDeductionType, lateDays, rule?.lateDeductionFixed, rule?.lateDeductionDailyRate)
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
    // Non-worked days are already excluded from base pay; do not deduct them twice.

  // A manually verified day count replaces incomplete attendance penalties.
  let correctionBasis = correction ? await correctionPreview(prisma,staff.storeId,`${year}-${String(month).padStart(2,'0')}`,correction) : null
  if(correctionBasis){latePenalty=correctionBasis.lateDeduction;deductions=latePenalty+correctionBasis.otherAttendanceDeduction}
  else if(daysSource==='estimate') deductions=0


  const featureConfig = await getStaffConfig(staff.storeId)
  if (daysSource==='attendance' && featureConfig.attendanceBonus && lateDays === 0 && workDays >= employeeRules.attendanceBonusDays) bonuses = employeeRules.attendanceBonusAmount

  const compensation = await adjustmentPlan(staff.storeId!,staffId,`${year}-${String(month).padStart(2,'0')}`,prisma,true)
  if(!correction && daysSource!=='estimate' && monthlyLateRule){
    const minutes=snapshots.filter(s=>s.businessDate?.slice(0,7)===`${year}-${String(month).padStart(2,'0')}`&&!s.exempt&&!s.needsReview&&s.recordedAt>=monthlyLateRule.effectiveAt).reduce((sum,s)=>sum+s.minutes,0)
    correctionBasis=await correctionPreview(prisma,staff.storeId,`${year}-${String(month).padStart(2,'0')}`,{lateMinutes:minutes,lateMode:'rule',manualLateDeduction:0,otherAttendanceDeduction:deductions})
    latePenalty=correctionBasis.lateDeduction;deductions+=latePenalty
  }
  bonuses += compensation.rewards
  deductions += compensation.penalties

  const leaveTypes = leaves.length ? await prisma.leaveType.findMany({where:{storeId:staff.storeId,paidLeave:false},select:{code:true}}) : []
  const unpaidOverride = correction?.unpaidProbationDays !== undefined || correction?.unpaidRegularDays !== undefined
    ? {probation:correction?.unpaidProbationDays || 0,regular:correction?.unpaidRegularDays || 0} : undefined
  const unpaidLeave = daysSource==='estimate' ? unpaidLeavePlan(staff,enrollment,payrollBasis,leaves,new Set(['unpaid',...leaveTypes.map(t=>t.code)]),unpaidOverride) : {days:{probation:0,regular:0},deduction:0,source:'included_in_days'}
  deductions += unpaidLeave.deduction

  const approvedOvertime = await prisma.overtimeRequest.findMany({ where: { staffId, status: 'approved', date: { gte: startDate, lte: endDate } } })
  const overtimeHours = approvedOvertime.reduce((sum, request) => sum + request.hours, 0)
  const overtimePay = overtimeHours >= overtimeMinHours
    ? Math.floor(approvedOvertime.reduce((sum, request)=>sum+request.hours*(monthlyRateCents(staff,enrollment,formatDate(request.date))/100/employeeRules.overtimeMonthlyHours)*overtimeRate,0))
    : 0

  depositDeductions = await salaryDepositPlan(staffId, `${year}-${String(month).padStart(2,'0')}`, prisma, baseSalary+overtimePay+bonuses-deductions)
  deductions += depositDeductions.reduce((sum,item)=>sum+item.amount,0)
  const refund = await salaryRefundPlan(staffId, `${year}-${String(month).padStart(2,'0')}`)

  return {
    staffId,
    staffName: staff.name,
    month,
    year,
    baseSalary,
    payrollBasis: {...payrollBasis,correction:correctionBasis,unpaidLeave,terminationDate:staff.terminationDate?businessDate(staff.terminationDate):null,settlementVersion:1},
    unpaidLeaveDeduction:unpaidLeave.deduction,depositRefundAmount:refund.amount,depositRefunds:refund.items,settlementAmount:baseSalary+overtimePay+bonuses-deductions+refund.amount,
    workDays,
    lateDays,
    overtimeHours,
    overtimePay,
    deductions,
    depositDeductions,
    compensation,
    compensationAdjustmentIds:compensation.items.map(item=>item.id),
    latePenalty, earlyLeaveDays, absentDays:daysSource!=='attendance'?0:absentDays, sickDays, unpaidDays,
    calculationBasis: { workDaysPerMonth: employeeRules.dailyRateDivisor, hoursPerMonth: employeeRules.overtimeMonthlyHours },
    bonuses,
    totalSalary: baseSalary + overtimePay + bonuses - deductions
  }
}
