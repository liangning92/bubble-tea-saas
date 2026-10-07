import { parseBusinessDate, BusinessInputError } from '../utils/businessDate'
import { formatDate, startOfDay } from '../utils/dateUtils'
import { requireResourceStore } from '../middlewares/resourceStore'
import { validateBody } from '../utils/validation'
import { z } from 'zod'
import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { isFeatureEnabled } from '../services/StaffConfigService'
import { prisma } from '../config/database'

const router = Router()
const shiftSwapRouter = Router()
const overtimeRouter = Router()
class WorkflowConflict extends Error {}
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const date = z.string().transform(value => parseBusinessDate(value))
const correctionSchema = z.object({ date, originalCheckIn: z.string().optional(), originalCheckOut: z.string().optional(), correctCheckIn: z.union([time, z.literal('')]).optional(), correctCheckOut: z.union([time, z.literal('')]).optional(), reason: z.string().trim().min(1) }).refine(value => !!value.correctCheckIn || !!value.correctCheckOut, 'Corrected check-in or check-out is required')
const overtimeSchema = z.object({ date, startTime: time, endTime: time, reason: z.string().trim().min(1) }).refine(value => value.startTime !== value.endTime, 'Start and end times must differ')
const swapSchema = z.object({ originalDate: date, originalShift: z.string().min(1), targetDate: date, targetShift: z.string().min(1), targetStaffId: z.string().min(1).optional(), reason: z.string().optional() })
const scope = (model: 'attendanceCorrection' | 'shiftSwap' | 'overtimeRequest') => requireResourceStore(req => (prisma[model] as any).findUnique({ where: { id: req.params.id }, select: { storeId: true } }))
async function decide(model: 'attendanceCorrection' | 'shiftSwap' | 'overtimeRequest', id: string, status: string, processedBy: string, adminNote?: string) {
  return prisma.$transaction(async tx => {
    const changed = await (tx[model] as any).updateMany({ where: { id, status: 'pending' }, data: { status, adminNote, processedBy, processedAt: new Date() } })
    if (changed.count !== 1) throw new WorkflowConflict('Request is no longer pending')
    return (tx[model] as any).findUniqueOrThrow({ where: { id } })
  })
}

// ========== 考勤纠错 ==========

// POST /api/staff-correction -员工提交考勤纠错申请
router.post('/', authenticate, validateBody(correctionSchema), async (req: AuthRequest, res) => {
  try {
    const { date, originalCheckIn, originalCheckOut, correctCheckIn, correctCheckOut, reason } = req.body
    const staffId = req.user!.staffId
    const storeId = req.user!.storeId

    const correction = await prisma.attendanceCorrection.create({
      data: {
        staffId,
        storeId,
        date,
        originalCheckIn,
        originalCheckOut,
        correctCheckIn,
        correctCheckOut,
        reason
      }
    })

    res.status(201).json({
      code: 201,
      message: 'Correction submitted',
      data: correction,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof WorkflowConflict) return res.status(409).json({ code: 409, message: error.message })
    if (error instanceof BusinessInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Submit correction error:', error)
    res.status(500).json({ code: 500, message: 'Failed to submit correction' })
  }
})

// GET /api/staff-correction/my - 获取当前员工的纠错申请
router.get('/my', authenticate, async (req: AuthRequest, res) => {
  try {
    const staffId = req.user!.staffId

    const corrections = await prisma.attendanceCorrection.findMany({
      where: { staffId },
      orderBy: { createdAt: 'desc' }
    })

    res.json({
      code: 200,
      data: corrections,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof WorkflowConflict) return res.status(409).json({ code: 409, message: error.message })
    if (error instanceof BusinessInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Get corrections error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get corrections' })
  }
})

// GET /api/staff-correction - 管理端获取所有纠错申请
router.get('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { status } = req.query

    const where: any = { storeId }
    if (status) where.status = status

    const corrections = await prisma.attendanceCorrection.findMany({
      where,
      include: { staff: true },
      orderBy: { createdAt: 'desc' }
    })

    res.json({
      code: 200,
      data: corrections,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof WorkflowConflict) return res.status(409).json({ code: 409, message: error.message })
    if (error instanceof BusinessInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Get corrections error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get corrections' })
  }
})

// PUT /api/staff-correction/:id/approve - 批准纠错申请
router.put('/:id/approve', authenticate, authorize('admin', 'manager'), scope('attendanceCorrection'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { adminNote } = req.body
    const processedBy = req.user!.id

    const correction = await prisma.attendanceCorrection.findUnique({ where: { id } })
    if (!correction) {
      return res.status(404).json({ code: 404, message: 'Correction not found' })
    }

    const updated = await prisma.$transaction(async tx => {
      const changed = await tx.attendanceCorrection.updateMany({ where: { id, status: 'pending' }, data: { status: 'approved', adminNote, processedBy, processedAt: new Date() } })
      if (changed.count !== 1) throw new WorkflowConflict('Request is no longer pending')
      const day = startOfDay(correction.date)
      const dayText = formatDate(day)
      const existing = await tx.attendance.findFirst({ where: { staffId: correction.staffId, checkInTime: { gte: day, lt: new Date(day.getTime() + 86400000) } } })
      const checkInTime = correction.correctCheckIn ? new Date(`${dayText}T${correction.correctCheckIn}:00+07:00`) : existing?.checkInTime
      if (!checkInTime) throw new WorkflowConflict('A corrected check-in is required for a missing attendance record')
      let checkOutTime = correction.correctCheckOut ? new Date(`${dayText}T${correction.correctCheckOut}:00+07:00`) : existing?.checkOutTime
      if (checkOutTime && checkOutTime < checkInTime) checkOutTime = new Date(checkOutTime.getTime() + 86400000)
      const rule = await tx.attendanceRule.findFirst({ where: { storeId: correction.storeId, isActive: true }, orderBy: { isDefault: 'desc' } })
      const scheduledStart = new Date(`${dayText}T${rule?.workStartTime || '09:00'}:00+07:00`)
      const status = checkInTime.getTime() > scheduledStart.getTime() + (rule?.gracePeriod ?? 15) * 60000 ? 'late' : 'normal'
      const attendanceData = { checkInTime, checkOutTime, status }
      if (existing) await tx.attendance.update({ where: { id: existing.id }, data: attendanceData })
      else await tx.attendance.create({ data: { staffId: correction.staffId, ...attendanceData } })
      return tx.attendanceCorrection.findUniqueOrThrow({ where: { id } })
    })

    res.json({
      code: 200,
      message: 'Correction approved',
      data: updated,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof WorkflowConflict) return res.status(409).json({ code: 409, message: error.message })
    if (error instanceof BusinessInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Approve correction error:', error)
    res.status(500).json({ code: 500, message: 'Failed to approve correction' })
  }
})

// PUT /api/staff-correction/:id/reject - 拒绝纠错申请
router.put('/:id/reject', authenticate, authorize('admin', 'manager'), scope('attendanceCorrection'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { adminNote } = req.body
    const processedBy = req.user!.id

    const updated = await decide('attendanceCorrection', id, 'rejected', processedBy, adminNote)

    res.json({
      code: 200,
      message: 'Correction rejected',
      data: updated,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof WorkflowConflict) return res.status(409).json({ code: 409, message: error.message })
    if (error instanceof BusinessInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Reject correction error:', error)
    res.status(500).json({ code: 500, message: 'Failed to reject correction' })
  }
})

// ========== 调班申请 ==========

// POST /api/shift-swap - 员工提交调班申请
shiftSwapRouter.post('/', authenticate, validateBody(swapSchema), async (req: AuthRequest, res) => {
  try {
    const { originalDate, originalShift, targetDate, targetShift, targetStaffId, reason } = req.body
    const staffId = req.user!.staffId
    const storeId = req.user!.storeId

    if (targetStaffId) {
      const target = await prisma.staff.findUnique({ where: { id: targetStaffId } })
      if (!target || target.storeId !== storeId || target.id === staffId) return res.status(400).json({ code: 400, message: 'Target must be another employee in this store' })
    }
    const swap = await prisma.shiftSwap.create({
      data: {
        staffId,
        storeId,
        originalDate,
        originalShift,
        targetDate,
        targetShift,
        targetStaffId,
        reason
      }
    })

    res.status(201).json({
      code: 201,
      message: 'Shift swap submitted',
      data: swap,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof WorkflowConflict) return res.status(409).json({ code: 409, message: error.message })
    if (error instanceof BusinessInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Submit shift swap error:', error)
    res.status(500).json({ code: 500, message: 'Failed to submit shift swap' })
  }
})

// GET /api/shift-swap/my - 获取当前员工的调班申请
shiftSwapRouter.get('/my', authenticate, async (req: AuthRequest, res) => {
  try {
    const staffId = req.user!.staffId

    const swaps = await prisma.shiftSwap.findMany({
      where: { staffId },
      orderBy: { createdAt: 'desc' }
    })

    res.json({
      code: 200,
      data: swaps,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof WorkflowConflict) return res.status(409).json({ code: 409, message: error.message })
    if (error instanceof BusinessInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Get shift swaps error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get shift swaps' })
  }
})

// GET /api/shift-swap - 管理端获取所有调班申请
shiftSwapRouter.get('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { status } = req.query

    const where: any = { storeId }
    if (status) where.status = status

    const swaps = await prisma.shiftSwap.findMany({
      where,
      include: { staff: true },
      orderBy: { createdAt: 'desc' }
    })

    res.json({
      code: 200,
      data: swaps,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof WorkflowConflict) return res.status(409).json({ code: 409, message: error.message })
    if (error instanceof BusinessInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Get shift swaps error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get shift swaps' })
  }
})

// PUT /api/shift-swap/:id/approve - 批准调班申请
shiftSwapRouter.put('/:id/approve', authenticate, authorize('admin', 'manager'), scope('shiftSwap'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { adminNote } = req.body
    const processedBy = req.user!.id
    const storeId = req.user!.storeId

    const swap = await prisma.shiftSwap.findUnique({ where: { id } })
    if (!swap) {
      return res.status(404).json({ code: 404, message: 'Shift swap not found' })
    }

    // Check if confirmation is required
    const confirmationRequired = await isFeatureEnabled(storeId, 'shiftSwapConfirmation')

    // If confirmation required and target hasn't confirmed, don't allow approval yet
    if (confirmationRequired && swap.targetStaffId && !swap.targetConfirmed) {
      return res.status(400).json({
        code: 400,
        message: 'Target staff has not confirmed this shift swap yet',
        timestamp: new Date().toISOString()
      })
    }

    const updated = await prisma.$transaction(async tx => {
      const changed = await tx.shiftSwap.updateMany({ where: { id, status: 'pending', ...(confirmationRequired && swap.targetStaffId ? { targetConfirmed: true } : {}) }, data: { status: 'approved', adminNote, processedBy, processedAt: new Date() } })
      if (changed.count !== 1) throw new WorkflowConflict('Request is no longer pending')
      const originalStart = startOfDay(swap.originalDate)
      const targetStart = startOfDay(swap.targetDate)
      const original = await tx.schedule.updateMany({ where: { staffId: swap.staffId, shift: swap.originalShift, date: { gte: originalStart, lt: new Date(originalStart.getTime() + 86400000) } }, data: { date: targetStart, shift: swap.targetShift } })
      if (original.count !== 1) throw new WorkflowConflict('Original schedule is missing or ambiguous')
      if (swap.targetStaffId) {
        const target = await tx.schedule.updateMany({ where: { staffId: swap.targetStaffId, shift: swap.targetShift, date: { gte: targetStart, lt: new Date(targetStart.getTime() + 86400000) } }, data: { date: originalStart, shift: swap.originalShift } })
        if (target.count !== 1) throw new WorkflowConflict('Target schedule is missing or ambiguous')
      }
      return tx.shiftSwap.findUniqueOrThrow({ where: { id } })
    })

    res.json({
      code: 200,
      message: 'Shift swap approved',
      data: updated,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof WorkflowConflict) return res.status(409).json({ code: 409, message: error.message })
    if (error instanceof BusinessInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Approve shift swap error:', error)
    res.status(500).json({ code: 500, message: 'Failed to approve shift swap' })
  }
})

// PUT /api/shift-swap/:id/confirm - 目标员工确认调班申请
shiftSwapRouter.put('/:id/confirm', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const staffId = req.user!.staffId

    const swap = await prisma.shiftSwap.findUnique({ where: { id } })
    if (!swap) {
      return res.status(404).json({ code: 404, message: 'Shift swap not found' })
    }

    // Verify this staff is the target
    if (swap.targetStaffId !== staffId) {
      return res.status(403).json({ code: 403, message: 'Not authorized to confirm this swap' })
    }

    if (swap.status !== 'pending') {
      return res.status(400).json({ code: 400, message: 'Swap is no longer pending' })
    }

    const updated = await prisma.shiftSwap.update({
      where: { id },
      data: {
        targetConfirmed: true
      }
    })

    res.json({
      code: 200,
      message: 'Shift swap confirmed',
      data: updated,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof WorkflowConflict) return res.status(409).json({ code: 409, message: error.message })
    if (error instanceof BusinessInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Confirm shift swap error:', error)
    res.status(500).json({ code: 500, message: 'Failed to confirm shift swap' })
  }
})

// GET /api/shift-swap/pending-confirm - 获取需要当前员工确认的调班申请
shiftSwapRouter.get('/pending-confirm', authenticate, async (req: AuthRequest, res) => {
  try {
    const staffId = req.user!.staffId

    const swaps = await prisma.shiftSwap.findMany({
      where: {
        targetStaffId: staffId,
        status: 'pending',
        targetConfirmed: false
      },
      include: {
        staff: { select: { name: true, employeeNumber: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    res.json({
      code: 200,
      data: swaps,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof WorkflowConflict) return res.status(409).json({ code: 409, message: error.message })
    if (error instanceof BusinessInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Get pending confirm error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get pending confirms' })
  }
})

// PUT /api/shift-swap/:id/reject - 拒绝调班申请
shiftSwapRouter.put('/:id/reject', authenticate, authorize('admin', 'manager'), scope('shiftSwap'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { adminNote } = req.body
    const processedBy = req.user!.id

    const updated = await decide('shiftSwap', id, 'rejected', processedBy, adminNote)

    res.json({
      code: 200,
      message: 'Shift swap rejected',
      data: updated,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof WorkflowConflict) return res.status(409).json({ code: 409, message: error.message })
    if (error instanceof BusinessInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Reject shift swap error:', error)
    res.status(500).json({ code: 500, message: 'Failed to reject shift swap' })
  }
})

// ========== 加班申请 ==========

// POST /api/overtime - 员工提交加班申请
overtimeRouter.post('/', authenticate, validateBody(overtimeSchema), async (req: AuthRequest, res) => {
  try {
    const { date, startTime, endTime, reason } = req.body
    const staffId = req.user!.staffId
    const storeId = req.user!.storeId

    // 计算加班小时数
    const [startHour, startMin] = startTime.split(':').map(Number)
    const [endHour, endMin] = endTime.split(':').map(Number)
    const elapsed = (endHour - startHour) + (endMin - startMin) / 60
    const hours = elapsed > 0 ? elapsed : elapsed + 24

    const overtime = await prisma.overtimeRequest.create({
      data: {
        staffId,
        storeId,
        date,
        startTime,
        endTime,
        reason,
        hours
      }
    })

    res.status(201).json({
      code: 201,
      message: 'Overtime request submitted',
      data: overtime,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof WorkflowConflict) return res.status(409).json({ code: 409, message: error.message })
    if (error instanceof BusinessInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Submit overtime error:', error)
    res.status(500).json({ code: 500, message: 'Failed to submit overtime' })
  }
})

// GET /api/overtime/my - 获取当前员工的加班申请
overtimeRouter.get('/my', authenticate, async (req: AuthRequest, res) => {
  try {
    const staffId = req.user!.staffId

    const requests = await prisma.overtimeRequest.findMany({
      where: { staffId },
      orderBy: { createdAt: 'desc' }
    })

    res.json({
      code: 200,
      data: requests,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof WorkflowConflict) return res.status(409).json({ code: 409, message: error.message })
    if (error instanceof BusinessInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Get overtime requests error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get overtime requests' })
  }
})

// GET /api/overtime - 管理端获取所有加班申请
overtimeRouter.get('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { status } = req.query

    const where: any = { storeId }
    if (status) where.status = status

    const requests = await prisma.overtimeRequest.findMany({
      where,
      include: { staff: true },
      orderBy: { createdAt: 'desc' }
    })

    res.json({
      code: 200,
      data: requests,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof WorkflowConflict) return res.status(409).json({ code: 409, message: error.message })
    if (error instanceof BusinessInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Get overtime requests error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get overtime requests' })
  }
})

// PUT /api/overtime/:id/approve - 批准加班申请
overtimeRouter.put('/:id/approve', authenticate, authorize('admin', 'manager'), scope('overtimeRequest'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { adminNote } = req.body
    const processedBy = req.user!.id

    const updated = await decide('overtimeRequest', id, 'approved', processedBy, adminNote)

    res.json({
      code: 200,
      message: 'Overtime request approved',
      data: updated,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof WorkflowConflict) return res.status(409).json({ code: 409, message: error.message })
    if (error instanceof BusinessInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Approve overtime error:', error)
    res.status(500).json({ code: 500, message: 'Failed to approve overtime' })
  }
})

// PUT /api/overtime/:id/reject - 拒绝加班申请
overtimeRouter.put('/:id/reject', authenticate, authorize('admin', 'manager'), scope('overtimeRequest'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { adminNote } = req.body
    const processedBy = req.user!.id

    const updated = await decide('overtimeRequest', id, 'rejected', processedBy, adminNote)

    res.json({
      code: 200,
      message: 'Overtime request rejected',
      data: updated,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof WorkflowConflict) return res.status(409).json({ code: 409, message: error.message })
    if (error instanceof BusinessInputError) return res.status(400).json({ code: 400, message: error.message })
    console.error('Reject overtime error:', error)
    res.status(500).json({ code: 500, message: 'Failed to reject overtime' })
  }
})

export { router as staffCorrectionRouter, shiftSwapRouter, overtimeRouter }