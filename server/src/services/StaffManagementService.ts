import prisma from '../config/database'
import { subDays, startOfMonth, endOfMonth } from '../utils/dateUtils'

// ==================== STAFF PERFORMANCE ====================

export async function getStaffPerformance(storeId: string, startDate: Date, endDate: Date) {
  const orders = await prisma.order.findMany({
    where: {
      storeId,
      createdAt: { gte: startDate, lte: endDate },
      status: { not: 'refunded' }
    }
  })

  const staffStats: Record<string, { name: string; orders: number; revenue: number }> = {}

  for (const order of orders) {
    if (!staffStats[order.staffId]) {
      const staff = await prisma.staff.findUnique({ where: { id: order.staffId } })
      staffStats[order.staffId] = {
        name: staff?.name || 'Unknown',
        orders: 0,
        revenue: 0
      }
    }
    staffStats[order.staffId].orders++
    staffStats[order.staffId].revenue += order.finalAmount
  }

  return Object.entries(staffStats)
    .map(([staffId, data]) => ({
      staffId,
      ...data
    }))
    .sort((a, b) => b.revenue - a.revenue)
}

// ==================== ATTENDANCE ANALYTICS ====================

export async function getAttendanceAnalytics(storeId: string, month: number, year: number) {
  const startDate = startOfMonth(new Date(year, month - 1))
  const endDate = endOfMonth(new Date(year, month - 1))

  // 获取当前门店的员工 ID列表
  const staffList = await prisma.staff.findMany({
    where: { storeId }
  })
  const staffIds = staffList.map(s => s.id)

  const attendances = await prisma.attendance.findMany({
    where: {
      staffId: { in: staffIds },
      checkInTime: { gte: startDate, lte: endDate }
    },
    include: { staff: true }
  })

  // Calculate per staff
  const staffStats = staffList.map(staff => {
    const staffAttendances = attendances.filter(a => a.staffId === staff.id)
    const workDays = staffAttendances.filter(a => a.checkInTime).length
    const lateDays = staffAttendances.filter(a => {
      if (!a.checkInTime) return false
      const hour = new Date(a.checkInTime).getHours()
      return hour >= 9
    }).length

    // Calculate work hours
    let totalWorkHours = 0
    for (const att of staffAttendances) {
      if (att.checkInTime && att.checkOutTime) {
        const hours = (new Date(att.checkOutTime).getTime() - new Date(att.checkInTime).getTime()) / (1000 * 60 * 60)
        totalWorkHours += hours
      }
    }

    return {
      staffId: staff.id,
      name: staff.name,
      position: staff.position,
      workDays,
      lateDays,
      onTimeRate: workDays > 0 ? Math.round((workDays - lateDays) / workDays * 100) : 0,
      totalWorkHours: Math.round(totalWorkHours * 10) / 10,
      avgHoursPerDay: workDays > 0 ? Math.round(totalWorkHours / workDays * 10) / 10 : 0
    }
  })

  return staffStats.sort((a, b) => b.workDays - a.workDays)
}

// ==================== SCHEDULE MANAGEMENT ====================

export async function getScheduleCoverage(storeId: string, weekStart: Date) {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)

  // 获取当前门店的员工 ID列表
  const staffList = await prisma.staff.findMany({
    where: { storeId, status: 'active' }
  })
  const staffIds = staffList.map(s => s.id)

  const schedules = await prisma.schedule.findMany({
    where: {
      staffId: { in: staffIds },
      date: { gte: weekStart, lte: weekEnd }
    },
    include: { staff: true }
  })

  // Check coverage
  const coverage = staffList.map(staff => {
    const schedule = schedules.find(s => s.staffId === staff.id)
    return {
      staffId: staff.id,
      name: staff.name,
      position: staff.position,
      hasSchedule: !!schedule,
      schedule: schedule || null
    }
  })

  const coveredCount = coverage.filter(c => c.hasSchedule).length
  const totalCount = coverage.length

  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    coverage: {
      covered: coveredCount,
      total: totalCount,
      rate: totalCount > 0 ? Math.round(coveredCount / totalCount * 100) : 0
    },
    staff: coverage
  }
}

// ==================== PAYROLL ====================

export async function generatePayroll(storeId: string, month: number, year: number) {
  const startDate = startOfMonth(new Date(year, month - 1))
  const endDate = endOfMonth(new Date(year, month - 1))

  const staffList = await prisma.staff.findMany({
    where: { storeId, status: 'active' }
  })

  const salaries: any[] = []

  for (const staff of staffList) {
    // Get attendance
    const attendances = await prisma.attendance.findMany({
      where: {
        staffId: staff.id,
        checkInTime: { gte: startDate, lte: endDate }
      }
    })

    const workDays = attendances.filter(a => a.checkInTime).length
    const lateDays = attendances.filter(a => {
      if (!a.checkInTime) return false
      return new Date(a.checkInTime).getHours() >= 9
    }).length

    // Calculate work hours
    let totalHours = 0
    for (const att of attendances) {
      if (att.checkInTime && att.checkOutTime) {
        totalHours += (new Date(att.checkOutTime).getTime() - new Date(att.checkInTime).getTime()) / (1000 * 60 * 60)
      }
    }

    const regularHours = workDays * 8
    const overtimeHours = Math.max(0, totalHours - regularHours)

    // Position-based salary
    const positionSalaries: Record<string, number> = {
      '店长': 5000000,
      '副店长': 4000000,
      '店员': 3500000
    }
    const baseSalary = positionSalaries[staff.position] || 3500000
    const overtimePay = Math.round(overtimeHours * (baseSalary / 176) * 1.5)

    // Deductions
    const lateDeduction = lateDays * 50000 // Rp 50,000 per late
    const finalSalary = baseSalary + overtimePay - lateDeduction

    salaries.push({
      staffId: staff.id,
      name: staff.name,
      position: staff.position,
      period: `${year}-${month.toString().padStart(2, '0')}`,
      baseSalary,
      workDays,
      lateDays,
      lateDeduction,
      overtimeHours: Math.round(overtimeHours * 10) / 10,
      overtimePay,
      finalSalary
    })
  }

  return salaries
}

// ==================== TRAINING MANAGEMENT ====================

// Training record - using Prisma Training model with attachments support
export async function addTrainingRecord(data: {
  staffId: string
  storeId: string
  trainingType: string
  title: string
  date: Date
  duration: number // hours
  provider: string
  certificate?: string
  notes?: string
  attachments?: string // JSON array: [{url, name, type, size}]
  status?: string
}) {
  return prisma.training.create({
    data: {
      staffId: data.staffId,
      storeId: data.storeId,
      trainingType: data.trainingType,
      title: data.title,
      provider: data.provider,
      startDate: data.date,
      duration: data.duration,
      certificate: data.certificate || null,
      notes: data.notes || null,
      attachments: data.attachments || null,
      status: data.status || 'scheduled'
    }
  })
}

export async function getTrainingRecords(staffId: string) {
  const records = await prisma.training.findMany({
    where: { staffId },
    orderBy: { startDate: 'desc' }
  })
  return records
}

export async function updateTrainingRecord(id: string, data: {
  staffId?: string
  trainingType?: string
  title?: string
  date?: Date
  duration?: number
  provider?: string
  certificate?: string
  notes?: string
  attachments?: string
  status?: string
}) {
  return prisma.training.update({
    where: { id },
    data: {
      ...(data.staffId && { staffId: data.staffId }),
      ...(data.trainingType && { trainingType: data.trainingType }),
      ...(data.title && { title: data.title }),
      ...(data.date && { startDate: data.date }),
      ...(data.duration !== undefined && { duration: data.duration }),
      ...(data.provider && { provider: data.provider }),
      ...(data.certificate !== undefined && { certificate: data.certificate || null }),
      ...(data.notes !== undefined && { notes: data.notes || null }),
      ...(data.attachments !== undefined && { attachments: data.attachments }),
      ...(data.status && { status: data.status })
    }
  })
}

// ==================== KPI TRACKING ====================

export async function getStaffKPIs(storeId: string, month: number, year: number) {
  const startDate = startOfMonth(new Date(year, month - 1))
  const endDate = endOfMonth(new Date(year, month - 1))

  // 获取当前门店的员工 ID列表
  const staffList = await prisma.staff.findMany({
    where: { storeId, status: 'active' }
  })
  const staffIds = staffList.map(s => s.id)

  const [orders, attendances] = await Promise.all([
    prisma.order.findMany({
      where: {
        storeId,
        createdAt: { gte: startDate, lte: endDate },
        status: { not: 'refunded' }
      }
    }),
    prisma.attendance.findMany({
      where: {
        staffId: { in: staffIds },
        checkInTime: { gte: startDate, lte: endDate }
      }
    })
  ])

  return staffList.map(staff => {
    const staffOrders = orders.filter(o => o.staffId === staff.id)
    const staffAttendance = attendances.filter(a => a.staffId === staff.id)

    const workDays = staffAttendance.filter(a => a.checkInTime).length
    const lateDays = staffAttendance.filter(a => {
      if (!a.checkInTime) return false
      return new Date(a.checkInTime).getHours() >= 9
    }).length

    const totalRevenue = staffOrders.reduce((sum, o) => sum + o.finalAmount, 0)
    const avgOrderValue = staffOrders.length > 0
      ? Math.round(totalRevenue / staffOrders.length)
      : 0

    return {
      staffId: staff.id,
      name: staff.name,
      position: staff.position,
      sales: {
        orderCount: staffOrders.length,
        revenue: totalRevenue,
        avgOrderValue
      },
      attendance: {
        workDays,
        lateDays,
        punctuality: workDays > 0 ? Math.round((workDays - lateDays) / workDays * 100) : 0
      }
    }
  })
}

// ==================== TURNOVER ANALYSIS ====================

export async function getTurnoverRate(storeId: string, months: number = 12) {
  const startDate = subDays(new Date(), 30 * months)

  const [allStaff, leftStaff] = await Promise.all([
    prisma.staff.count({
      where: { storeId }
    }),
    prisma.staff.count({
      where: {
        storeId,
        status: 'resigned',
        updatedAt: { gte: startDate }
      }
    })
  ])

  // Monthly average
  const avgStaff = allStaff
  const monthlyTurnover = allStaff > 0 ? (leftStaff / months) : 0
  const turnoverRate = avgStaff > 0 ? Math.round(monthlyTurnover / avgStaff * 100) : 0

  return {
    period: `${months} months`,
    totalStaff: allStaff,
    leftStaff,
    monthlyAverage: Math.round(monthlyTurnover * 10) / 10,
    turnoverRate
  }
}