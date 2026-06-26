import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import prisma from '../config/database'

const router = Router()

// GET /api/salaries
router.get('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { month, staffId, status } = req.query

    const where: any = {}
    if (month) where.month = month as string
    if (status) where.status = status as string
    if (staffId) where.staffId = staffId as string

    // Get staff for this store first
    const staffList = await prisma.staff.findMany({
      where: { storeId },
      select: { id: true }
    })
    where.staffId = { in: staffList.map(s => s.id) }

    const salaries = await prisma.salary.findMany({
      where,
      include: { staff: { include: { user: true } } },
      orderBy: { month: 'desc' }
    })

    res.json({ code: 200, data: { list: salaries } })
  } catch (error: any) {
    console.error('Get salaries error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get salaries' })
  }
})

// POST /api/salaries
router.post('/', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { staffId, month, baseSalary, overtime, commission, bonus, deduction, status } = req.body

    const finalAmount = baseSalary + (overtime || 0) + (commission || 0) + (bonus || 0) - (deduction || 0)

    const salary = await prisma.salary.create({
      data: {
        staffId,
        month,
        baseSalary,
        overtime: overtime || 0,
        commission: commission || 0,
        bonus: bonus || 0,
        deduction: deduction || 0,
        finalAmount,
        status: status || 'pending'
      }
    })

    res.status(201).json({ code: 201, data: salary })
  } catch (error: any) {
    console.error('Create salary error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to create salary' })
  }
})

// PUT /api/salaries/:id
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { baseSalary, overtime, commission, bonus, deduction, status } = req.body

    const finalAmount = baseSalary + (overtime || 0) + (commission || 0) + (bonus || 0) - (deduction || 0)

    const salary = await prisma.salary.update({
      where: { id: req.params.id },
      data: {
        baseSalary,
        overtime: overtime || 0,
        commission: commission || 0,
        bonus: bonus || 0,
        deduction: deduction || 0,
        finalAmount,
        status: status || 'pending'
      }
    })
    res.json({ code: 200, data: salary })
  } catch (error: any) {
    console.error('Update salary error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to update salary' })
  }
})

// PUT /api/salaries/:id/mark-paid
router.put('/:id/mark-paid', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const salary = await prisma.salary.update({
      where: { id: req.params.id },
      data: { status: 'paid' }
    })
    res.json({ code: 200, data: salary })
  } catch (error: any) {
    console.error('Mark paid error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to update salary' })
  }
})

// DELETE /api/salaries/:id
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    await prisma.salary.delete({ where: { id: req.params.id } })
    res.json({ code: 200, message: 'Salary deleted' })
  } catch (error: any) {
    console.error('Delete salary error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to delete salary' })
  }
})

// GET /api/salaries/calculate/:staffId
router.get('/calculate/:staffId', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { staffId } = req.params
    const { month } = req.query // format: YYYY-MM

    if (!month || !staffId) {
      res.status(400).json({ code: 400, message: 'staffId and month are required' })
      return
    }

    // Get staff info
    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { name: true }
    })

    if (!staff) {
      res.status(404).json({ code: 404, message: 'Staff not found' })
      return
    }

    // Get attendance for the month
    const startDate = new Date(`${month}-01`)
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59)

    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        staffId,
        checkInTime: {
          gte: startDate,
          lte: endDate
        }
      }
    })

    // Calculate work days
    const totalDays = endDate.getDate()
    const workDays = attendanceRecords.filter(a => a.status === 'present' || a.status === 'late').length
    const lateDays = attendanceRecords.filter(a => a.status === 'late').length
    const absentDays = attendanceRecords.filter(a => a.status === 'absent').length

    // Get approved overtime hours
    const overtimeRequests = await prisma.overtimeRequest.findMany({
      where: {
        staffId,
        status: 'approved',
        date: {
          gte: startDate,
          lte: endDate
        }
      }
    })
    const totalOvertimeHours = overtimeRequests.reduce((sum, req) => sum + (req.hours || 0), 0)

    // Get approved leave (paid leave) - leaveType 'annual' is paid
    const leaveRecords = await prisma.leave.findMany({
      where: {
        staffId,
        status: 'approved',
        startDate: {
          gte: startDate,
          lte: endDate
        }
      }
    })
    const paidLeaveDays = leaveRecords.filter(l => l.leaveType === 'annual').reduce((sum, l) => {
      const start = new Date(l.startDate)
      const end = new Date(l.endDate)
      return sum + Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    }, 0)

    // Calculate salary - using default 0 for baseSalary as it's not in schema
    const baseSalary = 0
    const dailyRate = baseSalary / totalDays
    const attendanceDeduction = absentDays * dailyRate
    const lateDeduction = lateDays * dailyRate * 0.1 // 10% fine for late
    const overtimePay = totalOvertimeHours * (dailyRate / 8) * 1.5 // 1.5x overtime rate

    const deduction = attendanceDeduction + lateDeduction
    const finalAmount = baseSalary + overtimePay - deduction

    res.json({
      code: 200,
      data: {
        staffName: staff.name,
        month,
        baseSalary,
        workDays,
        paidLeaveDays,
        lateDays,
        absentDays,
        totalOvertimeHours,
        overtimePay,
        deduction: Math.round(deduction),
        finalAmount: Math.round(finalAmount)
      }
    })
  } catch (error: any) {
    console.error('Calculate salary error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to calculate salary' })
  }
})

export { router as salaryRouter }