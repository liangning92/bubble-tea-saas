import { formatDate } from '../utils/dateUtils'
import { parseDateBoundary } from '../utils/businessDate'
import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import prisma from '../config/database'
import { authenticate, authorize, AuthRequest, canAccessStore } from '../middlewares/auth'
import { isFeatureEnabled, getStaffConfig } from '../services/StaffConfigService'
import { getApprovedLeavesInRange, hasApprovedLeaveOnDate } from '../services/LeaveService'
import { validateBody } from '../utils/validation'

const router = Router()

// Helper: Get attendance rule for store (with defaults)
async function getAttendanceRuleWithDefaults(storeId: string) {
  const rules = await prisma.attendanceRule.findMany({
    where: { storeId, isActive: true }
  })
  const defaultRule = rules.find(r => r.isDefault) || rules[0]

  return defaultRule || {
    workStartTime: '09:00',
    gracePeriod: 15,
    lateDeductionType: 'none',
    lateDeductionFixed: 50000
  }
}

// Validation schemas
const createStaffSchema = z.object({
  storeId: z.string(),
  name: z.string().min(1).max(50),
  phone: z.string().min(10).max(15),
  password: z.string().min(6).refine(value => Buffer.byteLength(value, 'utf8') <= 72),
  position: z.string().optional().default('店员'),
  role: z.enum(['manager', 'staff', 'cashier']).default('staff'),
  status: z.enum(['active', 'inactive', 'resigned', 'suspended']).optional(),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern']).optional(),
  baseSalary: z.number().int().min(0).optional(),
  hourlyRate: z.number().int().min(0).optional(),
  weeklyHours: z.number().optional(),
  hireDate: z.string().optional(),
  emergencyContact: z.string().optional(),
  emergencyPhone: z.string().optional(),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional()
})

const updateStaffSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  position: z.string().optional(),
  status: z.enum(['active', 'inactive', 'resigned', 'suspended']).optional(),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern']).optional(),
  baseSalary: z.number().int().min(0).optional(),
  hourlyRate: z.number().int().min(0).optional(),
  weeklyHours: z.number().optional(),
  hireDate: z.string().optional(),
  terminationDate: z.string().optional(),
  emergencyContact: z.string().optional(),
  emergencyPhone: z.string().optional(),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional()
})

const attendanceSchema = z.object({
  type: z.enum(['check_in', 'check_out']),
  gpsLocation: z.string().optional(),
  note: z.string().optional()
})

const scheduleSchema = z.object({
  staffId: z.string(),
  date: z.string(),
  shift: z.string()
})

// GET /api/staff
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId, status, position, search } = req.query
    const page = parseInt(req.query.page as string) || 1
    const pageSize = parseInt(req.query.pageSize as string) || 20

    const where: any = {}
    if (storeId && !canAccessStore(req.user!, storeId as string)) {
      return res.status(403).json({ code: 403, message: 'Access denied: Store mismatch' })
    }
    if (req.user!.role !== 'admin') where.storeId = req.user!.storeId
    else if (storeId) where.storeId = storeId as string
    if (status) where.status = status as string
    if (position) where.position = position as string
    if (typeof search === 'string' && search.trim()) {
      where.OR = [
        ...['name', 'employeeNumber'].map(field => ({ [field]: { contains: search.trim() } })),
        { user: { phone: { contains: search.trim() } } }
      ]
    }

    const [staff, total] = await Promise.all([
      prisma.staff.findMany({
        where,
        include: {
          user: { select: { id: true, phone: true, role: true } },
          _count: { select: { attendances: true, schedules: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.staff.count({ where })
    ])

    res.json({
      code: 200,
      data: {
        list: staff.map(s => ['admin', 'manager'].includes(req.user!.role) ? ({
          ...s,
          phone: s.user.phone,
          role: s.user.role,
          _count: undefined
        }) : ({ id: s.id, name: s.name, employeeNumber: s.employeeNumber, position: s.position, status: s.status })),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get staff error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get staff' })
  }
})

// GET /api/staff/:id
router.get('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const staff = await prisma.staff.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, phone: true, role: true } },
        attendances: { orderBy: { checkInTime: 'desc' }, take: 30 },
        schedules: { orderBy: { date: 'desc' }, take: 30 },
        salaries: { orderBy: { month: 'desc' }, take: 12 }
      }
    })

    if (!staff) {
      return res.status(404).json({ code: 404, message: 'Staff not found' })
    }
    if (!canAccessStore(req.user!, staff.storeId)) {
      return res.status(403).json({ code: 403, message: 'Access denied: Store mismatch' })
    }

    res.json({
      code: 200,
      data: {
        ...staff,
        phone: staff.user.phone,
        role: staff.user.role
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get staff error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get staff' })
  }
})

// POST /api/staff
router.post('/', authenticate, authorize('admin', 'manager'), validateBody(createStaffSchema), async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== 'admin' && req.body.storeId !== req.user!.storeId) {
      return res.status(403).json({ code: 403, message: 'Access denied: Store mismatch' })
    }
    const {
      storeId, name, phone, password, position, role,
      employmentType, hourlyRate, weeklyHours, hireDate,
      emergencyContact, emergencyPhone, bankAccount, bankName,
      email, address
    } = req.body

    // Check if phone exists
    const existing = await prisma.user.findUnique({ where: { phone } })
    if (existing) {
      return res.status(400).json({ code: 400, message: 'Phone number already registered' })
    }

    const staff = await prisma.$transaction(async (tx) => {
      const hashed = await bcrypt.hash(password, 12)

      const user = await tx.user.create({
        data: {
          phone,
          password: hashed,
          role,
          storeId
        }
      })

      const newStaff = await tx.staff.create({
        data: {
          userId: user.id,
          storeId,
          name,
          employeeNumber: `EMP${Date.now()}${crypto.randomUUID().slice(0, 8)}`,
          position: position || '店员',
          employmentType: employmentType || 'full_time',
          baseSalary: req.body.baseSalary ?? null,
          hourlyRate: hourlyRate ?? null,
          weeklyHours: weeklyHours || null,
          hireDate: hireDate ? new Date(hireDate) : new Date(),
          emergencyContact: emergencyContact || null,
          emergencyPhone: emergencyPhone || null,
          bankAccount: bankAccount || null,
          bankName: bankName || null,
          email: email || null,
          address: address || null,
          status: req.body.status || 'active'
        },
        include: {
          user: { select: { id: true, phone: true, role: true } }
        }
      })

      return newStaff
    })

    res.status(201).json({
      code: 201,
      message: 'Staff created',
      data: {
        id: staff.id,
        name: staff.name,
        employeeNumber: staff.employeeNumber,
        position: staff.position,
        status: staff.status,
        employmentType: staff.employmentType,
        phone: staff.user.phone,
        role: staff.user.role
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Create staff error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create staff' })
  }
})

// PUT /api/staff/:id
router.put('/:id', authenticate, authorize('admin', 'manager'), validateBody(updateStaffSchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const existing = await prisma.staff.findUnique({ where: { id }, select: { storeId: true, userId: true } })
    if (!existing) return res.status(404).json({ code: 404, message: 'Staff not found' })
    if (!canAccessStore(req.user!, existing.storeId)) {
      return res.status(403).json({ code: 403, message: 'Access denied: Store mismatch' })
    }
    const {
      name, position, status, employmentType, baseSalary, hourlyRate, weeklyHours,
      hireDate, terminationDate, emergencyContact, emergencyPhone,
      bankAccount, bankName, email, address
    } = req.body

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (position !== undefined) updateData.position = position
    if (status !== undefined) updateData.status = status
    if (employmentType !== undefined) updateData.employmentType = employmentType
    if (baseSalary !== undefined) updateData.baseSalary = baseSalary
    if (hourlyRate !== undefined) updateData.hourlyRate = hourlyRate
    if (weeklyHours !== undefined) updateData.weeklyHours = weeklyHours
    if (hireDate !== undefined) updateData.hireDate = new Date(hireDate)
    if (terminationDate !== undefined) updateData.terminationDate = new Date(terminationDate)
    if (emergencyContact !== undefined) updateData.emergencyContact = emergencyContact
    if (emergencyPhone !== undefined) updateData.emergencyPhone = emergencyPhone
    if (bankAccount !== undefined) updateData.bankAccount = bankAccount
    if (bankName !== undefined) updateData.bankName = bankName
    if (email !== undefined) updateData.email = email
    if (address !== undefined) updateData.address = address

    const staff = await prisma.$transaction(async tx => {
      const staff = await tx.staff.update({ where: { id }, data: updateData })
      if (status !== undefined) {
        await tx.user.update({ where: { id: existing.userId }, data: { updatedAt: new Date() } })
      }
      return staff
    })

    res.json({
      code: 200,
      message: 'Staff updated',
      data: staff,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Update staff error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update staff' })
  }
})

// PUT /api/staff/:id/role - 更新员工系统角色
router.put('/:id/role', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const role = z.enum(['admin', 'manager', 'cashier', 'staff']).safeParse(req.body?.role)

    if (!role.success) {
      return res.status(400).json({ code: 400, message: 'Invalid role' })
    }

    // 先获取 staff 信息
    const staff = await prisma.staff.findUnique({
      where: { id },
      include: { user: true }
    })

    if (!staff) {
      return res.status(404).json({ code: 404, message: 'Staff not found' })
    }

    // 更新 user 的 role
    await prisma.user.update({
      where: { id: staff.userId },
      data: { role: role.data }
    })

    res.json({
      code: 200,
      message: 'Role updated',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Update role error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update role' })
  }
})

// DELETE /api/staff/:id
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const staff = await prisma.staff.update({
      where: { id },
      data: { status: 'resigned' }
    })
    await prisma.user.update({ where: { id: staff.userId }, data: { updatedAt: new Date() } })

    res.json({
      code: 200,
      message: 'Staff marked as resigned',
      data: staff,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Delete staff error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete staff' })
  }
})

// POST /api/staff/attendance
router.post('/attendance', authenticate, async (req: AuthRequest, res) => {
  try {
    const { type, gpsLocation, note } = req.body

    // Find staff by user id
    const staff = await prisma.staff.findFirst({
      where: { userId: req.user!.id }
    })

    if (!staff) {
      return res.status(404).json({ code: 404, message: 'Staff profile not found' })
    }

    const now = new Date()
    const storeId = staff.storeId

    // Check if attendance rules are enabled
    const rulesEnabled = await isFeatureEnabled(storeId, 'attendanceRuleActive')

    // Get attendance rule (if enabled)
    const rule = rulesEnabled ? await getAttendanceRuleWithDefaults(storeId) : null

    if (type === 'check_in') {
      // Check if already checked in today
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
      const existing = await prisma.attendance.findFirst({
        where: {
          staffId: staff.id,
          checkInTime: { gte: startOfDay }
        }
      })

      if (existing) {
        return res.status(400).json({ code: 400, message: 'Already checked in today' })
      }

      // 校验当日排班（优先根据员工排班的实际班次时间判定迟到）
      const todaySchedule = await prisma.schedule.findFirst({
        where: {
          staffId: staff.id,
          date: { gte: startOfDay, lte: endOfDay }
        }
      })

      // Determine if late based on schedule shift, attendance rule, or defaults
      let status = 'normal'
      let targetStartTime: string | null = null
      let gracePeriod = 15

      if (todaySchedule && todaySchedule.shift && todaySchedule.shift !== 'off') {
        // 查找排班对应的班次设置
        const shiftRecord = await prisma.shift.findFirst({
          where: {
            storeId,
            OR: [
              { key: todaySchedule.shift },
              { name: todaySchedule.shift },
              { id: todaySchedule.shift }
            ]
          }
        })
        if (shiftRecord?.startTime) {
          targetStartTime = shiftRecord.startTime
        } else {
          // 内置常见班次备用时间
          const defaultShiftTimes: Record<string, string> = {
            morning: '08:00',
            afternoon: '14:00',
            evening: '18:00'
          }
          if (defaultShiftTimes[todaySchedule.shift]) {
            targetStartTime = defaultShiftTimes[todaySchedule.shift]
          }
        }
      }

      if (rule) {
        gracePeriod = rule.gracePeriod ?? 15
        if (!targetStartTime) {
          targetStartTime = rule.workStartTime
        }
      }

      if (targetStartTime) {
        const [startHour, startMin] = targetStartTime.split(':').map(Number)
        const lateThreshold = startHour * 60 + startMin + gracePeriod
        const currentMinutes = now.getHours() * 60 + now.getMinutes()

        if (currentMinutes > lateThreshold) {
          status = 'late'
        }
      } else {
        // Default fallback: 9:30 AM (no shift, no rule)
        const hour = now.getHours()
        if (hour > 9 || (hour === 9 && now.getMinutes() > 30)) {
          status = 'late'
        }
      }

      const attendance = await prisma.attendance.create({
        data: {
          staffId: staff.id,
          checkInTime: now,
          status,
          gpsLocation,
          note
        }
      })

      // 更新排班状态为已打卡
      if (todaySchedule) {
        await prisma.schedule.update({
          where: { id: todaySchedule.id },
          data: { status: 'completed' }
        })
      }

      res.status(201).json({
        code: 201,
        message: 'Check in successful',
        data: attendance,
        timestamp: new Date().toISOString()
      })
    } else if (type === 'check_out') {
      // Check out - 支持通过attendanceId指定，或查找当日的未checkout记录
      let attendance
      const { attendanceId } = req.body

      if (attendanceId) {
        // 通过ID直接指定
        attendance = await prisma.attendance.findFirst({
          where: { id: attendanceId, staffId: staff.id }
        })
      } else {
        // 查找当日的未checkout记录
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
        attendance = await prisma.attendance.findFirst({
          where: {
            staffId: staff.id,
            checkInTime: { gte: startOfDay },
            checkOutTime: null
          }
        })
      }

      if (!attendance) {
        return res.status(400).json({ code: 400, message: 'No check in record found today' })
      }

      const updated = await prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          checkOutTime: now,
          gpsLocation: gpsLocation || undefined
        }
      })

      res.json({
        code: 200,
        message: 'Check out successful',
        data: { ...updated, id: attendance.id }, // 确保返回id
        timestamp: new Date().toISOString()
      })
    } else {
      return res.status(400).json({ code: 400, message: 'Invalid attendance type' })
    }
  } catch (error) {
    console.error('Attendance error:', error)
    res.status(500).json({ code: 500, message: 'Failed to record attendance' })
  }
})

// GET /api/staff/attendance/today
router.get('/attendance/today', authenticate, async (req: AuthRequest, res) => {
  try {
    const staff = await prisma.staff.findFirst({
      where: { userId: req.user!.id }
    })

    if (!staff) {
      return res.status(404).json({ code: 404, message: 'Staff profile not found' })
    }

    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const attendance = await prisma.attendance.findFirst({
      where: {
        staffId: staff.id,
        checkInTime: { gte: startOfDay }
      }
    })

    res.json({
      code: 200,
      data: attendance || null,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get today attendance error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get attendance' })
  }
})

// GET /api/staff/attendance/summary - 门店今日全员考勤概况（后台管理员/店长概览）
router.get('/attendance/summary', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

    // 获取本店所有员工
    const staffList = await prisma.staff.findMany({
      where: { storeId, status: 'active' },
      select: { id: true, name: true, employeeNumber: true, position: true }
    })

    const staffIds = staffList.map(s => s.id)

    // 获取今日所有打卡记录
    const attendances = await prisma.attendance.findMany({
      where: {
        staffId: { in: staffIds },
        checkInTime: { gte: startOfDay, lte: endOfDay }
      }
    })

    const attendanceMap = new Map(attendances.map(a => [a.staffId, a]))

    let present = 0
    let late = 0
    let notCheckedIn = 0

    staffList.forEach(s => {
      const record = attendanceMap.get(s.id)
      if (record) {
        present++
        if (record.status === 'late') {
          late++
        }
      } else {
        notCheckedIn++
      }
    })

    res.json({
      code: 200,
      data: {
        totalStaff: staffList.length,
        present,
        onTime: present - late,
        late,
        notCheckedIn,
        records: attendances
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get attendance summary error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get attendance summary' })
  }
})

// GET /api/staff/attendance/list
router.get('/attendance/list', authenticate, async (req: AuthRequest, res) => {
  try {
    const { staffId, startDate, endDate } = req.query

    const where: any = {}
    if (staffId) where.staffId = staffId as string
    if (startDate || endDate) {
      where.checkInTime = {}
      if (startDate) where.checkInTime.gte = parseDateBoundary(startDate as string)
      if (endDate) where.checkInTime.lte = parseDateBoundary(endDate as string, true)
    }

    const attendances = await prisma.attendance.findMany({
      where,
      include: { staff: { select: { id: true, name: true, employeeNumber: true } } },
      orderBy: { checkInTime: 'desc' },
      take: 100
    })

    res.json({
      code: 200,
      data: attendances,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get attendance list error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get attendance list' })
  }
})

// POST /api/staff/schedule
router.post('/schedule', authenticate, authorize('admin', 'manager'), validateBody(scheduleSchema), async (req: AuthRequest, res) => {
  try {
    const { staffId, date, shift } = req.body
    const storeId = req.user!.storeId

    // Check if leave-schedule linkage is enabled
    const leaveLinkageEnabled = await isFeatureEnabled(storeId, 'leaveScheduleLinkage')

    // If linkage enabled, check if staff has approved leave on this date
    if (leaveLinkageEnabled) {
      const hasLeave = await hasApprovedLeaveOnDate(staffId, new Date(date))
      if (hasLeave) {
        return res.status(400).json({
          code: 400,
          message: 'Cannot schedule: Staff has approved leave on this date',
          timestamp: new Date().toISOString()
        })
      }
    }

    // Check if schedule exists
    const existing = await prisma.schedule.findFirst({
      where: {
        staffId,
        date: new Date(date)
      }
    })

    if (existing) {
      const updated = await prisma.schedule.update({
        where: { id: existing.id },
        data: { shift }
      })
      return res.json({
        code: 200,
        message: 'Schedule updated',
        data: updated,
        timestamp: new Date().toISOString()
      })
    }

    const schedule = await prisma.schedule.create({
      data: {
        staffId,
        date: new Date(date),
        shift
      }
    })

    res.status(201).json({
      code: 201,
      message: 'Schedule created',
      data: schedule,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Create schedule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create schedule' })
  }
})

// GET /api/staff/schedule/list
router.get('/schedule/list', authenticate, async (req: AuthRequest, res) => {
  try {
    const { staffId, month } = req.query
    const storeId = req.user!.storeId

    const where: any = {}
    if (staffId) where.staffId = staffId as string
    if (month) {
      const [year, m] = (month as string).split('-')
      const startDate = new Date(parseInt(year), parseInt(m) - 1, 1)
      const endDate = new Date(parseInt(year), parseInt(m), 0)
      where.date = { gte: startDate, lte: endDate }
    }

    const schedules = await prisma.schedule.findMany({
      where,
      include: { staff: { select: { id: true, name: true, employeeNumber: true } } },
      orderBy: { date: 'asc' }
    })

    // Check if leave-schedule linkage is enabled
    const leaveLinkageEnabled = await isFeatureEnabled(storeId, 'leaveScheduleLinkage')

    let leaves: any[] = []
    if (leaveLinkageEnabled && month) {
      const [year, m] = (month as string).split('-')
      const startDate = new Date(parseInt(year), parseInt(m) - 1, 1)
      const endDate = new Date(parseInt(year), parseInt(m), 0)
      leaves = await getApprovedLeavesInRange(storeId, startDate, endDate)
    }

    res.json({
      code: 200,
      data: schedules,
      leaves: leaves,
      leaveLinkageEnabled,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get schedule list error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get schedule list' })
  }
})

// GET /api/staff/schedule/my - Get current staff's schedule
router.get('/schedule/my', authenticate, async (req: AuthRequest, res) => {
  try {
    const { weekStart } = req.query

    const staff = await prisma.staff.findFirst({
      where: { userId: req.user!.id }
    })

    if (!staff) {
      return res.status(404).json({ code: 404, message: 'Staff profile not found' })
    }

    const startOfWeek = weekStart ? new Date(weekStart as string) : new Date()
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6)

    const schedules = await prisma.schedule.findMany({
      where: {
        staffId: staff.id,
        date: { gte: startOfWeek, lte: endOfWeek }
      },
      orderBy: { date: 'asc' }
    })

    // Format as weekly object with day keys
    const weeklySchedule: any = {
      sunday: 'off',
      monday: 'off',
      tuesday: 'off',
      wednesday: 'off',
      thursday: 'off',
      friday: 'off',
      saturday: 'off'
    }

    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    schedules.forEach(s => {
      const dayIndex = new Date(s.date).getDay()
      weeklySchedule[dayKeys[dayIndex]] = s.shift
    })

    res.json({
      code: 200,
      data: weeklySchedule,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get my schedule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get schedule' })
  }
})

// GET /api/staff/attendance/history - Get current staff's attendance history
router.get('/attendance/history', authenticate, async (req: AuthRequest, res) => {
  try {
    const { month, year } = req.query

    const staff = await prisma.staff.findFirst({
      where: { userId: req.user!.id }
    })

    if (!staff) {
      return res.status(404).json({ code: 404, message: 'Staff profile not found' })
    }

    const now = new Date()
    const targetMonth = month ? parseInt(month as string) : now.getMonth() + 1
    const targetYear = year ? parseInt(year as string) : now.getFullYear()

    const startDate = new Date(targetYear, targetMonth - 1, 1)
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59)

    const attendances = await prisma.attendance.findMany({
      where: {
        staffId: staff.id,
        checkInTime: { gte: startDate, lte: endDate }
      },
      orderBy: { checkInTime: 'desc' }
    })

    res.json({
      code: 200,
      data: attendances,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get attendance history error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get attendance history' })
  }
})

// GET /api/staff/salary/my - Get current staff's salary
router.get('/salary/my', authenticate, async (req: AuthRequest, res) => {
  try {
    const { month, year } = req.query

    const staff = await prisma.staff.findFirst({
      where: { userId: req.user!.id }
    })

    if (!staff) {
      return res.status(404).json({ code: 404, message: 'Staff profile not found' })
    }

    const now = new Date()
    if ((month !== undefined || year !== undefined) && (!Number.isInteger(Number(month)) || Number(month) < 1 || Number(month) > 12 || !Number.isInteger(Number(year)) || Number(year) < 2000 || Number(year) > 2100)) {
      return res.status(400).json({ code: 400, message: 'Valid month and year are required' })
    }
    const targetMonth = month ? `${year}-${String(month).padStart(2, '0')}` : formatDate(now).slice(0, 7)

    const salaryRecord = await prisma.salary.findFirst({
      where: {
        staffId: staff.id,
        month: targetMonth
      },
      orderBy: { createdAt: 'desc' }
    })

    if (!salaryRecord) {
      return res.json({
        code: 200,
        data: null,
        timestamp: new Date().toISOString()
      })
    }

    // 查询该月份真实出勤与迟到记录
    const [yearNum, monthNum] = targetMonth.split('-').map(Number)
    const monthStart = new Date(Date.UTC(yearNum, monthNum - 1, 1) - 7 * 3600000)
    const monthEnd = new Date(Date.UTC(yearNum, monthNum, 1) - 7 * 3600000 - 1)

    const monthAttendances = await prisma.attendance.findMany({
      where: {
        staffId: staff.id,
        checkInTime: { gte: monthStart, lte: monthEnd }
      }
    })

    const workDays = new Set(monthAttendances.map(a => formatDate(a.checkInTime))).size
    const lateDays = new Set(monthAttendances.filter(a => a.status === 'late').map(a => formatDate(a.checkInTime))).size

    const approvedOvertime = await prisma.overtimeRequest.findMany({ where: { staffId: staff.id, status: 'approved', date: { gte: monthStart, lte: monthEnd } } })
    // Transform to match frontend expected format
    const salaryData = {
      staffName: staff.name,
      month: salaryRecord.month,
      baseSalary: salaryRecord.baseSalary,
      workDays,
      lateDays,
      overtimeHours: approvedOvertime.reduce((sum, entry) => sum + entry.hours, 0),
      overtimePay: salaryRecord.overtime,
      bonuses: salaryRecord.bonus,
      commissions: salaryRecord.commission,
      deductions: salaryRecord.deduction,
      totalSalary: salaryRecord.finalAmount,
      status: salaryRecord.status
    }

    res.json({
      code: 200,
      data: salaryData,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get salary error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get salary' })
  }
})

// PUT /api/staff/:id/reset-password - Reset staff password (admin only)
router.put('/:id/reset-password', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { newPassword } = req.body

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ code: 400, message: 'Password must be at least 6 characters' })
    }

    const hashed = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({
      where: { id },
      data: { password: hashed }
    })

    res.json({ code: 200, message: 'Password reset successfully', timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Reset password error:', error)
    res.status(500).json({ code: 500, message: 'Failed to reset password' })
  }
})

export { router as staffRouter }
