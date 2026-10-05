import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
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
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern']).optional(),
  hourlyRate: z.number().optional(),
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
  hourlyRate: z.number().optional(),
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
    const { storeId, status, position } = req.query
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
        list: staff.map(s => ({
          ...s,
          phone: s.user.phone,
          role: s.user.role,
          _count: undefined
        })),
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
          employeeNumber: `EMP${Date.now()}`,
          position: position || '店员',
          employmentType: employmentType || 'full_time',
          hourlyRate: hourlyRate || null,
          weeklyHours: weeklyHours || null,
          hireDate: hireDate ? new Date(hireDate) : new Date(),
          emergencyContact: emergencyContact || null,
          emergencyPhone: emergencyPhone || null,
          bankAccount: bankAccount || null,
          bankName: bankName || null,
          email: email || null,
          address: address || null,
          status: 'active'
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
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const existing = await prisma.staff.findUnique({ where: { id }, select: { storeId: true, userId: true } })
    if (!existing) return res.status(404).json({ code: 404, message: 'Staff not found' })
    if (!canAccessStore(req.user!, existing.storeId)) {
      return res.status(403).json({ code: 403, message: 'Access denied: Store mismatch' })
    }
    const {
      name, position, status, employmentType, hourlyRate, weeklyHours,
      hireDate, terminationDate, emergencyContact, emergencyPhone,
      bankAccount, bankName, email, address
    } = req.body

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (position !== undefined) updateData.position = position
    if (status !== undefined) updateData.status = status
    if (employmentType !== undefined) updateData.employmentType = employmentType
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

      