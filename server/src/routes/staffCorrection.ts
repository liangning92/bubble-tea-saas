import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { prisma } from '../config/database'

const router = Router()

// ========== 考勤纠错 ==========

// POST /api/staff-correction -员工提交考勤纠错申请
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { date, originalCheckIn, originalCheckOut, correctCheckIn, correctCheckOut, reason } = req.body
    const staffId = req.user!.staffId
    const storeId = req.user!.storeId

    const correction = await prisma.attendanceCorrection.create({
      data: {
        staffId,
        storeId,
        date: new Date(date),
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
    console.error('Get corrections error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get corrections' })
  }
})

// PUT /api/staff-correction/:id/approve - 批准纠错申请
router.put('/:id/approve', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { adminNote } = req.body
    const processedBy = req.user!.id

    const correction = await prisma.attendanceCorrection.findUnique({ where: { id } })
    if (!correction) {
      return res.status(404).json({ code: 404, message: 'Correction not found' })
    }

    // 更新纠错申请状态
    const updated = await prisma.attendanceCorrection.update({
      where: { id },
      data: {
        status: 'approved',
        adminNote,
        processedBy,
        processedAt: new Date()
      }
    })

    // 如果有正确的时间，更新考勤记录
    if (correction.correctCheckIn || correction.correctCheckOut) {
      const dateStr = correction.date.toISOString().slice(0, 10)
      const existing = await prisma.attendance.findFirst({
        where: {
          staffId: correction.staffId,
          checkInTime: { gte: new Date(dateStr + 'T00:00:00'), lt: new Date(dateStr + 'T23:59:59') }
        }
      })

      if (existing) {
        await prisma.attendance.update({
          where: { id: existing.id },
          data: {
            checkInTime: correction.correctCheckIn ? new Date(dateStr + 'T' + correction.correctCheckIn + ':00') : existing.checkInTime,
            checkOutTime: correction.correctCheckOut ? new Date(dateStr + 'T' + correction.correctCheckOut + ':00') : existing.checkOutTime
          }
        })
      }
    }

    res.json({
      code: 200,
      message: 'Correction approved',
      data: updated,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Approve correction error:', error)
    res.status(500).json({ code: 500, message: 'Failed to approve correction' })
  }
})

// PUT /api/staff-correction/:id/reject - 拒绝纠错申请
router.put('/:id/reject', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { adminNote } = req.body
    const processedBy = req.user!.id

    const updated = await prisma.attendanceCorrection.update({
      where: { id },
      data: {
        status: 'rejected',
        adminNote,
        processedBy,
        processedAt: new Date()
      }
    })

    res.json({
      code: 200,
      message: 'Correction rejected',
      data: updated,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Reject correction error:', error)
    res.status(500).json({ code: 500, message: 'Failed to reject correction' })
  }
})

// ========== 调班申请 ==========

// POST /api/shift-swap - 员工提交调班申请
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { originalDate, originalShift, targetDate, targetShift, reason } = req.body
    const staffId = req.user!.staffId
    const storeId = req.user!.storeId

    const swap = await prisma.shiftSwap.create({
      data: {
        staffId,
        storeId,
        originalDate: new Date(originalDate),
        originalShift,
        targetDate: new Date(targetDate),
        targetShift,
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
    console.error('Submit shift swap error:', error)
    res.status(500).json({ code: 500, message: 'Failed to submit shift swap' })
  }
})

// GET /api/shift-swap/my - 获取当前员工的调班申请
router.get('/my', authenticate, async (req: AuthRequest, res) => {
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
    console.error('Get shift swaps error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get shift swaps' })
  }
})

// GET /api/shift-swap - 管理端获取所有调班申请
router.get('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
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
    console.error('Get shift swaps error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get shift swaps' })
  }
})

// PUT /api/shift-swap/:id/approve - 批准调班申请
router.put('/:id/approve', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { adminNote } = req.body
    const processedBy = req.user!.id

    const swap = await prisma.shiftSwap.findUnique({ where: { id } })
    if (!swap) {
      return res.status(404).json({ code: 404, message: 'Shift swap not found' })
    }

    // 更新调班申请状态
    const updated = await prisma.shiftSwap.update({
      where: { id },
      data: {
        status: 'approved',
        adminNote,
        processedBy,
        processedAt: new Date()
      }
    })

    // 更新排班记录
    await prisma.schedule.updateMany({
      where: {
        staffId: swap.staffId,
        date: swap.originalDate
      },
      data: {
        date: swap.targetDate,
        shift: swap.targetShift
      }
    })

    res.json({
      code: 200,
      message: 'Shift swap approved',
      data: updated,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Approve shift swap error:', error)
    res.status(500).json({ code: 500, message: 'Failed to approve shift swap' })
  }
})

// PUT /api/shift-swap/:id/reject - 拒绝调班申请
router.put('/:id/reject', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { adminNote } = req.body
    const processedBy = req.user!.id

    const updated = await prisma.shiftSwap.update({
      where: { id },
      data: {
        status: 'rejected',
        adminNote,
        processedBy,
        processedAt: new Date()
      }
    })

    res.json({
      code: 200,
      message: 'Shift swap rejected',
      data: updated,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Reject shift swap error:', error)
    res.status(500).json({ code: 500, message: 'Failed to reject shift swap' })
  }
})

// ========== 加班申请 ==========

// POST /api/overtime - 员工提交加班申请
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { date, startTime, endTime, reason } = req.body
    const staffId = req.user!.staffId
    const storeId = req.user!.storeId

    // 计算加班小时数
    const [startHour, startMin] = startTime.split(':').map(Number)
    const [endHour, endMin] = endTime.split(':').map(Number)
    const hours = (endHour - startHour) + (endMin - startMin) / 60

    const overtime = await prisma.overtimeRequest.create({
      data: {
        staffId,
        storeId,
        date: new Date(date),
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
    console.error('Submit overtime error:', error)
    res.status(500).json({ code: 500, message: 'Failed to submit overtime' })
  }
})

// GET /api/overtime/my - 获取当前员工的加班申请
router.get('/my', authenticate, async (req: AuthRequest, res) => {
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
    console.error('Get overtime requests error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get overtime requests' })
  }
})

// GET /api/overtime - 管理端获取所有加班申请
router.get('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
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
    console.error('Get overtime requests error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get overtime requests' })
  }
})

// PUT /api/overtime/:id/approve - 批准加班申请
router.put('/:id/approve', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { adminNote } = req.body
    const processedBy = req.user!.id

    const updated = await prisma.overtimeRequest.update({
      where: { id },
      data: {
        status: 'approved',
        adminNote,
        processedBy,
        processedAt: new Date()
      }
    })

    res.json({
      code: 200,
      message: 'Overtime request approved',
      data: updated,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Approve overtime error:', error)
    res.status(500).json({ code: 500, message: 'Failed to approve overtime' })
  }
})

// PUT /api/overtime/:id/reject - 拒绝加班申请
router.put('/:id/reject', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { adminNote } = req.body
    const processedBy = req.user!.id

    const updated = await prisma.overtimeRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        adminNote,
        processedBy,
        processedAt: new Date()
      }
    })

    res.json({
      code: 200,
      message: 'Overtime request rejected',
      data: updated,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Reject overtime error:', error)
    res.status(500).json({ code: 500, message: 'Failed to reject overtime' })
  }
})

export { router as staffCorrectionRouter }