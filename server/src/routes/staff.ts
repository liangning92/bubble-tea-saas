import { calculateSalary } from '../services/StaffService'
import {userAccessV2} from '../services/StaffPermissionV2Service'
import { isPayrollEmployee, saveStaffIdentity } from '../services/StaffIdentityService'
import { getPayrollRules, savePayrollRules, payrollRuleSchema } from '../services/PayrollRuleService'
import { isLegacyAutomaticBasis, refreshEmploymentPayroll, getProbationRule, saveProbationRule, probationRuleSchema, saveEnrollment, staffProbation, calculatePayrollBasis, savedPayrollBasis, ProbationInputError, dayNumber } from '../services/ProbationService'
import { allocateEmployeeNumber } from '../services/EmployeeNumberService'
import { createEmployeeAttendance } from '../services/EmployeeAttendanceService'
import { updateStaffSystemRole, StaffAccessError } from '../services/StaffPermissionService'
import { savedAdjustmentPlan } from '../services/SalaryAdjustmentService'
import { formatDate, startOfDay as wibDayStart, endOfDay as wibDayEnd, startOfWeek as wibWeekStart } from '../utils/dateUtils'
import { parseDateBoundary } from '../utils/businessDate'
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

const payrollDate = z.string().refine(value=>{try{if(/^\d{4}-\d{2}-\d{2}$/.test(value))dayNumber(value);else if(!Number.isFinite(Date.parse(value)))return false;return true}catch{return false}},'Valid date is required')
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
  hireDate: payrollDate.optional(),
  probationEnabled: z.boolean().optional(),
  confirmationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  emergencyContact: z.string().optional(),
  emergencyPhone: z.string().optional(),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional()
})

const updateStaffSchema = z.object({
  payrollEmployee:z.boolean().optional(),
  name: z.string().min(1).max(50).optional(),
  position: z.string().optional(),
  status: z.enum(['active', 'inactive', 'resigned', 'suspended']).optional(),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern']).optional(),
  baseSalary: z.number().int().min(0).optional(),
  hourlyRate: z.number().int().min(0).optional(),
  weeklyHours: z.number().optional(),
  hireDate: payrollDate.optional(),
  probationEnabled: z.boolean().optional(),
  confirmationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  terminationDate: payrollDate.nullable().optional(),
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
        list: await Promise.all(staff.map(async s => (req.user!.accessRole?.version===2?req.user!.accessRole.modes?.['staff.read']==='allow':['admin', 'manager'].includes(req.user!.role)) ? ({
          ...s,
          payrollEmployee: await isPayrollEmployee(prisma,s),
          probation: await staffProbation(prisma,s),
          phone: s.user.phone,
          role: s.user.role,
          _count: undefined
        }) : ({ id: s.id, name: s.name, employeeNumber: s.employeeNumber, position: s.position, status: s.status }))),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get staff error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get staff' })
  }
})

router.get('/payroll-rules',authenticate,authorize('admin','manager'),async(req:AuthRequest,res)=>{
 try{res.json({code:200,data:await getPayrollRules(prisma,req.user!.storeId!)})}catch(error:any){res.status(500).json({code:500,message:error.message})}
})
router.put('/payroll-rules',authenticate,authorize('admin'),validateBody(payrollRuleSchema),async(req:AuthRequest,res)=>{
 try{res.json({code:200,data:await savePayrollRules(prisma,req.user!.storeId!,req.body)})}catch(error:any){res.status(400).json({code:400,message:error.message})}
})

// Probation policy is configured explicitly; existing employees are opt-in.
router.get('/probation-rule', authenticate, authorize('admin','manager'), async(req:AuthRequest,res)=>{
 try {res.json({code:200,data:await getProbationRule(prisma,req.user!.storeId)})}catch{res.status(500).json({code:500,message:'PROBATION_RULE_READ_FAILED'})}
})
router.put('/probation-rule', authenticate, authorize('admin'), validateBody(probationRuleSchema), async(req:AuthRequest,res)=>{
 try {res.json({code:200,data:await saveProbationRule(prisma,req.user!.storeId,req.body)})}catch(error:any){res.status(error instanceof ProbationInputError?400:500).json({code:error instanceof ProbationInputError?400:500,message:error.message})}
})
router.get('/salary/my/probation',authenticate,async(req:AuthRequest,res)=>{
 try {const staff=await prisma.staff.findFirst({where:{userId:req.user!.id}});if(!staff)return res.status(404).json({code:404,message:'Staff profile not found'})
 const month=req.query.month ? String(req.query.month) : formatDate(new Date()).slice(0,7)
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return res.status(400).json({code:400,message:'INVALID_SALARY_PERIOD'})
 const salary=await prisma.salary.findFirst({where:{staffId:staff.id,month},orderBy:{createdAt:'desc'}})
 const snapshot=salary?await savedPayrollBasis(prisma,staff.storeId,salary.id):null
 const basis=salary?.status==='pending'&&isLegacyAutomaticBasis(snapshot)&&staff.baseSalary!==null?await calculatePayrollBasis(prisma,staff,month):snapshot || (!salary&&staff.baseSalary!==null ? await calculatePayrollBasis(prisma,staff,month):null)
 res.json({code:200,data:{...await staffProbation(prisma,staff),basis,month,salaryStatus:salary?.status||'not_created',recordedBaseSalary:salary?.baseSalary??null}})
 }catch(error:any){res.status(error instanceof ProbationInputError?400:500).json({code:error instanceof ProbationInputError?400:500,message:error.message})}
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
        payrollEmployee: await isPayrollEmployee(prisma,staff),
        probation: await staffProbation(prisma, staff),
        phone: staff.user.phone,
        role: staff.user.role,
        accessRole: staff.user.role==='admin'?null:await userAccessV2({role:staff.user.role,staffId:staff.id,storeId:staff.storeId}).then(access=>access?{id:access.id,name:access.name,revision:access.revision}:null)
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
          employeeNumber: await allocateEmployeeNumber(tx),
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

      const rule = await getProbationRule(tx, storeId)
      await saveEnrollment(tx, newStaff, req.body.probationEnabled ?? rule.enabled, req.body.confirmationDate)
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
    if (error instanceof ProbationInputError) return res.status(400).json({code:400,message:error.message})
    console.error('Create staff error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create staff' })
  }
})

// PUT /api/staff/:id
router.put('/:id', authenticate, authorize('admin', 'manager'), validateBody(updateStaffSchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const existing = await prisma.staff.findUnique({ where: { id }, select: { storeId: true, userId: true, hireDate:true, terminationDate:true, user:{select:{role:true}} } })
    if (!existing) return res.status(404).json({ code: 404, message: 'Staff not found' })
    if (!canAccessStore(req.user!, existing.storeId)) {
      return res.status(403).json({ code: 403, message: 'Access denied: Store mismatch' })
    }
    if(existing.user.role==='admin' && req.user!.role!=='admin')return res.status(403).json({code:403,message:'Access denied'})
    if(req.body.payrollEmployee!==undefined && (req.user!.role!=='admin'||existing.user.role!=='admin'))return res.status(403).json({code:403,message:'Access denied'})
    if(req.body.status && req.body.status!=='active' && existing.userId===req.user!.id)return res.status(400).json({code:400,message:'不能停用当前登录账户，请由另一位管理员操作。'})
    if(req.body.status && req.body.status!=='active' && existing.user.role==='admin'){
      const activeAdmins=await prisma.user.count({where:{role:'admin',OR:[{staff:null},{staff:{status:'active'}}]}})
      if(activeAdmins<=1)return res.status(400).json({code:400,message:'请先设置另一位有效管理员，再停用此账户。'})
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
    if (terminationDate !== undefined) updateData.terminationDate = terminationDate===null?null:new Date(terminationDate)
    if (emergencyContact !== undefined) updateData.emergencyContact = emergencyContact
    if (emergencyPhone !== undefined) updateData.emergencyPhone = emergencyPhone
    if (bankAccount !== undefined) updateData.bankAccount = bankAccount
    if (bankName !== undefined) updateData.bankName = bankName
    if (email !== undefined) updateData.email = email
    if (address !== undefined) updateData.address = address

    const staff = await prisma.$transaction(async tx => {
      const staff = await tx.staff.update({ where: { id }, data: updateData })
      if(staff.status==='resigned'&&!staff.terminationDate)throw new ProbationInputError('TERMINATION_DATE_REQUIRED')
      if(staff.terminationDate&&staff.hireDate&&staff.terminationDate<staff.hireDate)throw new ProbationInputError('TERMINATION_BEFORE_HIRE')
      if(req.body.payrollEmployee!==undefined)await saveStaffIdentity(tx,{...staff,user:existing.user},req.body.payrollEmployee)
      await saveEnrollment(tx, {...staff,user:existing.user}, req.body.probationEnabled, req.body.confirmationDate)
      if((hireDate!==undefined&&staff.hireDate?.getTime()!==existing.hireDate?.getTime())||(terminationDate!==undefined&&staff.terminationDate?.getTime()!==existing.terminationDate?.getTime()))if(await isPayrollEmployee(tx,{...staff,user:existing.user}))await refreshEmploymentPayroll(tx,staff)
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
    if (error instanceof ProbationInputError) return res.status(400).json({code:400,message:error.message})
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
    await updateStaffSystemRole(req.user!, staff.id, role.data)

    res.json({
      code: 200,
      message: 'Role updated',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if(error instanceof StaffAccessError)return res.status(error.status).json({code:error.status,message:error.message})
    console.error('Update role error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update role' })
  }
})

// DELETE /api/staff/:id
router.delete('/:id', authenticate, authorize('admin'), async (_req: AuthRequest, res) => {
  res.status(400).json({code:400,message:'请在员工资料中办理离职并填写最后计薪日期。'})
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
      const status = 'normal' // authoritative shift snapshot computed in the transaction
      const attendance = await createEmployeeAttendance({
        data: {
          staffId: staff.id,
          checkInTime: now,
          status,
          gpsLocation,
          note
        }
      }.data, storeId)

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
        const startOfDay = new Date(now.getTime()-24*3600000)
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

      if (attendance.checkOutTime) return res.json({code:200,data:attendance,alreadyRecorded:true})
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

    const startOfDay = wibDayStart(new Date())

    const attendance = await prisma.attendance.findFirst({
      where: {
        staffId: staff.id,
        OR: [{checkInTime: {gte: startOfDay, lte:wibDayEnd(startOfDay)}}, {checkOutTime:null,checkInTime:{gte:new Date(Date.now()-24*3600000),lte:new Date()}}]
      },
      orderBy: { checkInTime: 'desc' }
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

    const where: any = {staff:{storeId:req.user!.storeId}}
    if (req.user!.accessRole?.version===2?req.user!.accessRole.modes?.['attendance.read']!=='allow':!['admin','manager'].includes(req.user!.role)) {
      if (staffId && staffId !== req.user!.staffId) return res.status(403).json({code:403,message:'Access denied'})
      where.staffId = req.user!.staffId
    } else if (staffId) where.staffId = staffId as string
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

    const where: any = {staff:{storeId:req.user!.storeId}}
    if (req.user!.accessRole?.version===2?req.user!.accessRole.modes?.['schedules.read']!=='allow':!['admin','manager'].includes(req.user!.role)) {
      if (staffId && staffId !== req.user!.staffId) return res.status(403).json({code:403,message:'Access denied'})
      where.staffId = req.user!.staffId
    } else if (staffId) where.staffId = staffId as string
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

    let startOfWeek: Date
    try { startOfWeek = weekStart ? parseDateBoundary(weekStart as string) : wibWeekStart(new Date()) }
    catch { return res.status(400).json({ code: 400, message: 'Invalid weekStart' }) }
    if (!startOfWeek || isNaN(startOfWeek.getTime())) return res.status(400).json({ code: 400, message: 'Invalid weekStart' })
    const endOfWeek = new Date(startOfWeek.getTime() + 7 * 86400000 - 1)

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
      const dayIndex = new Date(`${formatDate(s.date)}T12:00:00+07:00`).getUTCDay()
      weeklySchedule[dayKeys[dayIndex]] = s.shift
    })

    weeklySchedule.shiftDetails = await prisma.shift.findMany({ where: { storeId: staff.storeId }, select: { key: true, name: true, startTime: true, endTime: true, color: true } })

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
    const targetMonth = month ? parseInt(month as string) : Number(formatDate(now).slice(5, 7))
    const targetYear = year ? parseInt(year as string) : Number(formatDate(now).slice(0, 4))

    const startDate = new Date(Date.UTC(targetYear, targetMonth - 1, 1) - 7 * 3600000)
    const endDate = new Date(Date.UTC(targetYear, targetMonth, 1) - 7 * 3600000 - 1)

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

// GET /api/staff/overview/monthly - 员工端首页本月个人资料概览（考勤健康度、奖惩积分、排班、待办与公告）
router.get('/overview/monthly', authenticate, async (req: AuthRequest, res) => {
  try {
    const staff = await prisma.staff.findFirst({
      where: { userId: req.user!.id },
      include: { store: { select: { id: true, name: true } } }
    })

    if (!staff) {
      return res.status(404).json({ code: 404, message: 'Staff profile not found' })
    }

    const now = new Date()
    const targetMonth = req.query.month ? parseInt(req.query.month as string) : Number(formatDate(now).slice(5, 7))
    const targetYear = req.query.year ? parseInt(req.query.year as string) : Number(formatDate(now).slice(0, 4))

    const monthStart = new Date(Date.UTC(targetYear, targetMonth - 1, 1) - 7 * 3600000)
    const monthEnd = new Date(Date.UTC(targetYear, targetMonth, 1) - 7 * 3600000 - 1)

    // 1. 本月考勤数据
    const attendances = await prisma.attendance.findMany({
      where: {
        staffId: staff.id,
        checkInTime: { gte: monthStart, lte: monthEnd }
      },
      orderBy: { checkInTime: 'desc' }
    })

    const presentDays = new Set(attendances.map(a => formatDate(a.checkInTime))).size
    const lateCount = attendances.filter(a => a.status === 'late').length
    const earlyLeaveCount = attendances.filter(a => a.status === 'early').length

    // 今日打卡
    const todayStart = wibDayStart(now)
    const todayAttendance = attendances.find(a => new Date(a.checkInTime) >= todayStart) || null

    // 2. 本月请假天数
    const leaves = await prisma.leave.findMany({
      where: {
        staffId: staff.id,
        status: 'approved',
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart }
      }
    })
    const totalLeaveDays = leaves.reduce((sum, l) => sum + l.totalDays, 0)

    // 3. 奖惩与积分变动（本月积分记录与累计积分）
    const pointBalance = await prisma.staffPoint.findUnique({
      where: { staffId: staff.id }
    })

    const monthlyPointLogs = await prisma.staffPointLog.findMany({
      where: {
        staffId: staff.id,
        createdAt: { gte: monthStart, lte: monthEnd }
      },
      orderBy: { createdAt: 'desc' }
    })

    const monthlyEarnedPoints = monthlyPointLogs
      .filter(l => l.points > 0)
      .reduce((sum, l) => sum + l.points, 0)

    const monthlyDeductedPoints = monthlyPointLogs
      .filter(l => l.points < 0)
      .reduce((sum, l) => sum + Math.abs(l.points), 0)

    // 奖惩事件 (Discipline)
    const disciplines = await prisma.discipline.findMany({
      where: {
        staffId: staff.id,
        incidentDate: { gte: monthStart, lte: monthEnd }
      },
      orderBy: { incidentDate: 'desc' }
    })

    const rewardsCount = disciplines.filter(d => ['bonus', 'award'].includes(d.type)).length + monthlyPointLogs.filter(l => l.points > 0).length
    const penaltiesCount = disciplines.filter(d => ['warning', 'deduction', 'suspension'].includes(d.type)).length + monthlyPointLogs.filter(l => l.points < 0).length

    // 4. 本周排班与今日班次
    const weekStart = wibWeekStart(now)
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000 - 1)

    const weekSchedules = await prisma.schedule.findMany({
      where: {
        staffId: staff.id,
        date: { gte: weekStart, lte: weekEnd }
      },
      orderBy: { date: 'asc' }
    })

    const shifts = await prisma.shift.findMany({
      where: { storeId: staff.storeId }
    })
    const shiftMap = new Map(shifts.map(s => [s.key, s]))

    const todayDateString = formatDate(now)
    const todayScheduleRecord = weekSchedules.find(s => formatDate(s.date) === todayDateString)

    // 5. 待办卫生任务统计
    const pendingTasks = await prisma.hygieneTask.count({
      where: {
        storeId: staff.storeId,
        status: 'pending',
        OR: [
          { staffId: staff.id },
          { staffId: null }
        ]
      }
    })

    // 6. 门店最新置顶公告
    const activeAnnouncements = await prisma.announcement.findMany({
      where: {
        storeId: staff.storeId,
        isActive: true,
        AND: [{ OR: [{ startAt: null }, { startAt: { lte: now } }] }, { OR: [{ endAt: null }, { endAt: { gte: now } }] }]
      },
      orderBy: { priority: 'desc' },
      take: 2
    })

    res.json({
      code: 200,
      data: {
        staff: {
          id: staff.id,
          name: staff.name,
          employeeNumber: staff.employeeNumber,
          position: staff.position,
          storeName: staff.store?.name || ''
        },
        month: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
        attendance: {
          presentDays,
          lateCount,
          earlyLeaveCount,
          leaveDays: totalLeaveDays,
          todayAttendance
        },
        pointsAndDiscipline: {
          currentPoints: pointBalance?.balance || 0,
          monthlyEarnedPoints,
          monthlyDeductedPoints,
          rewardsCount,
          penaltiesCount,
          recentLogs: monthlyPointLogs.slice(0, 5),
          recentDisciplines: disciplines.slice(0, 5)
        },
        schedule: {
          todayShift: todayScheduleRecord ? {
            shiftKey: todayScheduleRecord.shift,
            shiftName: shiftMap.get(todayScheduleRecord.shift)?.name || todayScheduleRecord.shift,
            startTime: shiftMap.get(todayScheduleRecord.shift)?.startTime,
            endTime: shiftMap.get(todayScheduleRecord.shift)?.endTime,
            color: shiftMap.get(todayScheduleRecord.shift)?.color
          } : null,
          weeklyList: weekSchedules.map(s => ({
            date: formatDate(s.date),
            shift: s.shift,
            shiftName: shiftMap.get(s.shift)?.name || s.shift,
            color: shiftMap.get(s.shift)?.color
          }))
        },
        pendingHygieneTasks: pendingTasks,
        announcements: activeAnnouncements
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get monthly overview error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get monthly overview' })
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

    const savedBasis=salaryRecord?await savedPayrollBasis(prisma,staff.storeId,salaryRecord.id):null
    if (!salaryRecord || salaryRecord.status==='pending'&&isLegacyAutomaticBasis(savedBasis)) {
      const calculation=await calculateSalary(staff.id,Number(targetMonth.slice(5)),Number(targetMonth.slice(0,4)))
      if(!calculation.payrollBasis.eligibleDays)return res.json({code:200,data:null})
      const deposits=calculation.depositDeductions.reduce((sum,item)=>sum+item.amount,0)
      return res.json({code:200,data:{...calculation,month:targetMonth,status:salaryRecord?'pending':'unrecorded',originalFinalAmount:salaryRecord?.finalAmount,commissions:salaryRecord?.commission||0,totalSalary:calculation.totalSalary+(salaryRecord?.commission||0),compensationRewards:calculation.compensation.rewards,compensationPenalties:calculation.compensation.penalties,compensationItems:calculation.compensation.items,depositDeductionAmount:deposits,otherDeductions:Math.max(0,calculation.deductions-deposits-calculation.compensation.penalties-calculation.latePenalty)}})
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
    const compensation=await savedAdjustmentPlan(staff.storeId!,salaryRecord.id)
    const depositPlan=await prisma.config.findUnique({where:{storeId_key:{storeId:staff.storeId!,key:`salary.depositPlan.${salaryRecord.id}`}}})
    const depositAmount=(depositPlan?JSON.parse(depositPlan.value):[]).reduce((sum:number,item:any)=>sum+Math.round(item.amountMinor/100),0)
    const basis=savedBasis
    const lateDeduction=basis?.correction?.lateDeduction||0
    // Transform to match frontend expected format
    const salaryData = {
      staffName: staff.name,
      month: salaryRecord.month,
      payrollBasis:basis,latePenalty:lateDeduction,
      baseSalary: salaryRecord.baseSalary,
      workDays,
      lateDays,
      overtimeHours: approvedOvertime.reduce((sum, entry) => sum + entry.hours, 0),
      overtimePay: salaryRecord.overtime,
      bonuses: salaryRecord.bonus,
      compensationRewards:compensation.rewards,compensationPenalties:compensation.penalties,compensationItems:compensation.items,depositDeductionAmount:depositAmount,otherDeductions:Math.max(0,salaryRecord.deduction-depositAmount-compensation.penalties-lateDeduction),
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

// Resolve the employee's linked login account; Staff.id and User.id differ.
router.put('/:id/reset-password', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { newPassword } = req.body
    if (typeof newPassword !== 'string' || newPassword.length < 6 || Buffer.byteLength(newPassword, 'utf8') > 72) {
      return res.status(400).json({ code: 400, message: 'Password must be at least 6 characters and at most 72 UTF-8 bytes' })
    }
    const staff = await prisma.staff.findUnique({ where: { id: req.params.id }, include: { user: { select: { id: true, role: true } } } })
    if (!staff || !staff.user) return res.status(404).json({ code: 404, message: 'Employee login account not found' })
    if (!canAccessStore(req.user!, staff.storeId) || (req.user!.role !== 'admin' && staff.user.role === 'admin')) {
      return res.status(403).json({ code: 403, message: 'Access denied' })
    }
    const hashed = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: staff.userId }, data: { password: hashed } })
    res.json({ code: 200, message: 'Password reset successfully', timestamp: new Date().toISOString() })
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ code: 404, message: 'Employee login account not found' })
    console.error('Reset password error:', error)
    res.status(500).json({ code: 500, message: 'Failed to reset password' })
  }
})

export { router as staffRouter }
