import {hasManagementAccess} from '../utils/managementAccess'
import {userAccessV2,AccessV2Error} from '../services/StaffPermissionV2Service'
import { prepareEmployeeOfflineAttendance, syncEmployeeOfflineAttendance, EmployeeOfflineAttendanceError } from '../services/EmployeeOfflineAttendanceService'
import { allocateEmployeeNumber } from '../services/EmployeeNumberService'
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import { timingSafeEqual } from 'crypto'
import prisma from '../config/database'
import { config } from '../config/env'
import { authenticate, AuthRequest } from '../middlewares/auth'
import { validateBody } from '../utils/validation'

const router = Router()

// Rate limiter for auth endpoints - prevent brute force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: { error: 'Too many login attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Validation schemas
const registerSchema = z.object({
  phone: z.string().min(10).max(15),
  password: z.string().min(10).refine(value => Buffer.byteLength(value, 'utf8') <= 72),
  name: z.string().min(1).max(50),
  storeName: z.string().min(1).max(100)
})

const loginSchema = z.object({
  phone: z.string(),
  password: z.string().min(1).refine(value => Buffer.byteLength(value, 'utf8') <= 72)
})

// Preparation requires the normal online session. Sync accepts only a signed,
// purpose-scoped grant plus a valid QR at the original occurrence time.
router.get('/employee-offline-attendance',authenticate,async(req:AuthRequest,res)=>{
 try{return res.json({code:200,data:await prepareEmployeeOfflineAttendance(req.user!)})}
 catch(error){const status=error instanceof EmployeeOfflineAttendanceError?error.status:500;return res.status(status).json({code:status,message:error instanceof EmployeeOfflineAttendanceError?error.message:'Offline attendance preparation failed'})}
})
const offlineAttendanceLimiter=rateLimit({windowMs:60000,max:300,standardHeaders:true,legacyHeaders:false})
router.post('/employee-offline-attendance/sync',offlineAttendanceLimiter,async(req,res)=>{
 try{return res.json({code:200,data:await syncEmployeeOfflineAttendance(req.body)})}
 catch(error){const status=error instanceof EmployeeOfflineAttendanceError?error.status:error instanceof z.ZodError?400:409;return res.status(status).json({code:status,message:error instanceof EmployeeOfflineAttendanceError?error.message:status===400?'Invalid attendance record':'Attendance needs review; local record retained'})}
})

// POST /api/auth/register
router.post('/register', authLimiter, validateBody(registerSchema), async (req, res) => {
  try {
    const { phone, password, name, storeName } = req.body
    const expectedSecret = process.env.BOOTSTRAP_SECRET || ''
    const suppliedSecret = req.get('x-bootstrap-secret') || ''
    const secretMatches = expectedSecret.length > 0 &&
      Buffer.byteLength(expectedSecret) === Buffer.byteLength(suppliedSecret) &&
      timingSafeEqual(Buffer.from(expectedSecret), Buffer.from(suppliedSecret))
    if (!secretMatches) {
      return res.status(expectedSecret ? 401 : 503).json({ code: expectedSecret ? 401 : 503, message: 'Initial setup is unavailable' })
    }

    const hashed = await bcrypt.hash(password, 12)
    const { user, store, staff } = await prisma.$transaction(async (tx) => {
      if (await tx.user.count() !== 0) throw new Error('BOOTSTRAP_CLOSED')
      const tenant = await tx.tenant.create({ data: { name: storeName } })
      const store = await tx.store.create({ data: { tenantId: tenant.id, name: storeName } })
      await tx.config.create({data:{storeId:store.id,key:'inventory_unified_stock_v1',value:new Date().toISOString(),category:'inventory'}})
      const user = await tx.user.create({
        data: { phone, password: hashed, role: 'admin', storeId: store.id }
      })
      const staff = await tx.staff.create({
        data: {
          userId: user.id,
          storeId: store.id,
          name,
          employeeNumber: await allocateEmployeeNumber(tx),
          position: 'Manager',
          status: 'active'
        }
      })
      return { user, store, staff }
    }, { isolationLevel: 'Serializable' })

    const managementAccess = true
    // Generate token - include staffId if user has a staff profile
    const token = jwt.sign(
      {
        id: user.id,
        phone: user.phone,
        role: String(user.role),
        storeId: store.id,
        staffId: staff.id,
        issuedAtMs: Date.now()
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn as any }
    )

    res.status(201).json({
      code: 201,
      message: 'Registration successful',
      data: {
        token,
        user: {
          id: user.id,
          phone: user.phone,
          role: user.role as string,
          managementAccess,
          storeId: store.id,
          staff: { id: staff.id, name: staff.name, employeeNumber: staff.employeeNumber, position: staff.position }
        }
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'BOOTSTRAP_CLOSED') {
      return res.status(409).json({ code: 409, message: 'Initial setup has already been completed' })
    }
    console.error('Register error:', error)
    res.status(500).json({ code: 500, message: 'Registration failed' })
  }
})

// POST /api/auth/login
router.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  try {
    const { phone, password } = req.body
    // Find user
    const user = await prisma.user.findUnique({
      where: { phone },
      include: { staff: true }
    })

    if (!user) {
      return res.status(401).json({
        code: 401,
        message: 'Invalid phone or password'
      })
    }

    if (user.staff && user.staff.status !== 'active') {
      return res.status(401).json({ code: 401, message: 'Invalid phone or password' })
    }

    // Check password
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      return res.status(401).json({
        code: 401,
        message: 'Invalid phone or password'
      })
    }

    const employeeClient=req.headers['x-client-app']==='employee'
    const access = employeeClient?null:await userAccessV2({role:user.role,storeId:user.staff?.storeId||user.storeId||'',staffId:user.staff?.id})
    const managementAccess = !employeeClient&&hasManagementAccess(user.role, access)
    if(req.headers['x-client-app']==='admin'&&!managementAccess)return res.status(403).json({code:403,message:'MANAGEMENT_ACCESS_REQUIRED'})
    // Generate token - include staffId if user has a staff profile
    const token = jwt.sign(
      {
        id: user.id,
        phone: user.phone,
        role: String(user.role),
        storeId: user.staff?.storeId || user.storeId || '',
        staffId: user.staff?.id || '',
        issuedAtMs: Date.now()
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn as any }
    )

    res.json({
      code: 200,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          phone: user.phone,
          role: user.role as string,
          managementAccess,
          storeId: user.storeId,
          staff: user.staff ? {
            id: user.staff.id,
            name: user.staff.name,
            employeeNumber: user.staff.employeeNumber,
            position: user.staff.position
          } : null
        }
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if(error instanceof AccessV2Error)return res.status(error.status).json({code:error.status,message:error.message})
    console.error('Login error:', error)
    res.status(500).json({ code: 500, message: 'Login failed' })
  }
})

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { staff: true, store: true }
    })

    if (!user) {
      return res.status(404).json({ code: 404, message: 'User not found' })
    }

    res.json({
      code: 200,
      data: {
        managementAccess: !req.user!.employeeApp&&hasManagementAccess(req.user!.role,req.user!.accessRole),
        id: user.id,
        phone: user.phone,
        role: user.role as string,
        storeId: user.storeId,
        store: user.store ? { id: user.store.id, name: user.store.name } : null,
        staff: user.staff ? {
          id: user.staff.id,
          name: user.staff.name,
          employeeNumber: user.staff.employeeNumber,
          position: user.staff.position
        } : null
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get me error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get user info' })
  }
})

// PUT /api/auth/password
router.put('/password', authenticate, async (req: AuthRequest, res) => {
  try {
    const { oldPassword, newPassword } = req.body

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) {
      return res.status(404).json({ code: 404, message: 'User not found' })
    }

    const valid = await bcrypt.compare(oldPassword, user.password)
    if (!valid) {
      return res.status(400).json({ code: 400, message: 'Incorrect old password' })
    }

    if (typeof newPassword !== 'string' || Buffer.byteLength(newPassword, 'utf8') < 10 || Buffer.byteLength(newPassword, 'utf8') > 72) {
      return res.status(400).json({ code: 400, message: 'New password must be 10–72 bytes' })
    }
    const hashed = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed }
    })

    res.json({
      code: 200,
      message: 'Password updated successfully',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Password update error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update password' })
  }
})

export { router as authRouter }
